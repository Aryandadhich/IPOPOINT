import os
import secrets


class BaseConfig:
    """Settings shared across all environments."""
    SECRET_KEY: str = os.environ.get("SECRET_KEY") or secrets.token_hex(32)
    JWT_EXPIRY_HOURS: int = 24 * 7  # 7 days

    # SQLite DB path — lives next to run.py in backend/
    DB_PATH: str = os.environ.get(
        "DB_PATH",
        os.path.join(os.path.dirname(__file__), "..", "ipo_data.db"),
    )

    # Scraper cache TTL (seconds)
    SCRAPE_CACHE_TTL: int = 600

    # Broker apply links shown on homepage
    BROKER_LINKS: dict = {
        "Zerodha": "https://zerodha.com/ipo/",
        "Groww":   "https://groww.in/ipo/mainboard",
        "Dhan":    "https://dhan.co/ipo/",
    }


class DevelopmentConfig(BaseConfig):
    DEBUG = True
    TESTING = False


class ProductionConfig(BaseConfig):
    DEBUG = False
    TESTING = False

    def __init__(self):
        sk = os.environ.get("SECRET_KEY", "")
        if not sk:
            import warnings
            warnings.warn(
                "SECRET_KEY env var not set — using auto-generated key. "
                "Sessions will reset on every restart.",
                stacklevel=2,
            )


class TestingConfig(BaseConfig):
    DEBUG = True
    TESTING = True
    DB_PATH = ":memory:"


config_map = {
    "development": DevelopmentConfig,
    "production":  ProductionConfig,
    "testing":     TestingConfig,
}
