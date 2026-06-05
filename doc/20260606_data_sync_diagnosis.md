# 로컬/웹 데이터 차이 점검

작성일: 2026-06-06

## 증상

같은 날짜/경기에서 로컬과 Render 웹의 예측 승률이 다르게 표시됐다.

예시: 2026-06-06, game 301, KT vs SSG

- 웹: SSG 44.5% / KT 55.5%
- 로컬: SSG 51.7% / KT 48.3%

## 확인 결과

API 원본을 비교한 결과, 예측 스케줄러 자체보다 예측에 쓰이는 팀 ELO 데이터가 서로 달랐다.

웹:

- generated_at: `2026-06-06T00:20:32`
- SSG home_elo: `1469.433`
- KT away_elo: `1575.0872`

로컬:

- generated_at: `2026-06-06T00:10:18`
- SSG home_elo: `1519.7123`
- KT away_elo: `1490.2877`

## 원인

`sync_after_elo()`는 `teams`를 동기화하도록 되어 있었지만, 실제 sync 컬럼 목록에 `home_elo`, `away_elo`가 빠져 있었다.

영향:

- `elo_rating`은 동기화된다.
- 하지만 예측 엔진이 사용하는 `home_elo`, `away_elo`는 동기화되지 않는다.
- 로컬과 웹이 서로 다른 홈/원정 ELO로 예측을 계산할 수 있다.

## 수정

다음 파일의 `teams` 동기화 컬럼에 `home_elo`, `away_elo`를 추가했다.

- `backend/app/sync.py`
- `backend/scripts/pull_from_web.py`

## 운영 주의

현재 로컬 `.env`에는 `DATABASE_WEB_URL`이 설정되어 있다. 따라서 로컬 스케줄러가 실행되면 Supabase 운영 DB로 sync할 수 있다.

운영 기준을 명확히 해야 한다.

- Render DB를 기준으로 로컬을 맞출 때: `pull_from_web`
- 로컬 DB를 기준으로 웹을 맞출 때: `crawl_now --task sync`

주의:

- 무조건 sync를 실행하면 최신 운영 데이터를 로컬 데이터로 덮어쓸 수 있다.
- 특히 예측값은 `teams.home_elo`, `teams.away_elo`, `predictions`, `prediction_runs`가 함께 맞아야 한다.

## 검증

수정 후 확인:

- `python -m compileall backend/app/sync.py backend/scripts/pull_from_web.py`
- `docker exec kbo_api python -m pytest tests/test_analytics.py`

결과:

- compile 통과
- 컨테이너 pytest `3 passed`

## 다음 조치 후보

1. 기준 DB 결정

Render 운영 DB를 기준으로 삼을지, 로컬 DB를 기준으로 삼을지 결정한다.

2. 1회 수동 동기화

기준 DB를 정한 뒤 한 번만 수동 동기화한다.

3. 스케줄러 단일화 검토

운영 예측은 Render에서만 생성하고, 로컬은 개발/검증용으로만 쓰는 편이 안전하다. 로컬에서 `DATABASE_WEB_URL`을 켜둔 채 스케줄러를 장시간 실행하면 운영 데이터와 충돌할 수 있다.
