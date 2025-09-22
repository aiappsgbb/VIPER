import sys
from pathlib import Path
from types import SimpleNamespace

PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC_ROOT = PROJECT_ROOT / "src"
if str(SRC_ROOT) not in sys.path:
    sys.path.insert(0, str(SRC_ROOT))

from cobrapy.api.app import _run_preprocess  # noqa: E402
from cobrapy.models.transcription import TranscriptionResult  # noqa: E402
from cobrapy.models.video import VideoManifest  # noqa: E402


class _StubClient:
    def __init__(self, manifest: VideoManifest):
        self.manifest = manifest
        self.preprocess_calls = []

    def preprocess_video(self, **kwargs):  # pragma: no cover - exercised via tests
        self.preprocess_calls.append(kwargs)


def _build_request(**overrides):
    defaults = {
        "skip_preprocess": True,
        "fps": 1.0,
        "segment_length": 10,
        "max_workers": None,
        "overwrite_output": True,
        "generate_transcripts": True,
        "trim_to_nearest_second": False,
        "allow_partial_segments": True,
        "output_directory": None,
    }
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


def _build_manifest(**overrides) -> VideoManifest:
    manifest = VideoManifest()
    manifest.name = overrides.get("name", "demo.mp4")
    manifest.video_manifest_path = overrides.get(
        "video_manifest_path", "/tmp/demo_manifest.json"
    )
    manifest.source_video.path = overrides.get(
        "source_path", "/tmp/source_video.mp4"
    )
    if "generate_transcript_flag" in overrides:
        manifest.processing_params.generate_transcript_flag = overrides[
            "generate_transcript_flag"
        ]
    if "audio_transcription" in overrides:
        manifest.audio_transcription = overrides["audio_transcription"]
    return manifest


def test_run_preprocess_reprocesses_when_transcripts_missing():
    manifest = _build_manifest(generate_transcript_flag=False, audio_transcription=None)
    client = _StubClient(manifest)
    request = _build_request(skip_preprocess=True, generate_transcripts=True)

    _run_preprocess(client, request)

    assert len(client.preprocess_calls) == 1
    call = client.preprocess_calls[0]
    assert call["generate_transcripts_flag"] is True


def test_run_preprocess_skips_when_transcripts_available():
    transcription = TranscriptionResult(text="hello", words=[], segments=[])
    manifest = _build_manifest(
        generate_transcript_flag=True, audio_transcription=transcription
    )
    client = _StubClient(manifest)
    request = _build_request(skip_preprocess=True, generate_transcripts=True)

    _run_preprocess(client, request)

    assert client.preprocess_calls == []
