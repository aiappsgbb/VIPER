import sys
from pathlib import Path

import pytest


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC_ROOT = PROJECT_ROOT / "src"
if str(SRC_ROOT) not in sys.path:
    sys.path.insert(0, str(SRC_ROOT))

from cobrapy.models.video import VideoManifest  # noqa: E402
from cobrapy.video_preprocessor import VideoPreProcessor  # noqa: E402
import cobrapy.video_preprocessor as video_preprocessor  # noqa: E402


def _build_manifest(*, has_audio: bool) -> VideoManifest:
    manifest = VideoManifest()
    manifest.name = "unit_test_video.mp4"
    manifest.source_video.path = "dummy.mp4"
    manifest.source_video.duration = 10
    manifest.source_video.audio_found = has_audio
    return manifest


def _patch_output_directory(monkeypatch, tmp_path):
    def _fake_prepare_outputs_directory(*args, **kwargs):
        output_dir = tmp_path / "outputs"
        output_dir.mkdir(parents=True, exist_ok=True)
        return str(output_dir)

    monkeypatch.setattr(
        video_preprocessor, "prepare_outputs_directory", _fake_prepare_outputs_directory
    )


def test_preprocess_video_forces_transcription_when_audio(monkeypatch, tmp_path):
    manifest = _build_manifest(has_audio=True)
    processor = VideoPreProcessor(video_manifest=manifest, env=None)

    _patch_output_directory(monkeypatch, tmp_path)

    def _fake_generate_segments(self):
        assert self.manifest.processing_params.generate_transcript_flag is True
        raise RuntimeError("stop after assertion")

    monkeypatch.setattr(VideoPreProcessor, "_generate_segments", _fake_generate_segments)

    with pytest.raises(RuntimeError, match="stop after assertion"):
        processor.preprocess_video(generate_transcripts_flag=False)

    assert processor.manifest.processing_params.generate_transcript_flag is True


def test_preprocess_video_skips_transcription_without_audio(monkeypatch, tmp_path):
    manifest = _build_manifest(has_audio=False)
    processor = VideoPreProcessor(video_manifest=manifest, env=None)

    _patch_output_directory(monkeypatch, tmp_path)

    def _fake_generate_segments(self):
        assert self.manifest.processing_params.generate_transcript_flag is False
        raise RuntimeError("stop after assertion")

    monkeypatch.setattr(VideoPreProcessor, "_generate_segments", _fake_generate_segments)

    with pytest.raises(RuntimeError, match="stop after assertion"):
        processor.preprocess_video(generate_transcripts_flag=True)

    assert processor.manifest.processing_params.generate_transcript_flag is False

