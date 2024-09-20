import os
import math
import time
from typing import Union, List, Dict, Optional, Type

from moviepy.editor import VideoFileClip
import numpy as np
from PIL import Image
from shutil import rmtree
import concurrent.futures
import multiprocessing
import asyncio
import nest_asyncio

from .video_preprocessor import VideoPreProcessor
from .video_analyzer import VideoAnalyzer
from .models.video import VideoManifest, Segment
from .analysis import AnalysisConfig
from .cobra_utils import (
    generate_safe_dir_name,
    generate_transcript,
    parse_transcript,
    get_elapsed_time,
    validate_video_manifest,
    write_video_manifest,
)


class VideoClient:
    manifest: VideoManifest
    video_path: str
    preprocessor: VideoPreProcessor
    analyzer: VideoAnalyzer

    def __init__(
        self,
        video_path: Union[str, None] = None,
        manifest: Union[str, VideoManifest, None] = None,
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

        # Initialize the preprocessor and analyzer
        self.preprocessor = VideoPreProcessor(self.manifest)
        self.analyzer = VideoAnalyzer(self.manifest)

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
    ) -> str:
        start_time = time.time()
        print(
            f"({get_elapsed_time(start_time)}s) Preprocessing video {self.manifest.name}"
        )

        # must have a valid video manifest
        if not isinstance(self.manifest, VideoManifest):
            raise ValueError(
                "Video manifest is not defined. Be sure you have initialized the VideoClient object with a valid video_path or manifest parameter."
            )

        # take in and update the target preprocessing parameters
        if fps is None or fps <= 0:
            raise ValueError("'fps' must be a positive number")

        if (
            segment_length is None
            or segment_length <= 0
            or segment_length > self.manifest.source_video.duration
        ):
            raise ValueError(
                "'segment_length' must be a positive number and less than the video duration"
            )

        # set the processing parameters
        print(f"({get_elapsed_time(start_time)})Setting processing parameters...")
        self.manifest.processing_params.fps = fps
        self.manifest.processing_params.segment_length = segment_length
        if self.manifest.source_video.audio_found is False:
            self.manifest.processing_params.generate_transcript_flag = False
        else:
            self.manifest.processing_params.generate_transcript_flag = (
                generate_transcripts_flag
            )
        self.manifest.processing_params.trim_to_nearest_second = trim_to_nearest_second
        self.manifest.processing_params.allow_partial_segments = allow_partial_segments

        # prepare the output directory
        print(f"({get_elapsed_time(start_time)}s) Preparing output directory")

        if output_directory is not None:
            self.manifest.processing_params.output_directory = (
                self._prepare_outputs_directory(
                    output_directory=output_directory,
                    frames_per_second=fps,
                    segment_length=segment_length,
                    overwrite_output=overwrite_output,
                )
            )
        else:
            self.manifest.processing_params.output_directory = (
                self._prepare_outputs_directory(
                    segment_length=segment_length,
                    frames_per_second=fps,
                    overwrite_output=overwrite_output,
                )
            )

        # generate the segments
        print(f"({get_elapsed_time(start_time)}s) Generating segments...")
        self._generate_segments()

        # Extract the audio
        if (
            self.manifest.source_video.audio_found
            and self.manifest.processing_params.generate_transcript_flag
        ):
            print(f"({get_elapsed_time(start_time)}s) Extracting audio...")
            # name the audio file the same thing as the video file but with a .mp3 extension
            audio_path = os.path.join(
                self.manifest.processing_params.output_directory,
                f"{self.manifest.name.split('.')[0]}.mp3",
            )

            # split the audio
            vc = VideoFileClip(self.manifest.source_video.path)
            vc.audio.write_audiofile(audio_path, verbose=False, logger=None)
            audio_file_size_mb = os.path.getsize(audio_path) / (1024 * 1024)

            # if audio file is > 25MB, we need to split and process it in chunks
            if audio_file_size_mb <= 25.0:
                self.manifest.source_audio.path = audio_path
                self.manifest.source_audio.file_size_mb = audio_file_size_mb
                transcript = generate_transcript(audio_file_path=audio_path)
                self.manifest.audio_transcription = transcript
            else:
                ###this code defines a splitting value based off of 15 MB chunks, and then uses that value to divide the runtime by that value.
                ###The result is chunking each audio segment of approx 15MB over the runtime to achieve full transcripton of audio >25MB
                splitting_value=int(audio_file_size_mb/15)
                counter=1
                transcripts=[]
                duration=vc.duration
                chunk_size=duration/splitting_value
                starting_time=0
                while(counter<splitting_value+1):
                    
                    new_audio_path = os.path.join(
                        self.manifest.processing_params.output_directory,
                        f"{self.manifest.name.split('.')[0]}_{counter}.mp3",
                    )
                    
                    subclip = vc.subclip(starting_time, chunk_size*counter)
                    subclip.audio.write_audiofile(new_audio_path, verbose=False, logger=None)
                    if(counter==1):
                        transcripts.append(generate_transcript(audio_file_path=new_audio_path))
                    else:
                        new_data=generate_transcript(audio_file_path=new_audio_path)
                        try:
                            transcripts[0].segments.extend(new_data.segments)
                            transcripts[0].text+=new_data.text
                            transcripts[0].duration+=new_data.duration
                            transcripts[0].words.extend(new_data.words)
                        except:
                            raise ValueError("Malformed Transcript data")
                    starting_time=chunk_size*counter
                    counter+=1
                

                self.manifest.source_audio.path = audio_path
                self.manifest.source_audio.file_size_mb = audio_file_size_mb
                self.manifest.audio_transcription = transcripts[0]
                # raise ValueError(
                #     f"This library currently supports up to 25MB audio file sizes. Your audio file is too large ({audio_file_size_mb}MB). Please split it into smaller files."
                # )

        # process the segements
        print(f"({get_elapsed_time(start_time)}s) Processing segments...")
        if max_workers is None:
            max_workers = max(1, multiprocessing.cpu_count() - 1)

        with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = []
            # submit the segments as tasks (futures) to the executor
            for i, segment in enumerate(self.manifest.segments):
                # create a directory for the segment
                if not os.path.exists(segment.segment_folder_path):
                    os.makedirs(segment.segment_folder_path)

                # skip segments that have already been processed
                if segment.processed:
                    continue
                futures.append(
                    executor.submit(self._preprocess_segment, segment=segment, index=i)
                )

            # as the tasks (futures) are completed, update the video manifest
            for processed_segment in concurrent.futures.as_completed(futures):
                i, res = processed_segment.result()
                self.manifest.segments[i].processed = res

        print(f"({get_elapsed_time(start_time)}s) All segments pre-processed")

        write_video_manifest(self.manifest)

        return self.manifest.video_manifest_path

    def analyze_video(
        self,
        analysis_config: Type[AnalysisConfig],
        run_async=False,
        max_concurrent_tasks=None,
    ):

        analysis_result = self.analyzer.analyze_video(
            analysis_config=analysis_config,
            run_async=run_async,
            max_concurrent_tasks=max_concurrent_tasks,
        )

        return analysis_result

    def _generate_segments(self):

        video_duration = self.manifest.source_video.duration
        segment_length = self.manifest.processing_params.segment_length
        analysis_fps = self.manifest.processing_params.fps
        trim_to_nearest_second = self.manifest.processing_params.trim_to_nearest_second
        allow_partial_segments = self.manifest.processing_params.allow_partial_segments

        # Calculate the effective duration and number of segments to create
        if trim_to_nearest_second:
            effective_duration = math.floor(video_duration)
        else:
            effective_duration = video_duration

        if allow_partial_segments:
            num_segments = math.ceil(effective_duration / segment_length)
        else:
            num_segments = math.floor(effective_duration / segment_length)

        num_segments = int(num_segments)

        self.manifest.segment_metadata = self.manifest.segment_metadata.model_copy(
            update={
                "effective_duration": effective_duration,
                "num_segments": num_segments,
            }
        )

        # Define each segment and add to the video manifest
        for i in range(num_segments):
            start_time = i * segment_length
            end_time = min((i + 1) * segment_length, effective_duration)

            # Determine how many frames should be in the segment and what time they would be at.
            segment_duration = end_time - start_time

            number_of_frames_in_segment = math.ceil(segment_duration * analysis_fps)

            segment_frames_times = np.linspace(
                start_time, end_time, number_of_frames_in_segment
            )

            segment_frames_times = [round(x, 2) for x in segment_frames_times]

            # Create a segment name and folder path
            segment_name = f"seg{i+1}_start{start_time}s_end{end_time}s"
            output_directory = self.manifest.processing_params.output_directory
            segment_folder_path = os.path.join(output_directory, segment_name)

            os.makedirs(segment_folder_path, exist_ok=True)

            self.manifest.segments.append(
                Segment(
                    segment_name=segment_name,
                    segment_folder_path=segment_folder_path,
                    start_time=start_time,
                    end_time=end_time,
                    segment_duration=segment_duration,
                    number_of_frames=number_of_frames_in_segment,
                    segment_frame_time_intervals=segment_frames_times,
                    processed=False,
                )
            )

    def _preprocess_segment(self, segment: Segment, index: int):
        stop_watch_time = time.time()

        create_transcript_flag = (
            self.manifest.processing_params.generate_transcript_flag
        )

        print(
            f"**Segment {index} {segment.segment_name} - beginning processing. Transcripts: {create_transcript_flag}"
        )

        try:
            input_video_path = self.manifest.source_video.path
            segment_path = segment.segment_folder_path
            segment_frames_times = segment.segment_frame_time_intervals
            start_time = segment.start_time
            end_time = segment.end_time

            video = VideoFileClip(input_video_path)

            # Sample and then save the segment frames as images in the "frames" directory
            frames_dir = os.path.join(segment_path, "frames")

            os.makedirs(frames_dir, exist_ok=True)
            for i, frame_time in enumerate(segment_frames_times):
                frame = video.get_frame(frame_time)

                # Convert the frame (numpy array) to an image
                frame_image = Image.fromarray(frame)

                # Save the frame as an image
                frame_filename = os.path.join(
                    frames_dir, f"frame_{i}_{frame_time}s.png"
                )
                frame_image.save(frame_filename)
                segment.segment_frames_file_path.append(frame_filename)
            print(
                f"**Segment {index} {segment.segment_name} - extracted frames in {get_elapsed_time(stop_watch_time)}"
            )

            # Extract and save the audio for the segment
            if create_transcript_flag is True:
                transcript = self.manifest.audio_transcription
                segment.transcription = parse_transcript(
                    transcript, start_time, end_time
                )
            # BDL: this is commented out in favor of extracting the transcript for the entire video, then parsing the word-level timestamps for each segment. If it appears that there are benefits to extracting individual audio clips, this would be a good way to do it.
            # if create_transcript_flag is True:
            #     subclip = video.subclip(start_time, end_time)
            #     segment_audio_filename = os.path.join(
            #         segment_path, f"audio_{start_time}s-{end_time}s.mp3"
            #     )
            #     subclip.audio.write_audiofile(
            #         segment_audio_filename, verbose=False, logger=None
            #     )

            #     print(
            #         f"**Segment {index} {segment.segment_name} - extracted and saved audio clip in {get_elapsed_time(stop_watch_time)}"
            #     )

            #     ## If generate_transcripts is True, generate a transcript for the segment
            #     transcript = generate_transcript(segment_audio_filename)
            #     # save the transcript to file and add it to the segment in the video manifest
            #     segment_transcript_filename = os.path.join(
            #         segment_path, f"transcript_{start_time}s-{end_time}s.txt"
            #     )
            #     with open(segment_transcript_filename, "w", encoding="utf-8") as f:
            #         f.write(transcript)

            #     self.manifest.segments[index].transcription = transcript

            #     print(
            #         f"**Segment {index} {segment.segment_name} - generated transcript in {get_elapsed_time(stop_watch_time)}"
            #     )
            else:
                self.manifest.segments[index].transcription = (
                    "No transcript for this segment."
                )

            return index, True
        except Exception as e:
            print(f"Error processing segment {segment.segment_name}: {e}")
            return index, False

    def _prepare_video_manifest(self, video_path: str, **kwargs) -> VideoManifest:

        manifest = VideoManifest()

        # Check that the video file exists
        if not os.path.isfile(video_path):
            raise FileNotFoundError(f"File not found: {video_path}")
        else:
            manifest.name = os.path.basename(video_path)
            manifest.source_video.path = os.path.abspath(video_path)

        # Get video metadata
        with VideoFileClip(video_path) as video_file_clip:
            manifest_source = {
                "video_found": video_file_clip.reader.infos["video_found"],
                "size": video_file_clip.size,
                "rotation": video_file_clip.rotation,
                "fps": video_file_clip.fps,
                "duration": video_file_clip.duration,
                "nframes": video_file_clip.reader.nframes,
                "audio_found": video_file_clip.reader.infos["audio_found"],
            }

            if video_file_clip.reader.infos["audio_found"] is True:
                manifest_source["audio_duration"] = video_file_clip.audio.duration
                manifest_source["audio_fps"] = video_file_clip.audio.fps

            manifest.source_video = manifest.source_video.model_copy(
                update=manifest_source
            )

        return manifest

    def _prepare_outputs_directory(
        self,
        segment_length: int,
        frames_per_second: float,
        output_directory: Optional[str] = None,
        overwrite_output=False,
        output_directory_prefix="",
    ):

        if output_directory is None:
            safe_dir_name = generate_safe_dir_name(self.manifest.name)
            asset_directory_name = f"{output_directory_prefix}{safe_dir_name}_{frames_per_second:.2f}fps_{segment_length}sSegs_cobra"
            asset_directory_path = os.path.join(
                ".",
                asset_directory_name,
            )
        else:
            asset_directory_path = output_directory

        # Create output directory if it doesn't exist. If it does exist, check if we should overwrite it
        if not os.path.exists(asset_directory_path):
            os.makedirs(asset_directory_path)
        else:
            if overwrite_output is True:
                # delete the directory and all of its contents
                rmtree(asset_directory_path)
                os.makedirs(asset_directory_path)
            else:
                raise FileExistsError(
                    f"Directory already exists: {asset_directory_path}. If you would like to overwrite it, set overwrite_output=True"
                )
        return asset_directory_path
