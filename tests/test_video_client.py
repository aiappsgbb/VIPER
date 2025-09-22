import sys
from pathlib import Path

import pytest


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC_ROOT = PROJECT_ROOT / "src"
if str(SRC_ROOT) not in sys.path:
    sys.path.insert(0, str(SRC_ROOT))

from cobrapy import video_client as video_client_module  # noqa: E402
from cobrapy.video_client import VideoClient  # noqa: E402


def _build_file_metadata(audio_info: dict) -> dict:
    return {
        "video_info": {
            "width": 1920,
            "height": 1080,
            "fps": "30/1",
            "duration": "10.0",
            "nb_frames": "300",
        },
        "audio_info": audio_info,
    }


@pytest.fixture(autouse=True)
def _set_speech_region(monkeypatch):
    monkeypatch.setenv("AZURE_SPEECH_REGION", "unit-test-region")


def test_prepare_manifest_detects_audio_without_bits_per_sample(monkeypatch, tmp_path):
    video_path = tmp_path / "demo.mp4"
    video_path.write_bytes(b"0")

    metadata = _build_file_metadata(
        {
            "codec_type": "audio",
            "duration": "5.25",
            "avg_frame_rate": "48000/1",
            "channels": "2",
        }
    )

    monkeypatch.setattr(video_client_module, "get_file_info", lambda path: metadata)

    client = VideoClient(video_path=str(video_path))

    source = client.manifest.source_video
    assert source.audio_found is True
    assert source.audio_duration == pytest.approx(5.25)
    assert source.audio_fps == pytest.approx(48000.0)


def test_prepare_manifest_detects_audio_from_channel_count(monkeypatch, tmp_path):
    video_path = tmp_path / "demo_no_codec.mp4"
    video_path.write_bytes(b"0")

    metadata = _build_file_metadata(
        {
            "channels": "1",
            "sample_rate": "16000",
            "duration": "2.0",
            "avg_frame_rate": "16000/1",
        }
    )

    monkeypatch.setattr(video_client_module, "get_file_info", lambda path: metadata)

    client = VideoClient(video_path=str(video_path))

    source = client.manifest.source_video
    assert source.audio_found is True
    assert source.audio_duration == pytest.approx(2.0)
    assert source.audio_fps == pytest.approx(16000.0)
