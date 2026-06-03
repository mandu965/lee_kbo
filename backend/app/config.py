import os
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env")

    database_url: str = "postgresql+asyncpg://kbo:kbopass@localhost:5432/kbo_predictor"
    # Supabase URL — Render 환경에서 반드시 설정 필요
    database_web_url: str = ""
    redis_url: str = "redis://localhost:6379/1"
    secret_key: str = "change-me-in-production"
    allowed_origins: str = "http://localhost:3000"

    @property
    def origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",")]

    @staticmethod
    def _to_asyncpg(url: str) -> str:
        """postgresql:// → postgresql+asyncpg:// 변환."""
        if url.startswith("postgresql://") and "+asyncpg" not in url:
            return url.replace("postgresql://", "postgresql+asyncpg://", 1)
        return url

    @property
    def effective_database_url(self) -> str:
        """사용할 DB URL 반환.
        우선순위: DATABASE_WEB_URL > DATABASE_URL
        Render 환경에서 DATABASE_WEB_URL 미설정 시 에러 발생 방지를 위해
        환경변수 DB_URL도 직접 확인.
        """
        # 환경변수에서 직접 읽기 (pydantic 캐시 우회)
        web = os.getenv("DATABASE_WEB_URL", "").strip()
        if web:
            return self._to_asyncpg(web)
        return self._to_asyncpg(self.database_url)


settings = Settings()
