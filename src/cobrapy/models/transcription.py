"""Models describing the structure of a transcription result.

These mirror the pieces of data that were previously returned from the
Azure OpenAI Whisper verbose transcription API. They are intentionally kept
simple so that downstream code can continue to rely on the ``words`` and
``segments`` collections when aligning spoken words with video timestamps.
"""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


class WordTiming(BaseModel):
    """Represents the timing information for a single spoken word."""

    word: str
    start: float = Field(..., description="Word start time in seconds.")
    end: float = Field(..., description="Word end time in seconds.")
    confidence: Optional[float] = Field(
        default=None, description="Confidence score returned by the service."
    )


class SegmentTiming(BaseModel):
    """A contiguous segment of speech containing one or more words."""

    text: str = Field(default="", description="Text recognised for the segment.")
    start: float = Field(..., description="Segment start time in seconds.")
    end: float = Field(..., description="Segment end time in seconds.")
    words: List[WordTiming] = Field(default_factory=list)


class TranscriptionResult(BaseModel):
    """Container for the full transcription of an audio file."""

    text: str = Field(default="", description="Complete transcription text.")
    duration: Optional[float] = Field(
        default=None, description="Duration of the processed audio in seconds."
    )
    words: List[WordTiming] = Field(default_factory=list)
    segments: List[SegmentTiming] = Field(default_factory=list)

    def extend(self, other: "TranscriptionResult") -> None:
        """Merge another transcription result into this one.

        The helper is primarily used when large audio files are processed in
        chunks. The caller is responsible for ensuring that ``other`` already
        has timestamp offsets applied relative to the original audio.
        """

        if not isinstance(other, TranscriptionResult):
            raise TypeError("Can only extend with another TranscriptionResult")

        if other.text:
            if self.text:
                self.text = f"{self.text} {other.text}".strip()
            else:
                self.text = other.text

        self.words.extend(other.words)
        self.segments.extend(other.segments)
        if other.duration is not None:
            if self.duration is None:
                self.duration = other.duration
            else:
                self.duration = max(self.duration, other.duration)

