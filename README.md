# KBO Predictor — 설치 및 실행 가이드

## 필수 설치 프로그램

| 프로그램 | 버전 | 다운로드 |
|---------|------|---------|
| Docker Desktop | 최신 | https://www.docker.com/products/docker-desktop |
| Node.js | 20+ | https://nodejs.org |
| Python | 3.11+ | https://www.python.org |

---

## 1. 첫 실행 (집 PC)

```bash
# 1. .env 파일 생성
cp .env.example .env

# 2. DB + Redis + API 컨테이너 한 번에 시작
docker-compose up -d

# 잠시 대기 후 컨테이너 상태 확인
docker-compose ps
```

---

## 2. Python 의존성 설치 (최초 1회)

```bash
cd backend
pip install -r requirements.txt
```

---

## 3. 초기 데이터 생성

```bash
# backend/.env 파일 생성 (로컬 Python 스크립트 전용)
# Windows
echo DATABASE_URL=postgresql+asyncpg://kbo:kbopass@localhost:5433/kbo_predictor > backend/.env
echo REDIS_URL=redis://localhost:6380/1 >> backend/.env
echo SECRET_KEY=dev-secret-key >> backend/.env
echo ALLOWED_ORIGINS=http://localhost:3000 >> backend/.env

# 시즌 시뮬레이션 데이터 생성 (실제 크롤러 전 테스트용)
cd backend
python -m scripts.generate_season_data

# 또는 오늘 경기만 빠르게 생성
python -m scripts.seed_data
```

> **실제 KBO 데이터를 사용하려면 (외부망 필요):**
> ```bash
> # 시즌 전체 부트스트랩 — 팀 시드 + 실제 일정/결과 크롤 + ELO 리플레이 + 투수 성적 + 오늘 예측
> python -m scripts.build_real_season               # 3월~당월
> python -m scripts.build_real_season --start-month 3 --end-month 5
>
> # 또는 개별 태스크
> python -m scripts.crawl_now --task schedule --year 2026 --month 5
> python -m scripts.crawl_now --task statiz        # 투수 성적(KBO 공식)
> python -m scripts.crawl_now --task all
> ```
> Docker 환경에서는 `docker compose exec api python -m scripts.build_real_season` 로 실행.

### 데이터 소스 안내 (2026-05 검증)

| 데이터 | 소스 | 비고 |
|--------|------|------|
| 경기 일정/결과 | KBO 공식 `koreabaseball.com` AJAX (`/ws/Schedule.asmx/GetScheduleList`) | 공개 |
| 투수 시즌 성적 | KBO 공식 `Record/Player/PitcherBasic/Basic1.aspx` (팀 필터 POST) | 공개 |
| ~~Statiz~~ | ~~statiz.sporki.com~~ | **폐기**: 도메인 소멸 → `statiz.co.kr` 이전 후 **전면 로그인 필수**로 크롤 불가. 투수 성적 소스를 KBO 공식으로 교체함 (`app/crawler/kbo_pitcher.py`) |
| 선발 라인업 | (미구현) | GameCenter 가 JS 렌더링이라 별도 분석 필요 — 후속 과제. 미설정 시 예측은 ELO·최근흐름·홈이점으로 폴백 |

---

## 4. 프론트엔드 실행

```bash
cd frontend
npm install          # 최초 1회
npm run dev          # http://localhost:3000
```

---

## 5. 접속 주소

| 서비스 | 주소 |
|--------|------|
| 프론트엔드 | http://localhost:3000 |
| API | http://localhost:8002/v1 |
| Swagger 문서 | http://localhost:8002/docs |

---

## 포트 구성 (Lee Trader 충돌 방지용)

| 서비스 | 호스트 포트 |
|--------|-----------|
| PostgreSQL | 5433 |
| Redis | 6380 |
| FastAPI | 8002 |

> Lee Trader가 없는 환경이라면 `docker-compose.yml`에서 포트를 표준값(5432, 6379, 8001)으로 변경해도 됩니다.

---

## 6. 백테스팅 실행

```bash
cd backend
python -m scripts.backtest --start 2026-04-01 --end 2026-05-28 --csv results/backtest.csv
```

---

## 7. Google AdSense 설정 (배포 후)

`frontend/.env.local` 에 아래 항목 추가:

```env
NEXT_PUBLIC_ADSENSE_ID=ca-pub-XXXXXXXXXXXXXXXXX
NEXT_PUBLIC_AD_SLOT_BANNER=1234567890
NEXT_PUBLIC_SITE_URL=https://your-domain.com
```

---

## 8. DB 마이그레이션 (스키마 변경 시)

```bash
cd backend
python -m alembic revision --autogenerate -m "변경 내용"
python -m alembic upgrade head
```

---

## 디렉토리 구조

```
Lee_KBO/
├── docker-compose.yml      ← 전체 인프라 정의
├── .env.example            ← 환경변수 템플릿
├── backend/
│   ├── app/
│   │   ├── engine/         ← ELO, 파크팩터, 날씨, 불펜 예측 엔진
│   │   ├── crawler/        ← KBO, Statiz, Open-Meteo 크롤러
│   │   ├── models/         ← SQLAlchemy DB 모델
│   │   ├── routers/        ← FastAPI 엔드포인트
│   │   └── scheduler/      ← APScheduler 크론 작업
│   ├── alembic/            ← DB 마이그레이션
│   └── scripts/            ← 수동 실행 스크립트
└── frontend/
    ├── app/                ← Next.js 페이지 (App Router)
    ├── components/         ← React 컴포넌트
    └── lib/                ← API 클라이언트, 타입, 용어 데이터
```
