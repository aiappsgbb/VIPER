import os
import json
import time
import asyncio
from typing import Union, Type
from dotenv import load_dotenv
from openai import AzureOpenAI, AsyncAzureOpenAI

from .models.video import VideoManifest
from .analysis import AnalysisConfig
from .cobra_utils import encode_image_base64, validate_video_manifest


class VideoPreProcessor:
    # take either a video manifest object or a path to a video manifest file
    def __init__(
        self,
        video_manifest: Union[str, VideoManifest],
    ):
        pass
