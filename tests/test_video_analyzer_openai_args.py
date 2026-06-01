import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC_ROOT = PROJECT_ROOT / "src"
if str(SRC_ROOT) not in sys.path:
    sys.path.insert(0, str(SRC_ROOT))

from cobrapy.video_analyzer import (  # noqa: E402
    _MAX_COMPLETION_TOKENS,
    _get_alternate_completion_token_args,
    _get_completion_token_args,
    _should_retry_completion_token_args,
)


class TokenArgumentError(Exception):
    def __init__(self, message: str, status_code: int | None = 400):
        super().__init__(message)
        self.status_code = status_code


def test_completion_token_args_use_new_parameter_for_newer_model_families():
    assert _get_completion_token_args("gpt-5.4-mini") == {
        "max_completion_tokens": _MAX_COMPLETION_TOKENS
    }
    assert _get_completion_token_args("o4-mini") == {
        "max_completion_tokens": _MAX_COMPLETION_TOKENS
    }


def test_completion_token_args_preserve_legacy_parameter_by_default():
    assert _get_completion_token_args("gpt4o") == {
        "max_tokens": _MAX_COMPLETION_TOKENS
    }


def test_alternate_completion_token_args_switches_parameter_name():
    assert _get_alternate_completion_token_args({"max_tokens": 123}) == {
        "max_completion_tokens": 123
    }
    assert _get_alternate_completion_token_args({"max_completion_tokens": 456}) == {
        "max_tokens": 456
    }


def test_completion_token_retry_detects_azure_model_parameter_errors():
    error = TokenArgumentError(
        "Missing required parameter: 'max_completion_tokens'."
    )

    assert _should_retry_completion_token_args(error, {"max_tokens": 123}) is True


def test_completion_token_retry_ignores_unrelated_errors():
    error = TokenArgumentError("The model deployment does not exist.", status_code=404)

    assert _should_retry_completion_token_args(error, {"max_tokens": 123}) is False
