from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent
ENV_PATH = BACKEND_DIR / ".env"


class Settings(BaseSettings):
    database_url: str
    anthropic_api_key: str = ""
    katago_path: str = str(BACKEND_DIR / "katago" / "bin" / "katago")
    katago_model_path: str = str(BACKEND_DIR / "katago" / "models" / "net_b6c96.bin.gz")
    katago_config_path: str = str(BACKEND_DIR / "katago" / "analysis.cfg")
    katago_max_visits: int = 100
    force_mock_katago: bool = False

    model_config = SettingsConfigDict(
        env_file=ENV_PATH,
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()