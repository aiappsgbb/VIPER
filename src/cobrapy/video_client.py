import os
from typing import Dict, List, Optional, Type, Union
from ast import literal_eval
from dotenv import load_dotenv
from cobra_utils import get_file_info

from .video_preprocessor import VideoPreProcessor
from .video_analyzer import VideoAnalyzer
from .models.video import VideoManifest, SourceVideoMetadata
from .models.environment import CobraEnvironment
from .analysis import AnalysisConfig
from .cobra_utils import (
    validate_video_manifest,
    write_video_manifest,
)
from .azure_integration import AzureStorageManager, AzureSearchUploader


class VideoClient:
    manifest: VideoManifest
    video_path: str
    env_file_path: str
    env: CobraEnvironment
    preprocessor: VideoPreProcessor
    analyzer: VideoAnalyzer
    upload_to_azure: bool
    storage_manager: Optional[AzureStorageManager]
    search_uploader: Optional[AzureSearchUploader]

    def __init__(
        self,
        video_path: Union[str, None] = None,
        manifest: Union[str, VideoManifest, None] = None,
        env_file_path: str = None,
        upload_to_azure: bool = False,
        # connection_config_list: List[Dict[str, str]] = None, # Not Implemented Yet
    ):
        # Video path is required if manifest is not provided
        if video_path is None and manifest is None:
            raise ValueError(
                "You must either provide a video_path to an input video or the manifest parameter. The manifest parameter can be a string path to a manifest json file or a VideoManifest object."
            )

        # If the manifest is not provided, create a new one
        # If manifest is provided, validate it is the correct type
        if manifest is None:
            manifest = self._prepare_video_manifest(video_path)
        else:
            manifest = validate_video_manifest(manifest)

        self.manifest = manifest

        # If the environment file path is set, attempt to load the environment variables from the file
        self.env_file_path = env_file_path

        if self.env_file_path is not None:
            load_dotenv(dotenv_path=self.env_file_path, override=True)

        # Load the environment variables in the pydantic model
        self.env = CobraEnvironment()

        # Initialize the preprocessor and analyzer
        self.preprocessor = VideoPreProcessor(
            video_manifest=self.manifest, env=self.env
        )
        self.analyzer = VideoAnalyzer(
            video_manifest=self.manifest, env=self.env)
        self.upload_to_azure = upload_to_azure
        self.storage_manager = None
        self.search_uploader = None
        self.storage_artifacts: Dict[str, Union[str, Dict[str, str]]] = {}
        self.latest_search_uploads: List[Dict[str, Union[str, None]]] = []

        if self.upload_to_azure and self.env.storage.is_configured():
            try:
                self.storage_manager = AzureStorageManager(self.env)
            except ValueError as exc:
                print(f"Azure storage configuration is incomplete: {exc}")

        if self.env.search.is_configured():
            try:
                self.search_uploader = AzureSearchUploader(self.env)
            except ValueError as exc:
                print(f"Azure search configuration is incomplete: {exc}")

    def preprocess_video(
        self,
        output_directory: str = None,
        segment_length: int = 10,
        fps: float = 0.33,
        generate_transcripts_flag: bool = True,
        max_workers: int = None,
        trim_to_nearest_second=False,
        allow_partial_segments=True,
        overwrite_output=False,
    ):
        video_manifest_path = self.preprocessor.preprocess_video(
            output_directory=output_directory,
            segment_length=segment_length,
            fps=fps,
            generate_transcripts_flag=generate_transcripts_flag,
            max_workers=max_workers,
            trim_to_nearest_second=trim_to_nearest_second,
            allow_partial_segments=allow_partial_segments,
            overwrite_output=overwrite_output,
        )
        write_video_manifest(self.manifest)

        if self.storage_manager is not None:
            try:
                video_url = self.storage_manager.upload_source_video(self.manifest)
                if video_url:
                    self.storage_artifacts["video"] = video_url
            except Exception as exc:
                print(f"Failed to upload source video to Azure Storage: {exc}")

            try:
                manifest_url = self.storage_manager.upload_manifest(self.manifest)
                if manifest_url:
                    self.storage_artifacts["manifest"] = manifest_url
            except Exception as exc:
                print(f"Failed to upload manifest to Azure Storage: {exc}")

            try:
                transcript_url = self.storage_manager.upload_transcription(self.manifest)
                if transcript_url:
                    self.storage_artifacts["transcript"] = transcript_url
            except Exception as exc:
                print(f"Failed to upload transcript to Azure Storage: {exc}")

        return video_manifest_path

    def analyze_video(
        self,
        analysis_config: Type[AnalysisConfig],
        run_async=False,
        max_concurrent_tasks=None,
        reprocess_segments=False,
        metadata: Optional[Dict[str, str]] = None,
    ):

        analysis_result = self.analyzer.analyze_video(
            analysis_config=analysis_config,
            run_async=run_async,
            max_concurrent_tasks=max_concurrent_tasks,
            reprocess_segments=reprocess_segments,
        )

        if self.storage_manager is not None:
            try:
                uploaded = self.storage_manager.upload_analysis_result(
                    manifest=self.manifest,
                    analysis_name=analysis_config.name,
                    analysis_result=analysis_result,
                    output_path=self.analyzer.latest_output_path,
                )
                if uploaded:
                    analyses = self.storage_artifacts.setdefault("analysis", {})
                    analyses[analysis_config.name] = uploaded
            except Exception as exc:
                print(f"Failed to upload analysis outputs to Azure Storage: {exc}")

        analysis_name = getattr(analysis_config, "name", "")
        self.latest_search_uploads = []
        if (
            metadata
            and self.search_uploader is not None
            and analysis_name.lower() == "actionsummary"
        ):
            action_items = []
            if isinstance(analysis_result, dict) and "results" in analysis_result:
                action_items = analysis_result.get("results", []) or []
            elif isinstance(analysis_result, list):
                action_items = analysis_result

            try:
                self.latest_search_uploads = self.search_uploader.upload_action_summary_documents(
                    manifest=self.manifest,
                    action_summary=action_items,
                    metadata=metadata,
                )
            except Exception as exc:
                print(f"Failed to upload action summary to Azure AI Search: {exc}")

        return analysis_result

    def _prepare_video_manifest(self, video_path: str, **kwargs) -> VideoManifest:

        manifest = VideoManifest()

        # Check that the video file exists
        if not os.path.isfile(video_path):
            raise FileNotFoundError(f"File not found: {video_path}")
        else:
            manifest.name = os.path.basename(video_path)
            manifest.source_video.path = os.path.abspath(video_path)

        # Get video metadata
        file_metadata = get_file_info(video_path)
        if file_metadata is not None:
            manifest_source: SourceVideoMetadata = {
                "path": video_path,
                "video_found": False,
                "size": [],
                "rotation": 0,
                "fps": 0,
                "duration": 0,
                "nframes": 0,
                "audio_found": False,
                "audio_duration": 0,
                "audio_fps": 0,
            }

            if file_metadata["video_info"] is not None:
                manifest_source["video_found"] = True
                manifest_source["size"] = [file_metadata["video_info"]
                                           ["width"], file_metadata["video_info"]["height"]]
                manifest_source["fps"] = literal_eval(
                    file_metadata["video_info"]["fps"])
                manifest_source["duration"] = file_metadata["video_info"]["duration"]
                manifest_source["nframes"] = file_metadata["video_info"]["nb_frames"]
                if "rotation" in file_metadata["video_info"]["side_data_list"]:
                    manifest_source["rotation"] = file_metadata["video_info"]["side_data_list"]["rotation"]

            if file_metadata["audio_info"] is not None and file_metadata["audio_info"]["bits_per_sample"] > 0:
                manifest.source_video.audio_found = True
                manifest.source_video.audio_duration = file_metadata["audio_info"]["duration"]
                manifest.source_video.audio_fps = literal_eval(
                    file_metadata["audio_info"]["avg_frame_rate"])

            manifest.source_video = manifest.source_video.model_copy(
                update=manifest_source
            )

        return manifest
