import os
from typing import Union
from .models.video import VideoManifest
from openai.types.audio.transcription import Transcription


def encode_image_base64(image_path):
    import base64

    with open(image_path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode("utf-8")


def generate_safe_dir_name(name: str) -> str:
    import re

    # Replace unsafe characters with underscores
    return re.sub(r'[<>:"/\\|?*.]', "_", name).replace(" ", "_")


def generate_transcript(audio_file_path: str, deployment: str = None):
    from dotenv import load_dotenv
    from openai import AzureOpenAI

    load_dotenv()

    if deployment is None:
        deployment = os.getenv("AZURE_OPENAI_WHISPER_DEPLOYMENT", None)
        if deployment is None:
            raise ValueError(
                "No deployment was supplied and AZURE_OPENAI_WHISPER_DEPLOYMENT environment variable is not set."
            )

    client = AzureOpenAI(
        api_key=os.getenv("AZURE_OPENAI_WHISPER_API_KEY"),
        api_version=os.getenv("AZURE_OPENAI_WHISPER_API_VERSION"),
        azure_endpoint=os.getenv("AZURE_OPENAI_WHISPER_ENDPOINT"),
    )

    with open(audio_file_path, "rb") as f:
        result = client.audio.transcriptions.create(
            file=f,
            model=deployment,
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


def validate_video_manifest(video_manifest: Union[str, VideoManifest]) -> VideoManifest:
    if isinstance(video_manifest, str):
        # check to see if the path is valid
        if os.path.isfile(video_manifest):
            with open(video_manifest, "r", encoding="utf-8") as f:
                video_manifest = VideoManifest.model_validate_json(json_data=f.read())
            return video_manifest
        else:
            raise FileNotFoundError(
                f"video_manifest file not found in {video_manifest}"
            )
    elif isinstance(video_manifest, VideoManifest):
        return video_manifest
    else:
        raise ValueError("video_manifest must be a string or a VideoManifest object")


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
