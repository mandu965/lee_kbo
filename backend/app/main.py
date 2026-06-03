from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import engine, Base
from app.scheduler.main import setup_scheduler
from app.routers import games, teams, pitchers, predictions, stats, admin, players, analytics


@asynccontextmanager
async def lifespan(app: FastAPI):
    # DB 테이블 생성 (개발 환경용; 프로덕션은 Alembic 사용)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # 스케줄러 시작
    sched = setup_scheduler()
    sched.start()

    yield

    sched.shutdown(wait=False)
    await engine.dispose()


app = FastAPI(
    title="KBO Predictor API",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(games.router, prefix="/v1")
app.include_router(teams.router, prefix="/v1")
app.include_router(pitchers.router, prefix="/v1")
app.include_router(predictions.router, prefix="/v1")
app.include_router(stats.router, prefix="/v1")
app.include_router(admin.router, prefix="/v1")
app.include_router(players.router, prefix="/v1")
app.include_router(analytics.router, prefix="/v1")


@app.get("/health")
async def health():
    return {"status": "ok"}
