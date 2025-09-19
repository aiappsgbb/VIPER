from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from pydantic_settings import BaseSettings, SettingsConfigDict

from pydantic import SecretStr, model_validator, Field, ValidationError, PrivateAttr



def _find_project_root(marker: str = "pyproject.toml") -> Path:
    current_path = Path(__file__).resolve()
    for parent in current_path.parents:
        if (parent / marker).exists():
            return parent
    return current_path.parent


PROJECT_ROOT = _find_project_root()
PACKAGE_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_ENV_PATH = PROJECT_ROOT / ".env"
PACKAGE_ENV_PATH = PACKAGE_ROOT / ".env"


def _load_env_files() -> list[Path]:
    """Load default environment files and return the ones that were found."""

    loaded: list[Path] = []
    for candidate in (DEFAULT_ENV_PATH, PACKAGE_ENV_PATH):
        if candidate.is_file() and candidate not in loaded:
            load_dotenv(candidate, override=False)
            loaded.append(candidate)
    return loaded


LOADED_ENV_PATHS = _load_env_files()
ENV_FILES_FOR_SETTINGS = tuple(str(path) for path in LOADED_ENV_PATHS)


class GPTVision(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="AZURE_OPENAI_GPT_VISION_",
        extra="ignore",
    )

    endpoint: str
    api_key: SecretStr
    api_version: str
    deployment: str

    @model_validator(mode="before")
    def check_missing_fields(cls, values):
        missing_fields = [field for field in cls.model_fields if field not in values]
        if missing_fields:
            missing_with_prefix = [
                f"{cls.model_config['env_prefix']}{field.upper()}"
                for field in missing_fields
            ]
            raise ValueError(
                f"Missing environment variables: {', '.join(missing_with_prefix)}. Please set these environment variables before proceeding."
            )
        return values


class AzureSpeech(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="AZURE_SPEECH_",
        extra="ignore",
    )

    region: str
    endpoint: Optional[str] = None
    use_managed_identity: bool = Field(
        default=True,
        description="Whether managed identity should be used instead of an API key.",
    )
    api_key: Optional[SecretStr] = Field(
        default=None,
        description="Optional API key if managed identity is not available.",
    )
    managed_identity_client_id: Optional[str] = Field(
        default=None,
        description="Optional client id when multiple managed identities are available.",
    )
    language: str = Field(
        default="en-US", description="Language to use for speech recognition."
    )

    @model_validator(mode="before")
    def validate_configuration(cls, values):
        use_managed_identity = values.get("use_managed_identity", True)
        api_key = values.get("api_key")
        if not use_managed_identity and not api_key:
            raise ValueError(
                "AZURE_SPEECH_API_KEY must be provided when managed identity is disabled."
            )
        return values


class AzureStorage(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="AZURE_STORAGE_",
        extra="ignore",
    )

    account_url: Optional[str] = None
    account_name: Optional[str] = None
    account_key: Optional[SecretStr] = None
    connection_string: Optional[SecretStr] = None
    video_container: Optional[str] = None
    output_container: Optional[str] = None
    managed_identity_client_id: Optional[str] = None

    def is_configured(self) -> bool:
        return bool(self.connection_string or self.account_url)


class AzureAISearch(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="AZURE_SEARCH_",
        extra="ignore",
    )

    endpoint: Optional[str] = None
    index_name: Optional[str] = None
    api_key: Optional[SecretStr] = None
    managed_identity_client_id: Optional[str] = None

    def is_configured(self) -> bool:
        return bool(self.endpoint and self.index_name)


def _load_optional_vision() -> Optional[GPTVision]:
    """Attempt to load the GPT vision configuration.

    Missing environment variables are expected in many local development scenarios
    where the vision pipeline is not configured.  Returning ``None`` keeps backend
    startup seamless while deferring validation until the feature is used.
    """

    try:
        return GPTVision()
    except ValidationError:
        return None


class CobraEnvironment(BaseSettings):
    """Environment configuration for the Cobra backend."""

    model_config = SettingsConfigDict(
        env_file=ENV_FILES_FOR_SETTINGS if ENV_FILES_FOR_SETTINGS else None,
        extra="ignore",
    )

    vision: Optional[GPTVision] = Field(

        default=None,

        description=(
            "Azure OpenAI vision configuration. ``None`` indicates that the required "
            "environment variables were not provided."
        ),
    )
    speech: AzureSpeech = AzureSpeech()
    storage: AzureStorage = AzureStorage()
    search: AzureAISearch = AzureAISearch()

    _vision_error: Optional[str] = PrivateAttr(default=None)

    @model_validator(mode="after")
    def _load_optional_vision(cls, model: "CobraEnvironment") -> "CobraEnvironment":
        """Populate the optional vision settings when environment variables exist."""

        if model.vision is not None:
            return model

        model.vision = model._refresh_vision_settings()
        return model

    def _refresh_vision_settings(self) -> Optional[GPTVision]:
        """Attempt to create a GPTVision instance and cache any validation errors."""

        try:
            vision = GPTVision()
        except (ValidationError, ValueError) as exc:  # ValueError raised inside validators
            self._vision_error = str(exc)
            return None

        self._vision_error = None
        return vision


    def require_vision(self) -> GPTVision:
        """Return the configured vision settings or raise a helpful error."""

        vision = self.vision or self._refresh_vision_settings()
        if vision is None:
            message = (

                "Azure OpenAI vision environment variables are missing. Set "
                "AZURE_OPENAI_GPT_VISION_ENDPOINT, AZURE_OPENAI_GPT_VISION_API_KEY, "
                "AZURE_OPENAI_GPT_VISION_API_VERSION, and "
                "AZURE_OPENAI_GPT_VISION_DEPLOYMENT before invoking video analysis "
                "endpoints."
            )

            if self._vision_error:
                message = f"{message}\nValidation details: {self._vision_error}"
            raise RuntimeError(message)

        self.vision = vision
        return vision

