from __future__ import annotations

import json
import logging
import os
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, ValidationError, model_validator

from ..analysis import ActionSummary, ChapterAnalysis
from ..azure_integration import AzureStorageManager
from ..models.environment import CobraEnvironment
from ..models.video import VideoManifest
from ..video_client import VideoClient


app = FastAPI(title="CobraPy Video Analysis API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],  # Your UI URLs
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)

logger = logging.getLogger(__name__)


def _serialize_for_log(data: Dict[str, Any]) -> str:
    """Convert a payload into a JSON string for structured logging."""

    try:
        return json.dumps(data, default=str)
    except TypeError:
        return str(data)


def _summarize_request(request: "BaseAnalysisRequest") -> Dict[str, Any]:
    """Return a lightweight representation of an analysis request for logging."""

    analysis_template = request.analysis_template or []
    return {
        "video_path": request.video_path,
        "manifest_path": request.manifest_path,
        "skip_preprocess": request.skip_preprocess,
        "segment_length": request.segment_length,
        "fps": request.fps,
        "max_workers": request.max_workers,
        "run_async": request.run_async,
        "reprocess_segments": request.reprocess_segments,
        "generate_transcripts": request.generate_transcripts,
        "trim_to_nearest_second": request.trim_to_nearest_second,
        "allow_partial_segments": request.allow_partial_segments,
        "upload_to_azure": request.upload_to_azure,
        "analysis_template_entries": len(analysis_template),
        "organization": request.organization,
        "collection": request.collection,
        "user": request.user,
        "video_id": request.video_id,
    }


def _summarize_manifest(manifest: VideoManifest) -> Dict[str, Any]:
    """Return a lightweight representation of a manifest for logging."""

    return {
        "name": manifest.name,
        "video_manifest_path": manifest.video_manifest_path,
        "output_directory": manifest.processing_params.output_directory,
        "segment_length": manifest.processing_params.segment_length,
        "processing_fps": manifest.processing_params.fps,
        "source_video_path": manifest.source_video.path,
        "source_video_fps": manifest.source_video.fps,
        "source_video_duration": manifest.source_video.duration,
        "segment_count": len(manifest.segments or []),
    }


_ENV_PREFIX_MAP: Dict[str, str] = {
    "vision": "AZURE_OPENAI_GPT_VISION_",
    "speech": "AZURE_SPEECH_",
    "storage": "AZURE_STORAGE_",
    "search": "AZURE_SEARCH_",
}


def _format_environment_validation_error(exc: ValidationError) -> str:
    """Create a friendly error message for missing environment variables."""

    missing: List[str] = []
    other_errors: List[str] = []

    for error in exc.errors():
        error_type = error.get("type")
        loc: Sequence[Any] = error.get("loc") or ()
        if error_type == "missing" and loc:
            prefix = ""
            if len(loc) > 1 and isinstance(loc[0], str):
                prefix = _ENV_PREFIX_MAP.get(loc[0], "")
            field_name = str(loc[-1]).upper()
            missing.append(f"{prefix}{field_name}")
        else:
            msg = error.get("msg") or str(error)
            if loc:
                location = ".".join(str(part) for part in loc)
                other_errors.append(f"{location}: {msg}")
            else:
                other_errors.append(msg)

    parts: List[str] = []
    if missing:
        parts.append(
            "Missing environment variables required for CobraPy: "
            + ", ".join(sorted(set(missing)))
            + "."
        )
    if other_errors:
        parts.append("Additional validation errors: " + "; ".join(other_errors))

    if parts:
        return " ".join(parts)

    return f"CobraPy environment validation failed: {exc}"  # pragma: no cover - fallback


class UploadResponse(BaseModel):
    local_path: str = Field(..., description="Temporary path to the uploaded file.")
    storage_url: Optional[str] = Field(
        default=None, description="Blob storage URL if the video was uploaded."
    )


class BaseAnalysisRequest(BaseModel):
    video_path: Optional[str] = Field(
        default=None, description="Path to the source video on the server."
    )
    manifest_path: Optional[str] = Field(
        default=None, description="Optional path to a pre-generated manifest."
    )
    output_directory: Optional[str] = None
    segment_length: int = 10
    fps: float = 0.33
    max_workers: Optional[int] = None
    run_async: bool = True
    overwrite_output: bool = False
    reprocess_segments: bool = False
    generate_transcripts: bool = True
    trim_to_nearest_second: bool = False
    allow_partial_segments: bool = True
    upload_to_azure: bool = True
    skip_preprocess: bool = False

    organization: str
    collection: str
    user: str
    video_id: Optional[str] = None
    organization_name: Optional[str] = Field(
        default=None, description="Human readable organization name."
    )
    collection_name: Optional[str] = Field(
        default=None, description="Human readable collection name."
    )
    user_name: Optional[str] = Field(
        default=None, description="Display name for the user initiating the run."
    )
    video_url: Optional[str] = Field(
        default=None,
        description="Optional URL where the processed video can be streamed.",
    )
    analysis_template: Optional[List[Dict[str, str]]] = Field(
        default=None,
        description="Custom template describing the JSON fields for action summary analyses.",
    )

    @model_validator(mode="after")
    def validate_source(cls, values: "BaseAnalysisRequest") -> "BaseAnalysisRequest":
        if not values.video_path and not values.manifest_path:
            raise ValueError(
                "Either 'video_path' or 'manifest_path' must be provided to run an analysis."
            )
        return values


def _create_client(request: BaseAnalysisRequest) -> VideoClient:
    logger.debug(
        "Creating VideoClient (video_path=%s, manifest_path=%s, upload_to_azure=%s)",
        request.video_path,
        request.manifest_path,
        request.upload_to_azure,
    )

    client = VideoClient(
        video_path=request.video_path,
        manifest=request.manifest_path,
        upload_to_azure=request.upload_to_azure,
    )

    logger.debug(
        "VideoClient initialized: %s",
        _serialize_for_log(_summarize_manifest(client.manifest)),
    )

    return client


def _run_preprocess(client: VideoClient, request: BaseAnalysisRequest) -> None:
    if request.skip_preprocess:
        if client.manifest.video_manifest_path:
            logger.info(
                "Skipping preprocessing for %s because an existing manifest was provided.",
                client.manifest.video_manifest_path,
            )
            return
        logger.warning(
            "Skip preprocess requested but no manifest path found; preprocessing will run.",
        )

    fps_value = _coerce_positive_float(request.fps)
    fallback_source = None

    if fps_value is None:
        candidates = [
            ("processing_params.fps", client.manifest.processing_params.fps),
            ("source_video.fps", client.manifest.source_video.fps),
        ]

        for source, candidate in candidates:
            candidate_value = _coerce_positive_float(candidate)
            if candidate_value is not None:
                fallback_source = source
                fps_value = candidate_value
                break

        if fps_value is None:
            logger.error(
                "Invalid fps value provided for preprocessing. video=%s request_fps=%s candidates=%s",
                client.manifest.name,
                request.fps,
                _serialize_for_log({source: value for source, value in candidates}),
            )
            raise HTTPException(
                status_code=400,
                detail="Invalid fps value provided. Supply a positive number.",
            )

        logger.warning(
            "Invalid fps %s received; using fallback %s from %s.",
            request.fps,
            fps_value,
            fallback_source,
        )

    logger.info(
        "Running preprocessing for %s with parameters: %s",
        client.manifest.name,
        _serialize_for_log(
            {
                "fps": fps_value,
                "segment_length": request.segment_length,
                "max_workers": request.max_workers,
                "overwrite_output": request.overwrite_output,
                "generate_transcripts": request.generate_transcripts,
                "trim_to_nearest_second": request.trim_to_nearest_second,
                "allow_partial_segments": request.allow_partial_segments,
                "output_directory": request.output_directory,
            }
        ),
    )

    try:
        client.preprocess_video(
            output_directory=request.output_directory,
            segment_length=request.segment_length,
            fps=fps_value,
            generate_transcripts_flag=request.generate_transcripts,
            max_workers=request.max_workers,
            trim_to_nearest_second=request.trim_to_nearest_second,
            allow_partial_segments=request.allow_partial_segments,
            overwrite_output=request.overwrite_output,
        )
    except Exception:
        logger.exception(
            "Video preprocessing failed for %s (video_path=%s, manifest_path=%s)",
            client.manifest.name,
            client.manifest.source_video.path,
            client.manifest.video_manifest_path,
        )
        raise
    else:
        logger.info(
            "Preprocessing completed for %s. Manifest stored at %s",
            client.manifest.name,
            client.manifest.video_manifest_path,
        )


def _analysis_response(
    client: VideoClient,
    analysis_name: str,
    result: Any,
    metadata: Optional[Dict[str, Any]] = None,
    analysis_template: Optional[List[Dict[str, str]]] = None,
) -> Dict[str, Any]:
    response: Dict[str, Any] = {
        "analysis": analysis_name,
        "result": result,
        "manifest_path": client.manifest.video_manifest_path,
        "analysis_output_path": client.analyzer.latest_output_path,
        "storage_artifacts": client.storage_artifacts,
        "search_uploads": client.latest_search_uploads,
    }
    if metadata is not None:
        response["metadata"] = metadata
    if analysis_template is not None:
        response["analysis_template"] = analysis_template
    return response


def _coerce_bool(value: Any) -> Optional[bool]:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        if value == 0:
            return False
        if value == 1:
            return True
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in {"true", "1", "yes", "on"}:
            return True
        if lowered in {"false", "0", "no", "off"}:
            return False
    return None


def _coerce_positive_float(value: Any) -> Optional[float]:
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    return result if result > 0 else None


def _apply_upload_metadata_to_manifest(
    manifest: VideoManifest, metadata: Dict[str, Any]
) -> None:
    params = manifest.processing_params

    output_directory = metadata.get("output_directory")
    if isinstance(output_directory, str):
        cleaned = output_directory.strip()
        if cleaned:
            params.output_directory = cleaned

    segment_length = metadata.get("segment_length")
    if isinstance(segment_length, (int, float)):
        try:
            params.segment_length = int(segment_length)
        except (TypeError, ValueError):
            pass

    fps = metadata.get("fps")
    if isinstance(fps, (int, float)):
        try:
            params.fps = float(fps)
        except (TypeError, ValueError):
            pass

    generate_transcripts = _coerce_bool(metadata.get("generate_transcripts"))
    if generate_transcripts is not None:
        params.generate_transcript_flag = generate_transcripts

    trim_to_nearest_second = _coerce_bool(metadata.get("trim_to_nearest_second"))
    if trim_to_nearest_second is not None:
        params.trim_to_nearest_second = trim_to_nearest_second

    allow_partial_segments = _coerce_bool(metadata.get("allow_partial_segments"))
    if allow_partial_segments is not None:
        params.allow_partial_segments = allow_partial_segments


@app.post("/videos/upload", response_model=UploadResponse)
async def upload_video(
    file: UploadFile = File(...),
    upload_to_azure: bool = Form(True),
    metadata_json: Optional[str] = Form(None),
) -> UploadResponse:
    suffix = Path(file.filename or "uploaded").suffix
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        contents = await file.read()
        tmp.write(contents)
        local_path = tmp.name

    metadata: Optional[Dict[str, Any]] = None
    if metadata_json:
        try:
            parsed = json.loads(metadata_json)
            if isinstance(parsed, dict):
                metadata = parsed
            else:  # pragma: no cover - guard against unexpected payloads
                logger.warning(
                    "Upload metadata must be a JSON object when provided."
                )
        except json.JSONDecodeError:  # pragma: no cover - guard against invalid JSON
            logger.warning("Failed to parse metadata JSON during upload", exc_info=False)

    storage_url: Optional[str] = None
    if upload_to_azure:
        manifest = VideoManifest()
        manifest.name = file.filename or os.path.basename(local_path)
        manifest.source_video.path = local_path

        if metadata:
            _apply_upload_metadata_to_manifest(manifest, metadata)

        try:
            env = CobraEnvironment()
        except ValidationError as exc:  # pragma: no cover - configuration guard
            message = _format_environment_validation_error(exc)
            logger.error("Cobra environment validation failed during upload: %s", message)
            raise HTTPException(status_code=500, detail=message) from exc
        except Exception as exc:  # pragma: no cover - unexpected initialization error
            logger.exception("Unexpected error while loading Cobra environment")
            raise HTTPException(
                status_code=500,
                detail=f"Failed to load Cobra environment: {exc}",
            ) from exc

        storage_manager: Optional[AzureStorageManager] = None
        if env.storage.is_configured():
            try:
                storage_manager = AzureStorageManager(env)
            except Exception as exc:  # pragma: no cover - initialization guard
                logger.exception("Failed to initialize Azure Storage manager")
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to initialize Azure Storage manager: {exc}",
                ) from exc

        if storage_manager is not None:
            try:
                storage_url = storage_manager.upload_source_video(manifest)
            except Exception as exc:  # pragma: no cover - best effort upload
                logger.exception("Failed to upload source video to Azure Storage")
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to upload video to Azure Storage: {exc}",
                ) from exc

    return UploadResponse(local_path=local_path, storage_url=storage_url)


@app.post("/analysis/action-summary")
def run_action_summary(request: BaseAnalysisRequest):
    request_summary = _summarize_request(request)
    logger.info(
        "Received action summary request: %s",
        _serialize_for_log(request_summary),
    )

    try:
        client = _create_client(request)
        _run_preprocess(client, request)

        metadata = {
            "organization": request.organization_name or request.organization,
            "organizationId": request.organization,
            "collection": request.collection_name or request.collection,
            "collectionId": request.collection,
            "user": request.user_name or request.user,
            "userId": request.user,
            "video_id": request.video_id or client.manifest.name,
            "contentId": request.video_id or client.manifest.name,
            "videoUrl": request.video_url,
            "source": "cobrapy",
        }

        logger.debug(
            "Prepared metadata for action summary: %s",
            _serialize_for_log(metadata),
        )

        analysis_config = (
            ActionSummary(results_template=request.analysis_template)
            if request.analysis_template
            else ActionSummary()
        )

        logger.info(
            "Invoking action summary analysis for %s (run_async=%s, max_workers=%s, reprocess_segments=%s)",
            client.manifest.name,
            request.run_async,
            request.max_workers,
            request.reprocess_segments,
        )

        result = client.analyze_video(
            analysis_config=analysis_config,
            run_async=request.run_async,
            max_concurrent_tasks=request.max_workers,
            reprocess_segments=request.reprocess_segments,
            metadata=metadata,
        )

        logger.info(
            "Action summary completed for %s. Output path=%s search_uploads=%s",
            client.manifest.name,
            client.analyzer.latest_output_path,
            len(client.latest_search_uploads),
        )

        return JSONResponse(
            _analysis_response(
                client,
                "ActionSummary",
                result,
                metadata=metadata,
                analysis_template=analysis_config.results_template,
            ),
            status_code=200,
        )
    except HTTPException as exc:
        if exc.status_code >= 500:
            logger.exception(
                "Action summary request failed with server error for %s",
                request_summary.get("video_id")
                or request_summary.get("video_path")
                or request_summary.get("manifest_path"),
            )
        else:
            logger.warning(
                "Action summary request failed with status %s for %s: %s",
                exc.status_code,
                request_summary.get("video_id")
                or request_summary.get("video_path")
                or request_summary.get("manifest_path"),
                exc.detail,
            )
        raise
    except Exception as exc:  # pragma: no cover - runtime guard
        logger.exception(
            "Unexpected error while running action summary for %s",
            request_summary.get("video_id")
            or request_summary.get("video_path")
            or request_summary.get("manifest_path"),
        )
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/analysis/chapter-analysis")
def run_chapter_analysis(request: BaseAnalysisRequest):
    try:
        client = _create_client(request)
        _run_preprocess(client, request)

        result = client.analyze_video(
            analysis_config=ChapterAnalysis(),
            run_async=request.run_async,
            max_concurrent_tasks=request.max_workers,
            reprocess_segments=request.reprocess_segments,
        )
        return JSONResponse(
            _analysis_response(client, "ChapterAnalysis", result), status_code=200
        )
    except Exception as exc:  # pragma: no cover - runtime guard
        raise HTTPException(status_code=500, detail=str(exc)) from exc
