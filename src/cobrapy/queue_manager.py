from __future__ import annotations

import logging
import os
import threading
import time
from contextlib import AbstractContextManager
from dataclasses import dataclass
from queue import Full, Queue
from typing import Any, Callable, Optional

from concurrent.futures import Future


logger = logging.getLogger(__name__)


def _env_int(name: str, default: int, minimum: int = 1) -> int:
    """Parse an integer environment variable with a fallback."""

    value = os.getenv(name)
    if value is None:
        return default

    try:
        parsed = int(value)
    except (TypeError, ValueError):
        logger.warning("Invalid value for %s=%r; using default %s", name, value, default)
        return default

    if parsed < minimum:
        logger.warning(
            "Value for %s=%s below minimum %s; clamping to %s", name, parsed, minimum, minimum
        )
        return minimum

    return parsed


@dataclass(frozen=True)
class AnalysisQueueConfig:
    """Configuration describing queue throughput and resource limits."""

    max_concurrent_jobs: int = _env_int("COBRA_MAX_CONCURRENT_ANALYSES", 2)
    max_pending_jobs: int = _env_int("COBRA_MAX_PENDING_ANALYSIS_JOBS", 50, minimum=0)
    max_preprocess_workers: int = _env_int("COBRA_MAX_PREPROCESS_WORKERS", 4)
    default_preprocess_workers: int = _env_int("COBRA_DEFAULT_PREPROCESS_WORKERS", 2)
    tokens_per_minute: int = _env_int("COBRA_TOKENS_PER_MINUTE_LIMIT", 1_000_000)
    base_tokens_per_request: int = _env_int("COBRA_BASE_TOKENS_PER_REQUEST", 9_000)
    tokens_per_segment: int = _env_int("COBRA_TOKENS_PER_SEGMENT", 450)
    lens_chars_per_token: int = _env_int("COBRA_LENS_CHARS_PER_TOKEN", 4)
    max_lens_token_bonus: int = _env_int("COBRA_MAX_LENS_TOKEN_BONUS", 2_000, minimum=0)


class QueueFullError(RuntimeError):
    """Raised when a new request cannot be enqueued because the queue is saturated."""


class TokenBucket:
    """Simple token bucket limiter to enforce the TPM budget."""

    def __init__(self, capacity: int, refill_period_seconds: float = 60.0) -> None:
        if capacity <= 0:
            raise ValueError("Token bucket capacity must be positive")

        self.capacity = capacity
        self._tokens = float(capacity)
        self._refill_period = float(refill_period_seconds)
        self._lock = threading.Lock()
        self._condition = threading.Condition(self._lock)
        self._last_refill = time.monotonic()

    def _refill_locked(self) -> None:
        now = time.monotonic()
        elapsed = now - self._last_refill
        if elapsed <= 0:
            return

        refill_rate = self.capacity / self._refill_period
        self._tokens = min(self.capacity, self._tokens + elapsed * refill_rate)
        self._last_refill = now

    def acquire(self, tokens: int) -> None:
        if tokens <= 0:
            return

        with self._condition:
            while True:
                self._refill_locked()
                if tokens <= self._tokens:
                    self._tokens -= tokens
                    logger.debug(
                        "Token bucket granted %s tokens (remaining=%s)",
                        tokens,
                        int(self._tokens),
                    )
                    return

                deficit = tokens - self._tokens
                refill_rate = self.capacity / self._refill_period
                sleep_time = max(deficit / refill_rate, 0.05)
                logger.debug(
                    "Token bucket waiting %.2fs for %s tokens (deficit=%.2f)",
                    sleep_time,
                    tokens,
                    deficit,
                )
                self._condition.wait(timeout=sleep_time)


class _TokenReservation(AbstractContextManager):
    def __init__(self, bucket: TokenBucket, tokens: int) -> None:
        self._bucket = bucket
        self._tokens = tokens

    def __enter__(self) -> "_TokenReservation":
        self._bucket.acquire(self._tokens)
        return self

    def __exit__(self, exc_type, exc, exc_tb) -> bool:
        # Tokens are considered spent once acquired; nothing to release.
        return False


class _AnalysisJob:
    def __init__(
        self,
        work: Callable[[], Any],
        description: str,
        future: Future,
    ) -> None:
        self.work = work
        self.description = description
        self.future = future


class AnalysisQueue:
    """Threaded work queue that meters CPU load and token usage."""

    def __init__(self, config: Optional[AnalysisQueueConfig] = None) -> None:
        self.config = config or AnalysisQueueConfig()

        if self.config.max_concurrent_jobs <= 0:
            raise ValueError("max_concurrent_jobs must be positive")

        queue_size = 0 if self.config.max_pending_jobs <= 0 else self.config.max_pending_jobs
        self._queue: "Queue[Optional[_AnalysisJob]]" = Queue(maxsize=queue_size)
        self._token_bucket = TokenBucket(self.config.tokens_per_minute)
        self._shutdown = False
        self._workers = []

        for index in range(self.config.max_concurrent_jobs):
            worker = threading.Thread(
                target=self._worker, name=f"analysis-worker-{index+1}", daemon=True
            )
            worker.start()
            self._workers.append(worker)

    def _worker(self) -> None:
        while True:
            job = self._queue.get()
            if job is None:
                self._queue.task_done()
                break

            try:
                logger.debug("Worker %s started job %s", threading.current_thread().name, job.description)
                result = job.work()
            except Exception as exc:  # pragma: no cover - defensive guard
                job.future.set_exception(exc)
                logger.exception("Analysis job %s failed", job.description)
            else:
                job.future.set_result(result)
                logger.debug(
                    "Worker %s finished job %s", threading.current_thread().name, job.description
                )
            finally:
                self._queue.task_done()

    def shutdown(self, wait: bool = True) -> None:
        if self._shutdown:
            return

        self._shutdown = True
        for _ in self._workers:
            self._queue.put(None)

        if wait:
            for worker in self._workers:
                worker.join()

    def submit(self, work: Callable[[], Any], description: str = "analysis") -> Future:
        if self._shutdown:
            raise RuntimeError("AnalysisQueue has been shut down")

        future: Future = Future()
        job = _AnalysisJob(work=work, description=description, future=future)

        try:
            self._queue.put(job, block=False)
        except Full as exc:
            logger.warning("Queue is full; rejecting job %s", description)
            raise QueueFullError("Analysis queue is full") from exc

        logger.debug("Enqueued job %s (pending=%s)", description, self._queue.qsize())
        return future

    def execute(self, work: Callable[[], Any], description: str = "analysis") -> Any:
        future = self.submit(work=work, description=description)
        return future.result()

    def clamp_max_workers(self, requested: Optional[int]) -> int:
        if requested is None or requested <= 0:
            return self.config.default_preprocess_workers

        return min(requested, self.config.max_preprocess_workers)

    def estimate_tokens(self, manifest: Any, analysis_lens: Optional[str] = None) -> int:
        segments = getattr(manifest, "segments", None) or []
        segment_count = len(segments)

        if segment_count == 0:
            metadata = getattr(manifest, "segment_metadata", None)
            segment_count = getattr(metadata, "num_segments", 0) or 0

        tokens = self.config.base_tokens_per_request + segment_count * self.config.tokens_per_segment

        if analysis_lens:
            approx_tokens = max(len(analysis_lens) // max(self.config.lens_chars_per_token, 1), 0)
            tokens += min(approx_tokens, self.config.max_lens_token_bonus)

        return min(tokens, self._token_bucket.capacity)

    def consume_tokens(self, tokens: int) -> AbstractContextManager[Any]:
        return _TokenReservation(self._token_bucket, tokens)

    def pending_jobs(self) -> int:
        return self._queue.qsize()


_ANALYSIS_QUEUE: Optional[AnalysisQueue] = None
_QUEUE_LOCK = threading.Lock()


def get_analysis_queue() -> AnalysisQueue:
    global _ANALYSIS_QUEUE
    if _ANALYSIS_QUEUE is None:
        with _QUEUE_LOCK:
            if _ANALYSIS_QUEUE is None:
                _ANALYSIS_QUEUE = AnalysisQueue()
    return _ANALYSIS_QUEUE

