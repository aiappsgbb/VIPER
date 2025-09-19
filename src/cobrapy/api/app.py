from __future__ import annotations

import os
import tempfile
from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, model_validator

from ..analysis import ActionSummary, ChapterAnalysis
from ..azure_integration import AzureStorageManager
from ..models.environment import CobraEnvironment
from ..models.video import VideoManifest
from ..video_client import VideoClient


app = FastAPI(title="CobraPy Video Analysis API")


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
    return response


@app.post("/videos/upload", response_model=UploadResponse)
async def upload_video(
    file: UploadFile = File(...),
    upload_to_azure: bool = Form(True),
) -> UploadResponse:
    suffix = Path(file.filename or "uploaded").suffix
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        contents = await file.read()
        tmp.write(contents)
        local_path = tmp.name

    storage_url: Optional[str] = None
    if upload_to_azure:
        try:
            manifest = VideoManifest()
            manifest.name = file.filename or os.path.basename(local_path)
            manifest.source_video.path = local_path
            env = CobraEnvironment()
            storage_manager = None
            if env.storage.is_configured():
                storage_manager = AzureStorageManager(env)
            if storage_manager is not None:
                storage_url = storage_manager.upload_source_video(manifest)
        except Exception as exc:  # pragma: no cover - best effort upload
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

        result = client.analyze_video(
            analysis_config=ActionSummary(),
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
