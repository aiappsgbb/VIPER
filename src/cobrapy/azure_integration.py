from __future__ import annotations

import json
import os
from typing import Any, Dict, List, Optional, Sequence
from uuid import uuid4

from azure.core.credentials import AzureKeyCredential, AzureNamedKeyCredential
from azure.core.exceptions import ResourceExistsError
from azure.identity import DefaultAzureCredential
from azure.search.documents import SearchClient
from azure.storage.blob import BlobServiceClient, ContentSettings

from .cobra_utils import generate_safe_dir_name
from .models.environment import CobraEnvironment
from .models.video import VideoManifest


class AzureStorageManager:
    """Handles storing source videos and generated artefacts in Azure Storage."""

    def __init__(self, env: CobraEnvironment):
        self.config = env.storage
        if not self.config.is_configured():
            raise ValueError("Azure Storage configuration is not defined")

        self._client = self._create_blob_service_client()
        self.video_container = self.config.video_container or self.config.output_container
        self.output_container = self.config.output_container or self.video_container

        if not self.video_container:
            raise ValueError(
                "AZURE_STORAGE_VIDEO_CONTAINER or AZURE_STORAGE_OUTPUT_CONTAINER must be configured"
            )

        self._ensure_container(self.video_container)
        if self.output_container:
            self._ensure_container(self.output_container)

    def _create_blob_service_client(self) -> BlobServiceClient:
        if self.config.connection_string:
            return BlobServiceClient.from_connection_string(
                self.config.connection_string.get_secret_value()
            )

        if not self.config.account_url:
            raise ValueError(
                "AZURE_STORAGE_ACCOUNT_URL must be provided when using managed identity or account keys"
            )

        credential = None
        if self.config.account_key and self.config.account_name:
            credential = AzureNamedKeyCredential(
                self.config.account_name,
                self.config.account_key.get_secret_value(),
            )
        else:
            credential = DefaultAzureCredential(
                managed_identity_client_id=self.config.managed_identity_client_id
            )

        return BlobServiceClient(account_url=self.config.account_url, credential=credential)

    def _ensure_container(self, container_name: Optional[str]) -> None:
        if not container_name:
            return
        try:
            self._client.create_container(container_name)
        except ResourceExistsError:
            pass

    def _upload_file(self, container: str, file_path: str, blob_name: str) -> str:
        blob_client = self._client.get_blob_client(container=container, blob=blob_name)
        with open(file_path, "rb") as data:
            blob_client.upload_blob(data, overwrite=True)
        return blob_client.url

    def _upload_json(self, container: str, blob_name: str, payload: Any) -> str:
        blob_client = self._client.get_blob_client(container=container, blob=blob_name)
        data = json.dumps(payload, indent=2, default=str).encode("utf-8")
        blob_client.upload_blob(
            data,
            overwrite=True,
            content_settings=ContentSettings(content_type="application/json"),
        )
        return blob_client.url

    def upload_source_video(self, manifest: VideoManifest) -> Optional[str]:
        video_path = manifest.source_video.path
        if not video_path or not os.path.exists(video_path):
            return None
        blob_name = os.path.join(
            generate_safe_dir_name(manifest.name),
            "source",
            os.path.basename(video_path),
        )
        return self._upload_file(self.video_container, video_path, blob_name)

    def upload_manifest(self, manifest: VideoManifest) -> Optional[str]:
        if not manifest.video_manifest_path or not os.path.exists(
            manifest.video_manifest_path
        ):
            return None
        if not self.output_container:
            return None
        blob_name = os.path.join(
            generate_safe_dir_name(manifest.name),
            "manifests",
            os.path.basename(manifest.video_manifest_path),
        )
        return self._upload_file(self.output_container, manifest.video_manifest_path, blob_name)

    def upload_transcription(self, manifest: VideoManifest) -> Optional[str]:
        if manifest.audio_transcription is None or not self.output_container:
            return None
        blob_name = os.path.join(
            generate_safe_dir_name(manifest.name),
            "transcripts",
            "audio_transcript.json",
        )
        return self._upload_json(
            self.output_container,
            blob_name,
            manifest.audio_transcription.model_dump(),
        )

    def upload_analysis_result(
        self,
        manifest: VideoManifest,
        analysis_name: str,
        analysis_result: Any,
        output_path: Optional[str] = None,
    ) -> Dict[str, str]:
        if not self.output_container:
            return {}

        safe_name = generate_safe_dir_name(manifest.name)
        analysis_folder = os.path.join(safe_name, "analysis", analysis_name)
        uploaded: Dict[str, str] = {}

        if output_path and os.path.exists(output_path):
            blob_name = os.path.join(analysis_folder, os.path.basename(output_path))
            uploaded["file"] = self._upload_file(
                self.output_container, output_path, blob_name
            )

        if analysis_result is not None:
            blob_name = os.path.join(analysis_folder, "result.json")
            uploaded["json"] = self._upload_json(
                self.output_container, blob_name, analysis_result
            )

        return uploaded


class AzureSearchUploader:
    """Uploads generated summaries to Azure AI Search."""

    def __init__(self, env: CobraEnvironment):
        self.config = env.search
        if not self.config.is_configured():
            self._client = None
            return

        if self.config.api_key:
            credential = AzureKeyCredential(self.config.api_key.get_secret_value())
        else:
            credential = DefaultAzureCredential(
                managed_identity_client_id=self.config.managed_identity_client_id
            )

        self._client = SearchClient(
            endpoint=self.config.endpoint,
            index_name=self.config.index_name,
            credential=credential,
        )

    def upload_action_summary_documents(
        self,
        manifest: VideoManifest,
        action_summary: Sequence[Dict[str, Any]],
        metadata: Dict[str, Any],
    ) -> List[Dict[str, Any]]:
        if not self._client:
            return []

        documents: List[Dict[str, Any]] = []
        safe_name = generate_safe_dir_name(manifest.name)

        for index, entry in enumerate(action_summary):
            if not isinstance(entry, dict):
                continue

            document = {
                "id": str(uuid4()),
                "videoName": manifest.name,
                "videoSlug": safe_name,
                "segmentIndex": entry.get("_segment_index", index),
                "segmentName": entry.get("_segment_name"),
                "segmentEntryIndex": entry.get("_segment_entry_index"),
                "startTimestamp": entry.get("start_timestamp"),
                "endTimestamp": entry.get("end_timestamp"),
                "sceneTheme": entry.get("scene_theme"),
                "summary": entry.get("summary"),
                "actions": entry.get("actions"),
                "characters": entry.get("characters"),
                "keyObjects": entry.get("key_objects"),
                "sentiment": entry.get("sentiment"),
                "organization": metadata.get("organization"),
                "collection": metadata.get("collection"),
                "user": metadata.get("user"),
                "videoId": metadata.get("video_id", manifest.name),
                "source": metadata.get("source", "cobrapy"),
                "content": json.dumps(entry, default=str),
            }
            documents.append(document)

        if not documents:
            return []

        results = self._client.upload_documents(documents=documents)
        response: List[Dict[str, Any]] = []
        for document, status in zip(documents, results):
            record = {**document}
            record["uploadStatus"] = "succeeded" if status.succeeded else "failed"
            record["errorMessage"] = getattr(status, "error_message", None)
            response.append(record)
        return response
