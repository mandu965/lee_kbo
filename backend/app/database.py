import os

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

_is_prod = os.getenv("ENV", "dev") == "production"

# ── 메인 DB 엔진 ──────────────────────────────────────────────
# dev  : 항상 로컬 PostgreSQL (DATABASE_URL)
# prod : Supabase 우선 (DATABASE_WEB_URL > DATABASE_URL)
_primary_url = settings.effective_database_url if _is_prod else settings._to_asyncpg(settings.database_url)

engine = create_async_engine(
    _primary_url,
    echo=False,
    pool_pre_ping=True,
    pool_size=5 if _is_prod else 2,
    max_overflow=10 if _is_prod else 5,
    pool_recycle=300,
    connect_args={"ssl": False},
)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)

# ── Supabase 동기화 전용 엔진 (로컬 dev에서만 사용) ────────────
# prod: 메인 엔진이 이미 Supabase이므로 별도 엔진 불필요
_web_raw = os.getenv("DATABASE_WEB_URL", "").strip()
_web_url = settings._to_asyncpg(_web_raw) if (_web_raw and not _is_prod) else None

if _web_url:
    _web_engine = create_async_engine(
        _web_url,
        echo=False,
        pool_pre_ping=True,
        pool_size=3,
        max_overflow=5,
        pool_recycle=300,
        connect_args={"ssl": False},
    )
    WebSessionLocal: async_sessionmaker | None = async_sessionmaker(
        _web_engine, expire_on_commit=False
    )
else:
    _web_engine = None
    WebSessionLocal = None


def has_web_db() -> bool:
    """로컬 → Supabase 동기화가 활성화되어 있는지 여부."""
    return WebSessionLocal is not None


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session
