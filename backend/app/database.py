from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

import os

_is_prod = os.getenv("ENV", "dev") == "production"

engine = create_async_engine(
    settings.effective_database_url,
    echo=False,
    pool_pre_ping=True,
    # Render/Supabase 등 관리형 DB는 유휴 연결을 짧게 끊으므로 pool_recycle 설정
    pool_size=5 if _is_prod else 2,
    max_overflow=10 if _is_prod else 5,
    pool_recycle=300,   # 5분마다 연결 갱신 (Supabase 기본 idle timeout 600s 대응)
    connect_args={"ssl": False},  # Supabase 연결 시 ssl=True 로 변경
)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session
