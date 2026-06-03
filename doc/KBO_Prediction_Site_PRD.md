# KBO 승부예측 & 통계 대시보드 — 프로젝트 기획 문서

> 작성일: 2026-05-29 / 최종 갱신: 2026-05-30  
> 프로젝트명: KBO Predictor  
> 연계 프로젝트: Lee Trader (자동매매 시스템)

---

## 목차

1. [프로젝트 개요](#1-프로젝트-개요)
2. [핵심 목표 & 차별화 전략](#2-핵심-목표--차별화-전략)
3. [주요 기능 정의](#3-주요-기능-정의)
4. [시스템 아키텍처](#4-시스템-아키텍처)
5. [기술 스택](#5-기술-스택)
6. [데이터베이스 스키마](#6-데이터베이스-스키마)
7. [API 설계](#7-api-설계)
8. [프론트엔드 페이지 구성](#8-프론트엔드-페이지-구성)
9. [예측 엔진 설계](#9-예측-엔진-설계)
10. [크롤러 설계](#10-크롤러-설계)
11. [개발 로드맵](#11-개발-로드맵)
12. [디렉토리 구조](#12-디렉토리-구조)
13. [배포 전략](#13-배포-전략)

---

## 1. 프로젝트 개요

### 배경

- 기존 Lee Trader(주식 자동매매 시스템)의 데이터 분석 인프라를 활용
- 네이버 스포츠, 다음 스포츠 등 기존 서비스는 **결과만 제공** → 예측 근거를 시각화하는 서비스 부재
- KBO 시즌(3~11월) 동안 매일 경기가 열려 **자연스러운 재방문** 유도 가능

### 핵심 가치

> "왜 이 팀이 이길 가능성이 높은가?" — 데이터 기반 근거를 시각화한다.

### 사용자 시나리오

| 시점 | 사용자 행동 |
|------|------------|
| 경기 전날 밤 | 내일 경기 예측 확인, 선발 투수 분석 |
| 당일 오전 | 라인업 확정 후 최종 예측 업데이트 확인 |
| 경기 후 | 예측 적중 여부 확인, 누적 적중률 확인 |

---

## 2. 핵심 목표 & 차별화 전략

### 차별화 포인트

| 기존 서비스 | KBO Predictor |
|------------|---------------|
| 경기 결과만 제공 | **예측 확률 + 근거 데이터** 시각화 |
| 단순 승패 기록 | **ELO 레이팅 + 투수 지표 + 최근 흐름** 복합 분석 |
| 정적인 통계표 | **인터랙티브 대시보드** |
| 없음 | **예측 적중률 히스토리** (신뢰도 지표) |

### 재방문 유도 전략

- 경기 전: 예측 확인 (1회 방문)
- 경기 후: 적중 여부 확인 (1회 방문)
- **하루 최소 2회 자연 방문** 구조
- 시즌 누적 예측 정확도 공개 → 사이트 신뢰도 형성

---

## 3. 주요 기능 정의

### 3-1. MVP 기능 (Phase 1~3)

#### 오늘의 경기 대시보드
- 당일 전체 경기 목록
- 각 경기별 예측 승률 (홈/원정 퍼센트 바)
- 선발 투수 정보 (ERA, WHIP, 최근 5경기 성적)
- 예측 핵심 근거 3줄 요약

#### 팀 분석 페이지
- 팀별 현재 순위 및 ELO 레이팅
- 최근 10경기 흐름 (W/L 스트릭)
- 홈/원정 승률 비교
- 타선 지표 (팀 타율, OPS, 득점)

#### 투수 분석 페이지
- 선발 투수 시즌 성적
- 최근 5경기 세부 성적
- 상대 팀별 피안타율

#### 예측 히스토리
- 날짜별 예측 vs 실제 결과
- 누적 적중률 그래프
- 월별 적중률 통계

### 3-2. 고도화 기능 (Phase 4+)

- 타자 vs 투수 상성 분석
- 날씨 변수 반영 (우천 취소 예보 포함)
- 구장별 파크팩터 반영
- 불펜 투수 소진도 지표
- 알림 기능 (경기 시작 1시간 전 예측 알림)

---

## 4. 시스템 아키텍처

```
[집 PC — 크롤러/스케줄러]
┌─────────────────────────────────────────────────────┐
│                    데이터 소스 (2026 검증)               │
│  KBO 공식 AJAX  │  KBO 기록실  │  네이버 스포츠  │  Open-Meteo  │
│  일정/결과       │  투수/타자    │  선발 라인업     │  날씨         │
└────────┬───────┴──────┬───────┴───────┬────────┴──────┘
         │              │               │
         ▼              ▼               ▼
┌─────────────────────────────────────────────────────┐
│       Crawler / Scheduler (Python + APScheduler)     │
│  00:10 야간 통합: 결과→박스스코어/타순→정산→ELO→일정→기록→예측 │
│  07:00 투수  07:15 타자  07:30 순위 (재확인 작업)       │
│  11:30/13:00/17:00 라인업  12:00 날씨  15:00 최종 예측 │
│  23:30 결과  23:50 정산                               │
└──────────────────────┬──────────────────────────────┘
                       │ 쓰기
         ┌─────────────▼───────────┐
         │   로컬 PostgreSQL (Docker)│
         └─────────────┬───────────┘
                       │ sync.py (자동 동기화)
         ┌─────────────▼───────────┐
         │   Supabase PostgreSQL   │ ← 웹 조회 전용
         └─────────────┬───────────┘
                       │ 읽기
┌──────────────────────▼──────────────────────────────┐
│           분석 엔진 v2.1 (Python)                      │
│  ELO(40%) │ 선발(28%) │ 흐름(14%) │ 홈이점(8%)          │
│  파크(5%)  │ 날씨(3%)  │ 불펜(2%) │ 라인업강도(±3%p)       │
│  + 예측 신뢰도 지수 · 선발 K/BB 제구력 지수              │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│               FastAPI 서버 (Render)                   │
│          REST API + CORS + Alembic 자동 마이그레이션   │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│           Next.js (React) + Tailwind CSS             │
│        SSR/SSG + SWR(캐시) + Recharts(차트)           │
└─────────────────────────────────────────────────────┘
```

---

## 5. 기술 스택

### 백엔드

| 분류 | 기술 | 버전 | 용도 |
|------|------|------|------|
| 언어 | Python | 3.11+ | 전체 백엔드 |
| 웹 프레임워크 | FastAPI | 0.110+ | REST API |
| ORM | SQLAlchemy | 2.0+ | DB 추상화 |
| 마이그레이션 | Alembic | - | DB 스키마 버전 관리 |
| 스케줄러 | APScheduler | 3.x | 크롤러 자동 실행 |
| 크롤러 | BeautifulSoup4 + httpx | - | 데이터 수집 |
| 캐시 | Redis | 7.x | 예측 결과 캐싱 |
| DB | PostgreSQL | 15+ | 메인 데이터 저장 |
| 커넥션 풀 | asyncpg + pgBouncer | - | DB 연결 관리 |
| 인증 | python-jose + passlib | - | JWT 토큰 |
| 테스트 | pytest | - | 단위/통합 테스트 |

### 프론트엔드

| 분류 | 기술 | 버전 | 용도 |
|------|------|------|------|
| 프레임워크 | Next.js | 14+ (App Router) | SSR/SSG/ISR |
| UI 라이브러리 | React | 18+ | 컴포넌트 |
| 스타일링 | Tailwind CSS | 3.x | 유틸리티 CSS |
| 차트 | Recharts | - | 통계 시각화 |
| 데이터 패칭 | SWR | - | 클라이언트 캐시 |
| 상태 관리 | Zustand | - | 전역 상태 (경량) |
| 타입 | TypeScript | 5.x | 타입 안전성 |

### 인프라

| 분류 | 기술 | 비고 |
|------|------|------|
| 프론트 배포 | Vercel | 무료 플랜 |
| 백엔드 서버 | 기존 Lee Trader 서버 | 동일 환경 재사용 |
| 컨테이너 | Docker + docker-compose | 로컬/스테이징 |
| 리버스 프록시 | Nginx | API 라우팅 |

---

## 6. 데이터베이스 스키마

### 팀 (teams)

```sql
CREATE TABLE teams (
    id          SERIAL PRIMARY KEY,
    code        VARCHAR(10) UNIQUE NOT NULL,  -- 'LG', 'KT', 'SSG' ...
    name        VARCHAR(50) NOT NULL,
    short_name  VARCHAR(20),
    stadium     VARCHAR(100),
    elo_rating  FLOAT DEFAULT 1500.0,
    created_at  TIMESTAMP DEFAULT NOW(),
    updated_at  TIMESTAMP DEFAULT NOW()
);
```

### 선수 (players)

```sql
CREATE TABLE players (
    id          SERIAL PRIMARY KEY,
    team_id     INTEGER REFERENCES teams(id),
    name        VARCHAR(50) NOT NULL,
    position    VARCHAR(20),               -- 'P', '1B', 'C' ...
    birth_date  DATE,
    is_active   BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMP DEFAULT NOW()
);
```

### 경기 일정/결과 (games)

```sql
CREATE TABLE games (
    id              SERIAL PRIMARY KEY,
    game_date       DATE NOT NULL,
    home_team_id    INTEGER REFERENCES teams(id),
    away_team_id    INTEGER REFERENCES teams(id),
    stadium         VARCHAR(100),
    start_time      TIME,
    status          VARCHAR(20) DEFAULT 'scheduled',  -- scheduled/in_progress/final/cancelled
    home_score      INTEGER,
    away_score      INTEGER,
    home_starter_id INTEGER REFERENCES players(id),
    away_starter_id INTEGER REFERENCES players(id),
    weather_temp    FLOAT,
    weather_cond    VARCHAR(50),
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_games_date ON games(game_date);
CREATE INDEX idx_games_teams ON games(home_team_id, away_team_id);
```

### 투수 성적 (pitcher_stats)

```sql
CREATE TABLE pitcher_stats (
    id              SERIAL PRIMARY KEY,
    player_id       INTEGER REFERENCES players(id),
    game_id         INTEGER REFERENCES games(id),
    season          INTEGER NOT NULL,
    innings_pitched FLOAT,
    hits            INTEGER,
    runs            INTEGER,
    earned_runs     INTEGER,
    walks           INTEGER,
    strikeouts      INTEGER,
    era             FLOAT,       -- 시즌 누적 ERA (경기 후 갱신)
    whip            FLOAT,
    is_starter      BOOLEAN DEFAULT TRUE,
    game_result     VARCHAR(5),  -- 'W', 'L', 'ND'
    created_at      TIMESTAMP DEFAULT NOW()
);
```

### 팀 경기 성적 (team_game_stats)

```sql
CREATE TABLE team_game_stats (
    id              SERIAL PRIMARY KEY,
    team_id         INTEGER REFERENCES teams(id),
    game_id         INTEGER REFERENCES games(id),
    is_home         BOOLEAN,
    runs            INTEGER,
    hits            INTEGER,
    errors          INTEGER,
    team_avg        FLOAT,       -- 경기 당일 시즌 팀타율
    team_ops        FLOAT,
    created_at      TIMESTAMP DEFAULT NOW()
);
```

### 예측 결과 (predictions)

```sql
CREATE TABLE predictions (
    id                  SERIAL PRIMARY KEY,
    game_id             INTEGER REFERENCES games(id) UNIQUE,
    home_win_prob       FLOAT NOT NULL,   -- 0.0 ~ 1.0
    away_win_prob       FLOAT NOT NULL,
    predicted_winner_id INTEGER REFERENCES teams(id),
    actual_winner_id    INTEGER REFERENCES teams(id),   -- 경기 후 업데이트
    is_correct          BOOLEAN,                         -- 경기 후 업데이트
    elo_diff            FLOAT,            -- 예측 시점 ELO 차이
    pitcher_score_home  FLOAT,            -- 선발 투수 보정 점수
    pitcher_score_away  FLOAT,
    recent_form_home    FLOAT,            -- 최근 10경기 흐름
    recent_form_away    FLOAT,
    model_version       VARCHAR(20),
    created_at          TIMESTAMP DEFAULT NOW(),
    updated_at          TIMESTAMP DEFAULT NOW()
);
```

### ELO 히스토리 (elo_history)

```sql
CREATE TABLE elo_history (
    id          SERIAL PRIMARY KEY,
    team_id     INTEGER REFERENCES teams(id),
    game_id     INTEGER REFERENCES games(id),
    elo_before  FLOAT,
    elo_after   FLOAT,
    elo_change  FLOAT,
    game_date   DATE,
    created_at  TIMESTAMP DEFAULT NOW()
);
```

---

## 7. API 설계

### Base URL

```
https://api.kbo-predictor.com/v1
```

### 엔드포인트 목록

#### 경기

```
GET  /games/today                    # 오늘 경기 목록 + 예측
GET  /games/{game_id}                # 경기 상세
GET  /games?date=2026-05-29          # 날짜별 경기
GET  /games/{game_id}/prediction     # 경기 예측 상세 (근거 포함)
```

#### 팀

```
GET  /teams                          # 전체 팀 목록 + 순위
GET  /teams/{team_id}                # 팀 상세 정보
GET  /teams/{team_id}/stats          # 팀 통계
GET  /teams/{team_id}/recent         # 최근 10경기 결과
GET  /teams/{team_id}/elo-history    # ELO 변동 히스토리
```

#### 선수/투수

```
GET  /players/{player_id}            # 선수 상세
GET  /players/{player_id}/stats      # 투수 성적
GET  /pitchers/today                 # 오늘 선발 투수 목록
```

#### 예측 통계

```
GET  /predictions/accuracy           # 전체 적중률
GET  /predictions/history?month=5    # 월별 예측 히스토리
GET  /predictions/streak             # 현재 연속 적중/실패 스트릭
```

#### 응답 예시 — 오늘 경기

```json
{
  "date": "2026-05-29",
  "games": [
    {
      "id": 1024,
      "start_time": "18:30",
      "stadium": "잠실야구장",
      "home_team": {
        "id": 1,
        "name": "LG 트윈스",
        "elo_rating": 1542.3,
        "recent_form": "WWLWW"
      },
      "away_team": {
        "id": 2,
        "name": "KT 위즈",
        "elo_rating": 1498.7,
        "recent_form": "LWWLL"
      },
      "prediction": {
        "home_win_prob": 0.62,
        "away_win_prob": 0.38,
        "key_factors": [
          "홈팀 선발 ERA 2.81 (시즌 2위)",
          "최근 5경기 홈팀 4승 1패",
          "ELO 레이팅 차이 +43.6"
        ]
      },
      "starters": {
        "home": { "name": "임찬규", "era": 2.81, "whip": 1.12 },
        "away": { "name": "고영표", "era": 3.44, "whip": 1.28 }
      }
    }
  ]
}
```

---

## 8. 프론트엔드 페이지 구성

### 페이지 목록

| URL | 페이지 | 렌더링 방식 | 설명 |
|-----|--------|------------|------|
| `/` | 홈 (오늘의 경기) | ISR (1시간) | 당일 전체 경기 + 예측 |
| `/games/[id]` | 경기 상세 | SSR | 예측 근거 상세 |
| `/teams` | 팀 순위 | ISR (1일) | 전체 팀 순위 + ELO |
| `/teams/[id]` | 팀 상세 | ISR (1시간) | 팀 통계 + 최근 흐름 |
| `/pitchers` | 선발 투수 | ISR (1일) | 투수 성적 순위 |
| `/history` | 예측 히스토리 | SSG | 누적 적중률 통계 |

### 메인 페이지 컴포넌트 구조

```
HomePage
├── TodayHeader            # 날짜, 전체 경기 수, 날씨
├── PredictionAccuracyBadge  # 시즌 누적 적중률 뱃지
└── GameCardList
    └── GameCard (경기당 1개)
        ├── TeamMatchup        # 홈 vs 원정 팀명/로고
        ├── WinProbBar         # 예측 승률 바 (애니메이션)
        ├── StarterInfo        # 선발 투수 ERA/WHIP
        ├── RecentFormBadges   # 최근 5경기 W/L 뱃지
        └── KeyFactorList      # 예측 근거 3줄
```

### 핵심 UI 컴포넌트

#### WinProbBar (승률 바)

```tsx
// components/WinProbBar.tsx
interface WinProbBarProps {
  homeProb: number;      // 0~1
  awayProb: number;
  homeTeamName: string;
  awayTeamName: string;
}
// 홈팀 색상 (파란계열) | 경계선 | 원정팀 색상 (빨간계열)
// 애니메이션: 페이지 로드 시 0%에서 실제 값으로 transition
```

#### RecentFormBadges

```tsx
// 'W' → 초록 뱃지, 'L' → 빨간 뱃지, 'D' → 회색 뱃지
// 최근 5경기, 오른쪽이 최신
// ex) [L][W][W][L][W]
```

---

## 9. 예측 엔진 설계

### 9-1. ELO 레이팅 시스템

```python
# engine/elo.py

K_FACTOR = 20  # 조정 계수 (초반 시즌: 32, 후반: 20)

def expected_score(rating_a: float, rating_b: float) -> float:
    """팀 A의 기대 승률"""
    return 1 / (1 + 10 ** ((rating_b - rating_a) / 400))

def update_elo(winner_rating: float, loser_rating: float) -> tuple[float, float]:
    """경기 후 ELO 업데이트"""
    expected = expected_score(winner_rating, loser_rating)
    new_winner = winner_rating + K_FACTOR * (1 - expected)
    new_loser  = loser_rating  + K_FACTOR * (0 - (1 - expected))
    return new_winner, new_loser
```

### 9-2. 복합 예측 모델

```python
# engine/predictor.py

WEIGHTS = {
    "elo":          0.45,   # ELO 레이팅 차이
    "starter":      0.30,   # 선발 투수 지표
    "recent_form":  0.15,   # 최근 10경기 흐름
    "home_advantage": 0.10, # 홈 이점 (고정 보정값)
}

def predict_game(game_id: int) -> PredictionResult:
    """
    1. ELO 기반 기대 승률 계산
    2. 선발 투수 ERA/WHIP 차이로 보정
    3. 최근 10경기 승률로 보정
    4. 홈 이점 보정 (+0.03 고정)
    5. 가중치 합산 → 최종 승률
    """
    ...
```

### 9-3. 선발 투수 보정 공식

```
pitcher_score = (1 / ERA) * 0.5 + (1 / WHIP) * 0.3 + recent_5_avg * 0.2

보정값 = (home_pitcher_score - away_pitcher_score) / normalizer
```

### 9-4. 최근 흐름 계산

```python
def calc_recent_form(team_id: int, last_n: int = 10) -> float:
    """
    최근 N경기 승률
    단순 승률 외에 득실점 차도 반영
    """
    games = get_recent_games(team_id, last_n)
    win_rate = sum(1 for g in games if g.winner_id == team_id) / len(games)
    run_diff = sum(g.score_diff for g in games) / len(games)  # 평균 득실차
    return win_rate * 0.7 + normalize(run_diff) * 0.3
```

---

## 10. 크롤러 설계

### 10-1. 수집 대상 및 스케줄

| 수집 대상 | 소스 | 스케줄 | 비고 |
|----------|------|--------|------|
| 경기 일정 | KBO 공식 | 매일 06:00 | 당일 + 익일 |
| 경기 결과 | KBO 공식 | 매일 23:30 | 당일 경기 결과 |
| 선발 라인업 | KBO 공식 | 매일 14:00 | 라인업 발표 후 |
| 팀 스탯 | Statiz | 매일 07:00 | 전일 기준 갱신 |
| 투수 성적 | Statiz | 매일 07:00 | 전일 기준 갱신 |
| 날씨 | Open-Meteo API | 매일 12:00 | 무료 API 활용 |

### 10-2. 크롤러 구조

```python
# crawler/base.py
class BaseCrawler:
    def __init__(self, session: httpx.AsyncClient):
        self.session = session
    
    async def fetch(self, url: str) -> BeautifulSoup:
        resp = await self.session.get(url)
        return BeautifulSoup(resp.text, "html.parser")
    
    async def run(self):
        raise NotImplementedError

# crawler/kbo_schedule.py
class KBOScheduleCrawler(BaseCrawler):
    BASE_URL = "https://www.koreabaseball.com/Schedule/Schedule.aspx"
    
    async def run(self, date: date) -> list[GameSchedule]:
        soup = await self.fetch(self.BASE_URL)
        # 파싱 로직
        ...

# crawler/statiz.py
class StatizCrawler(BaseCrawler):
    BASE_URL = "https://statiz.sporki.com"
    
    async def run_team_stats(self, season: int) -> list[TeamStat]:
        ...
    
    async def run_pitcher_stats(self, season: int) -> list[PitcherStat]:
        ...
```

### 10-3. 스케줄러 설정

```python
# scheduler/main.py
from apscheduler.schedulers.asyncio import AsyncIOScheduler

scheduler = AsyncIOScheduler(timezone="Asia/Seoul")

scheduler.add_job(crawl_schedule,    "cron", hour=6,  minute=0)
scheduler.add_job(crawl_lineup,      "cron", hour=14, minute=0)
scheduler.add_job(crawl_statiz,      "cron", hour=7,  minute=0)
scheduler.add_job(crawl_results,     "cron", hour=23, minute=30)
scheduler.add_job(update_predictions,"cron", hour=15, minute=0)  # 라인업 확정 후 예측 갱신
scheduler.add_job(update_elo,        "cron", hour=0,  minute=0)  # 자정 ELO 업데이트
```

---

## 11. 개발 로드맵

> 상태 표기: ✅ 완료 · 🔄 진행중 · ⏸ 보류 · 📋 미착수

### Phase 1 — 데이터 파이프라인 ✅ 완료

- ✅ PostgreSQL 스키마 생성 (Alembic 마이그레이션 3단계)
- ✅ KBO 공식 경기 일정/결과 크롤러 (AJAX JSON 엔드포인트)
- ✅ KBO 공식 투수 시즌 기록 크롤러 (Statiz 대체 — 로그인 제약으로 교체)
- ✅ KBO 공식 타자 시즌 기록 크롤러 (AVG/HR/RBI/OPS 등)
- ✅ KBO 공식 팀 순위 크롤러 (게임차/연속/홈원정)
- ✅ 네이버 스포츠 선발 라인업 크롤러 (homeStarterName/awayStarterName)
- ✅ Open-Meteo 날씨 크롤러
- ✅ APScheduler 10개 태스크 자동 실행 (06:00~익일 00:00)
- ✅ Supabase 자동 동기화 파이프라인 (app/sync.py, 9개 테이블)
- ✅ 시즌 데이터 부트스트랩 스크립트 (build_real_season.py)

### Phase 2 — 예측 엔진 ✅ 완료

- ✅ ELO 레이팅 시스템 (K팩터 32→20, 시즌 평균 회귀)
- ✅ 선발 투수 보정 (ERA/WHIP 기반 pitcher_score)
- ✅ 최근 흐름 계산 (승률 + 득실차 복합)
- ✅ 복합 예측 모델 v2.0 (7지표 가중치: ELO 40% / 선발 28% / 흐름 14% / 홈이점 8% / 파크 5% / 날씨 3% / 불펜 2%)
- ✅ 파크팩터 반영 (구장별 factor/hr_factor)
- ✅ 날씨 보정 (기온·우천 위험)
- ✅ 불펜 소진도 (3일 누적 이닝 기반 fatigue_score)
- ✅ **예측 신뢰도 지수** — 7개 지표 방향 일치율 (높음/보통/낮음)
- ✅ 예측 스냅샷 저장 (prediction_runs, 불변 이력)
- ✅ 결과 정산 자동화 (is_correct, Brier Score, settlement_status)
- ⏸ 백테스팅 고도화 (Brier Score + Calibration 분석)

### Phase 3 — API 서버 ✅ 완료

- ✅ FastAPI + SQLAlchemy 2.0 (async)
- ✅ 경기/팀/투수/선수/예측/통계 엔드포인트
- ✅ 선발투수 K/BB 제구력 지수 API 포함
- ✅ 예측 신뢰도 지수 API 포함
- ✅ N+1 쿼리 최적화 (aliased JOIN, 벌크 로드)
- ✅ CORS 설정
- 📋 JWT 관리자 인증 (미착수)

### Phase 4 — 프론트엔드 ✅ 완료

- ✅ Next.js 14 App Router + TypeScript + Tailwind CSS
- ✅ 메인 페이지: 오늘의 경기 + 예측 바 + **신뢰도 배지** + 팀 순위 사이드바
- ✅ 경기 상세: ELO 비교 바 + 선발 K/BB 대결 + 파크팩터 슬라이더 + 불펜 소진도
- ✅ **선발투수 K/BB 제구력 지수** + 승패 기록 표시
- ✅ **홈/원정 성적 + 구장 인사이트 한 줄 요약**
- ✅ 팀 순위: 게임차/연속/홈원정/ELO
- ✅ 선수 기록 순위: 타자(OPS/AVG 등) / 투수(ERA/WHIP 등), 팀 필터
- ✅ 경기 일정/결과 페이지 (날짜 이동)
- ✅ ISR 캐시 전략 최적화 (경기 5분, 순위 30분)

### Phase 5 — 배포 인프라 ✅ 완료

- ✅ 로컬: Docker Compose (PostgreSQL + Redis + FastAPI)
- ✅ DB: Supabase (PostgreSQL 17, 싱가포르)
- ✅ 크롤러: 집 PC Docker 자동 실행 → Supabase 동기화
- ✅ GitHub: mandu965/lee_kbo (main 브랜치)
- ✅ render.yaml + Dockerfile (Render Web Service 배포 설정)
- 🔄 Render API 배포 (진행 중)
- 📋 Vercel 프론트 배포 (미착수)

### Phase 6 — 고도화 예정 📋

- 📋 선발 변경 감지 및 재예측 트리거
- 📋 타자 vs 투수 상성 분석 (표본 충분 시)
- 📋 홈/원정 스플릿 예측 반영
- 📋 선수 상세 페이지 (시즌 기록 + 최근 10경기)
- 📋 경기 박스스코어 (라인업 + 이닝별 득점)
- 📋 모델 버전 A/B 비교
- 📋 알림 기능 (Web Push)

---

## 12. 디렉토리 구조

### 백엔드

```
kbo-predictor-backend/
├── app/
│   ├── main.py                 # FastAPI 앱 진입점
│   ├── config.py               # 환경변수 설정
│   ├── database.py             # DB 연결 / 세션
│   ├── models/                 # SQLAlchemy 모델
│   │   ├── team.py
│   │   ├── player.py
│   │   ├── game.py
│   │   ├── pitcher_stat.py
│   │   └── prediction.py
│   ├── schemas/                # Pydantic 스키마
│   │   ├── game.py
│   │   ├── team.py
│   │   └── prediction.py
│   ├── routers/                # API 라우터
│   │   ├── games.py
│   │   ├── teams.py
│   │   ├── pitchers.py
│   │   └── predictions.py
│   ├── engine/                 # 예측 엔진
│   │   ├── elo.py
│   │   ├── predictor.py
│   │   └── form_calculator.py
│   ├── crawler/                # 크롤러
│   │   ├── base.py
│   │   ├── kbo_schedule.py
│   │   ├── statiz.py
│   │   └── weather.py
│   └── scheduler/              # APScheduler
│       └── main.py
├── alembic/                    # DB 마이그레이션
├── tests/
├── .env.example
├── requirements.txt
├── Dockerfile
└── docker-compose.yml
```

### 프론트엔드

```
kbo-predictor-frontend/
├── app/                        # Next.js App Router
│   ├── page.tsx                # 메인 (오늘의 경기)
│   ├── layout.tsx
│   ├── games/[id]/page.tsx     # 경기 상세
│   ├── teams/page.tsx          # 팀 순위
│   ├── teams/[id]/page.tsx     # 팀 상세
│   ├── pitchers/page.tsx       # 선발 투수
│   └── history/page.tsx        # 예측 히스토리
├── components/
│   ├── GameCard.tsx
│   ├── WinProbBar.tsx
│   ├── RecentFormBadges.tsx
│   ├── StarterCard.tsx
│   ├── EloChart.tsx            # Recharts
│   └── AccuracyBadge.tsx
├── lib/
│   ├── api.ts                  # API 클라이언트
│   └── types.ts                # TypeScript 타입 정의
├── public/
│   └── team-logos/             # 팀 로고 이미지
├── next.config.ts
├── tailwind.config.ts
└── package.json
```

---

## 13. 배포 전략

### 환경 구성

| 환경 | 백엔드 | 프론트엔드 |
|------|--------|-----------|
| Local | docker-compose | next dev |
| Staging | 기존 서버 (포트 분리) | Vercel Preview |
| Production | 기존 서버 + Nginx | Vercel Production |

### 환경변수 (.env)

```env
# 백엔드
DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5433/kbo_predictor
REDIS_URL=redis://localhost:6380/1
SECRET_KEY=your-secret-key-here
ALLOWED_ORIGINS=https://kbo-predictor.vercel.app

# 프론트엔드
NEXT_PUBLIC_API_URL=https://api.kbo-predictor.com/v1
```

### Nginx 설정 (백엔드 프록시)

```nginx
server {
    listen 80;
    server_name api.kbo-predictor.com;

    location /v1/ {
        proxy_pass http://127.0.0.1:8002;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

---

## 참고 자료

- [KBO 공식 사이트](https://www.koreabaseball.com)
- [Statiz (야구 통계)](https://statiz.sporki.com)
- [Open-Meteo (무료 날씨 API)](https://open-meteo.com)
- [FastAPI 공식 문서](https://fastapi.tiangolo.com)
- [Next.js 공식 문서](https://nextjs.org/docs)

---

## 14. 개발 테스트 명령어

### 크롤러 + 엔진 수동 실행 (크롤러는 외부망 필요)

```bash
# backend/ 디렉토리에서 실행
cd backend

# 경기 일정 수집
python -m scripts.crawl_now --task schedule --year 2026 --month 5

# 경기 결과 업데이트
python -m scripts.crawl_now --task results

# Statiz 팀/투수 성적 수집
python -m scripts.crawl_now --task statiz --year 2026

# 날씨 수집
python -m scripts.crawl_now --task weather

# 오늘 경기 예측 생성 (DB에 팀/경기 데이터 있어야 함)
python -m scripts.crawl_now --task predict

# 전날 경기 결과로 ELO 업데이트
python -m scripts.crawl_now --task elo

# 전체 한 번에
python -m scripts.crawl_now --task all
```

### 크롤러 셀렉터 검증 체크리스트

크롤러 최초 실행 전 브라우저 DevTools (F12 → Network/Elements) 에서 아래 항목을 확인해야 합니다.

| 항목 | 확인 위치 | 파일 |
|------|----------|------|
| KBO 일정 테이블 id/class | `koreabaseball.com/Schedule/Schedule.aspx` Elements | `crawler/kbo_schedule.py` |
| KBO ViewState POST 파라미터명 | Network → Form Data | `crawler/kbo_schedule.py` |
| KBO 팀명 span class (`away`/`home`) | Elements → td.vs | `crawler/kbo_schedule.py` |
| Statiz 팀 코드 목록 | URL 파라미터 `teamCode=` 실제값 | `crawler/statiz.py` |
| Statiz 투수 테이블 컬럼 헤더 | Elements → thead > th | `crawler/statiz.py` |

### 백테스팅

```bash
cd backend

# 1. 시즌 전체 과거 경기 생성 (4월 1일 ~ 전날, 약 250경기)
python -m scripts.generate_season_data

# 2. 백테스팅 실행 (타임라인 순서, 데이터 누수 없음)
python -m scripts.backtest --start 2026-04-01 --end 2026-05-28

# 특정 월만
python -m scripts.backtest --start 2026-04-01 --end 2026-04-30

# CSV 저장
python -m scripts.backtest --csv results/backtest_2026.csv
```

### 시드 데이터 생성 (외부망 불필요 — 임의 데이터로 API 즉시 테스트)

```bash
cd backend
python -m scripts.seed_data
```

생성 내용: 10개 팀 / 선발 투수 30명 / 과거 경기 25경기(ELO 히스토리) / 오늘 경기 5경기 + 예측

### 컨테이너 실행

```bash
# 루트 디렉토리에서
cp .env.example .env
docker-compose up -d

# 로그 확인
docker-compose logs -f api

# API 헬스체크
curl http://localhost:8002/health
```

### 프론트엔드 실행 (Next.js)

```bash
cd frontend
npm install
npm run dev
# → http://localhost:3000
```

| 페이지 | URL |
|--------|-----|
| 오늘의 경기 | http://localhost:3000 |
| 경기 상세 | http://localhost:3000/games/1 |
| 팀 순위 | http://localhost:3000/teams |
| 팀 상세 | http://localhost:3000/teams/1 |
| 선발 투수 | http://localhost:3000/pitchers |
| 예측 히스토리 | http://localhost:3000/history |

### API 엔드포인트 테스트

```bash
# 오늘 경기 + 예측
curl http://localhost:8002/v1/games/today

# 날짜 지정
curl "http://localhost:8002/v1/games?date=2026-05-29"

# 경기 예측 근거
curl http://localhost:8002/v1/games/1/prediction

# 팀 순위
curl http://localhost:8002/v1/teams

# 팀 최근 10경기
curl http://localhost:8002/v1/teams/1/recent

# ELO 히스토리
curl http://localhost:8002/v1/teams/1/elo-history

# 오늘 선발 투수
curl http://localhost:8002/v1/pitchers/today

# 시즌 적중률
curl http://localhost:8002/v1/predictions/accuracy

# 예측 히스토리
curl http://localhost:8002/v1/predictions/history

# 스트릭
curl http://localhost:8002/v1/predictions/streak

# Swagger UI (브라우저)
open http://localhost:8002/docs
```

---

*이 문서는 개발 진행에 따라 지속적으로 업데이트됩니다.*
