from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://kbo:kbopass@localhost:5432/kbo_predictor"
    # Supabase 읽기/조회 전용 URL (Render API에서 사용)
    # postgresql://... 형식으로 저장, 내부적으로 asyncpg 드라이버 prefix 자동 추가
    database_web_url: str = ""
    redis_url: str = "redis://localhost:6379/1"
    secret_key: str = "change-me-in-production"
    allowed_origins: str = "http://localhost:3000"

    @property
    def origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",")]

    @property
    def effective_database_url(self) -> str:
        """Render 배포 시 DATABASE_WEB_URL(Supabase)을 asyncpg 형식으로 반환."""
        url = self.database_web_url or self.database_url
        # postgresql:// → postgresql+asyncpg:// 변환
        if url.startswith("postgresql://") and "+asyncpg" not in url:
            url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
        return url

    class Config:
        env_file = ".env"


settings = Settings()
