import sys
import threading
import time
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC_ROOT = PROJECT_ROOT / "src"
if str(SRC_ROOT) not in sys.path:
    sys.path.insert(0, str(SRC_ROOT))

from cobrapy.queue_manager import (  # noqa: E402
    AnalysisQueue,
    AnalysisQueueConfig,
    QueueFullError,
)


class StubManifest:
    def __init__(self, segment_count: int) -> None:
        self.segments = [object() for _ in range(segment_count)]
        self.segment_metadata = type("Meta", (), {"num_segments": segment_count})()


def make_queue(**overrides):
    config = AnalysisQueueConfig(
        max_concurrent_jobs=overrides.get("max_concurrent_jobs", 1),
        max_pending_jobs=overrides.get("max_pending_jobs", 2),
        max_preprocess_workers=overrides.get("max_preprocess_workers", 3),
        default_preprocess_workers=overrides.get("default_preprocess_workers", 2),
        tokens_per_minute=overrides.get("tokens_per_minute", 10_000),
        base_tokens_per_request=overrides.get("base_tokens_per_request", 5_000),
        tokens_per_segment=overrides.get("tokens_per_segment", 300),
        lens_chars_per_token=overrides.get("lens_chars_per_token", 4),
        max_lens_token_bonus=overrides.get("max_lens_token_bonus", 1_000),
    )
    return AnalysisQueue(config=config)


def test_clamp_max_workers_defaults_to_queue_limit():
    queue = make_queue(max_preprocess_workers=4, default_preprocess_workers=2)
    try:
        assert queue.clamp_max_workers(None) == 2
        assert queue.clamp_max_workers(1) == 1
        assert queue.clamp_max_workers(10) == 4
    finally:
        queue.shutdown()


def test_estimate_tokens_accounts_for_segments_and_lens():
    queue = make_queue(base_tokens_per_request=2_000, tokens_per_segment=500, max_lens_token_bonus=600)
    manifest = StubManifest(segment_count=10)
    try:
        estimate_without_lens = queue.estimate_tokens(manifest)
        estimate_with_lens = queue.estimate_tokens(manifest, "focus on defensive plays and turnovers")

        assert estimate_without_lens == 2_000 + 10 * 500
        assert estimate_with_lens >= estimate_without_lens
        assert estimate_with_lens - estimate_without_lens <= 600
    finally:
        queue.shutdown()


def test_execute_honors_concurrency_limit():
    queue = make_queue(max_concurrent_jobs=1)
    start_order = []
    finish_order = []
    start_events = [threading.Event() for _ in range(3)]
    release_events = [threading.Event() for _ in range(3)]

    def make_job(index: int):
        def _job():
            start_order.append(index)
            start_events[index].set()
            release_events[index].wait()
            finish_order.append(index)
            return index

        return _job

    try:
        future0 = queue.submit(make_job(0), description="job-0")
        assert start_events[0].wait(timeout=1)

        future1 = queue.submit(make_job(1), description="job-1")
        time.sleep(0.05)
        assert not start_events[1].is_set()

        release_events[0].set()
        assert future0.result(timeout=1) == 0
        assert start_events[1].wait(timeout=1)

        future2 = queue.submit(make_job(2), description="job-2")
        time.sleep(0.05)
        assert not start_events[2].is_set()

        release_events[1].set()
        assert future1.result(timeout=1) == 1
        assert start_events[2].wait(timeout=1)

        release_events[2].set()
        assert future2.result(timeout=1) == 2

        assert start_order == [0, 1, 2]
        assert finish_order == [0, 1, 2]
    finally:
        queue.shutdown()


def test_queue_full_error_when_pending_capacity_reached():
    queue = make_queue(max_concurrent_jobs=1, max_pending_jobs=1)
    start_event = threading.Event()
    release_event = threading.Event()

    def blocking_job():
        start_event.set()
        release_event.wait()
        return "done"

    try:
        future1 = queue.submit(blocking_job, description="blocking")
        start_event.wait(timeout=1)

        future2 = queue.submit(lambda: "second", description="second")

        with pytest.raises(QueueFullError):
            queue.submit(lambda: "third", description="third")

        release_event.set()
        assert future1.result(timeout=1) == "done"
        assert future2.result(timeout=1) == "second"
    finally:
        queue.shutdown()
