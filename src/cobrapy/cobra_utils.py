import os
from typing import Union
from .models.video import VideoManifest
from .models.environment import CobraEnvironment
from openai.types.audio.transcription import Transcription
import subprocess
import concurrent.futures
from shutil import rmtree
from typing import Union, Optional


def encode_image_base64(image_path):
    import base64

    with open(image_path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode("utf-8")


def generate_safe_dir_name(name: str) -> str:
    import re

    # Replace unsafe characters with underscores
    return re.sub(r'[<>:"/\\|?*.]', "_", name).replace(" ", "_")


def generate_transcript(audio_file_path: str, env: CobraEnvironment):
    from openai import AzureOpenAI

    client = AzureOpenAI(
        api_key=env.whisper.api_key.get_secret_value(),
        api_version=env.whisper.api_version,
        azure_endpoint=env.whisper.endpoint,
    )

    with open(audio_file_path, "rb") as f:
        result = client.audio.transcriptions.create(
            file=f,
            model=env.whisper.deployment,
            response_format="verbose_json",
            timestamp_granularities=["word", "segment"],
        )
    return result


def parse_transcript(
    transcripton_object: Transcription, start_time: float, end_time: float
):
    # throw an error if not the correct type
    if not isinstance(transcripton_object, Transcription):
        raise TypeError("The object passed is not of the correct type.")

    # if the start time is greater than the end time, throw an error
    if start_time > end_time:
        raise ValueError("The start time is greater than the end time.")

    # if the start time is less than 0, throw an error
    if start_time < 0:
        raise ValueError("The start time is less than 0.")

    words = [
        word["word"]
        for word in transcripton_object.words
        if word["start"] > start_time and word["end"] <= end_time
    ]

    return " ".join(words)


def get_file_info(video_path):
    cmd = [
        "ffprobe",
        "-i", video_path,
        "-print_format", "json",
        "-show_format",
        "-show_streams",
        "-hide_banner",
    ]

    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True, check=True)
    except subprocess.CalledProcessError as e:
        print(
            f"Failed to get info for file {video_path}\n"
            f"{e.stderr}", end='', flush=True)
        return None

    file_info = {}

    for stream in result.stdout["streams"]:
        if stream["codec_type"] == "video":
            file_info["video_info"] = stream
        if stream["codec_type"] == "audio":
            file_info["audio_info"] = stream

    return file_info


def segment_and_extract(
    start_time, end_time, input_video_path, segment_path, frames_dir, fps
):
    segment_file_name = "segment.mp4"
    segment_video_path = os.path.join(segment_path, segment_file_name)
    cmd_extract_segment = [
        "ffmpeg",
        "-ss",
        str(start_time),
        "-to",
        str(end_time),
        "-i",
        input_video_path,
        "-c",
        "copy",
        segment_video_path,
        "-hide_banner",
        "-loglevel",
        "error",
    ]
    subprocess.run(cmd_extract_segment, check=True)

    # Now extract frames from the segment video using the fps filter
    output_pattern = os.path.join(frames_dir, "frame_%05d.jpg")
    cmd_extract_frames = [
        "ffmpeg",
        "-i",
        segment_video_path,
        "-vf",
        f"fps={fps}",
        "-q:v",
        "2",  # Adjust quality if needed
        output_pattern,
        "-hide_banner",
        "-loglevel",
        "error",
    ]
    subprocess.run(cmd_extract_frames, check=True)


def extract_base_audio(video_path, audio_path):
    cmd = [
        "ffmpeg",
        "-i",
        video_path,
        "-q:a",
        "0",
        "-map",
        "a",
        audio_path,
        "-y",  # Overwrite output file if it exists
        "-hide_banner",
        "-loglevel",
        "error",
    ]
    subprocess.run(cmd, check=True)


def extract_audio_chunk(args):
    video_path, start, end, audio_chunk_path = args
    cmd = [
        "ffmpeg",
        "-i",
        video_path,
        "-ss",
        str(start),
        "-to",
        str(end),
        "-q:a",
        "0",
        "-map",
        "a",
        audio_chunk_path,
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
    ]
    subprocess.run(cmd, check=True)
    return audio_chunk_path, start


def parallelize_audio(extract_args_list, max_workers):
    print(
        f"Extracting audio chunks in parallel using {max_workers} workers...")
    with concurrent.futures.ProcessPoolExecutor(max_workers=max_workers) as executor:
        extracted_chunks = list(executor.map(
            extract_audio_chunk, extract_args_list))
        return extracted_chunks


def parallelize_transcription(process_args_list):
    # Process audio chunks in parallel
    print(f"Processing audio chunks in parallel using {2} workers...")
    with concurrent.futures.ProcessPoolExecutor(max_workers=2) as executor:
        transcripts = list(executor.map(process_chunk, process_args_list))

    # Combine transcripts
    combined_transcript = transcripts[0]
    for transcript in transcripts[1:]:
        combined_transcript.words.extend(transcript.words)
        combined_transcript.segments.extend(transcript.segments)
        combined_transcript.text += transcript.text
        combined_transcript.duration += transcript.duration
    return combined_transcript


def process_chunk(args):
    audio_chunk_path, start_time = args
    envs=CobraEnvironment()
    transcript = generate_transcript(audio_file_path=audio_chunk_path,env=envs)
    # Adjust timestamps
    for word in transcript.words:
        word["start"] += start_time
        word["end"] += start_time
    for segment in transcript.segments:
        segment["start"] += start_time
        segment["end"] += start_time
    return transcript


def validate_video_manifest(video_manifest: Union[str, VideoManifest]) -> VideoManifest:
    if isinstance(video_manifest, str):
        # check to see if the path is valid
        if os.path.isfile(video_manifest):
            with open(video_manifest, "r", encoding="utf-8") as f:
                video_manifest = VideoManifest.model_validate_json(
                    json_data=f.read())
            return video_manifest
        else:
            raise FileNotFoundError(
                f"video_manifest file not found in {video_manifest}"
            )
    elif isinstance(video_manifest, VideoManifest):
        return video_manifest
    else:
        raise ValueError(
            "video_manifest must be a string or a VideoManifest object")


def get_elapsed_time(start_time):
    import time

    elapsed = time.time() - start_time
    return "{:.1f}s".format(elapsed)


def write_video_manifest(manifest):
    video_manifest_path = os.path.join(
        manifest.processing_params.output_directory, f"_video_manifest.json"
    )
    with open(video_manifest_path, "w", encoding="utf-8") as f:
        f.write(manifest.model_dump_json(indent=4))

    print(f"Video manifest for {manifest.name} saved to {video_manifest_path}")

    manifest.video_manifest_path = video_manifest_path


def prepare_outputs_directory(
    file_name: str,
    segment_length: int,
    frames_per_second: float,
    output_directory: Optional[str] = None,
    overwrite_output=False,
    output_directory_prefix="",
):

    if output_directory is None:
        safe_dir_name = generate_safe_dir_name(file_name)
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
