from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import SecretStr, model_validator


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


class Whisper(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="AZURE_OPENAI_WHISPER_",
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


class CobraEnvironment(BaseSettings):
    """
    A class representing the environment settings for the application.

    Attributes:
        vision (GPTVision): An instance of GPTVision for handling vision-related tasks.
        whisper (Whisper): An instance of Whisper for handling audio-related tasks.
    """

    vision: GPTVision = GPTVision()
    whisper: Whisper = Whisper()
