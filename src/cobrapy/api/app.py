from __future__ import annotations

import json
import logging
import os
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, ValidationError, model_validator

from ..analysis import ActionSummary, ChapterAnalysis
from ..azure_integration import AzureStorageManager
from ..models.environment import CobraEnvironment
from ..models.video import VideoManifest
from ..video_client import VideoClient


app = FastAPI(title="CobraPy Video Analysis API")


logger = logging.getLogger(__name__)


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
    return VideoClient(
        video_path=request.video_path,
        manifest=request.manifest_path,
        upload_to_azure=request.upload_to_azure,
    )


def _run_preprocess(client: VideoClient, request: BaseAnalysisRequest) -> None:
    if request.skip_preprocess and client.manifest.video_manifest_path:
        return

    client.preprocess_video(
        output_directory=request.output_directory,
        segment_length=request.segment_length,
        fps=request.fps,
        generate_transcripts_flag=request.generate_transcripts,
        max_workers=request.max_workers,
        trim_to_nearest_second=request.trim_to_nearest_second,
        allow_partial_segments=request.allow_partial_segments,
        overwrite_output=request.overwrite_output,
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

        analysis_config = (
            ActionSummary(results_template=request.analysis_template)
            if request.analysis_template
            else ActionSummary()
        )

        result = client.analyze_video(
            analysis_config=analysis_config,
            run_async=request.run_async,
            max_concurrent_tasks=request.max_workers,
            reprocess_segments=request.reprocess_segments,
            metadata=metadata,
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
    except Exception as exc:  # pragma: no cover - runtime guard
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
