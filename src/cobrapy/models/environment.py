from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import SecretStr, model_validator, Field


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


class CobraEnvironment(BaseSettings):
    """Environment configuration for the Cobra backend."""

    vision: GPTVision = GPTVision()
    speech: AzureSpeech = AzureSpeech()
    storage: AzureStorage = AzureStorage()
    search: AzureAISearch = AzureAISearch()
