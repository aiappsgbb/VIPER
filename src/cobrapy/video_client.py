import os
from typing import Union, Type
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


class VideoClient:
    manifest: VideoManifest
    video_path: str
    env_file_path: str
    env: CobraEnvironment
    preprocessor: VideoPreProcessor
    analyzer: VideoAnalyzer
    upload_to_azure: bool

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
        return video_manifest_path

    def analyze_video(
        self,
        analysis_config: Type[AnalysisConfig],
        run_async=False,
        max_concurrent_tasks=None,
        reprocess_segments=False,
    ):

        analysis_result = self.analyzer.analyze_video(
            analysis_config=analysis_config,
            run_async=run_async,
            max_concurrent_tasks=max_concurrent_tasks,
            reprocess_segments=reprocess_segments,
        )

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
