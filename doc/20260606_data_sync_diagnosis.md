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

현재 운영 원본은 로컬 DB이고, 웹 DB는 조회용 복제본이다. 로컬 `.env`에는 `DATABASE_WEB_URL`이 설정되어 있으므로 로컬 스케줄러가 실행되면 Supabase 웹 DB로 sync할 수 있다.

운영 기준:

- 로컬 DB: 원본 데이터, 스케줄러/크롤러/예측 생성 기준
- 웹 DB: Render 조회용 복제본
- 로컬 DB를 기준으로 웹 DB를 맞출 때: `crawl_now --task sync`
- 웹 DB를 로컬로 가져오는 `pull_from_web`은 복구/비교가 필요한 경우에만 사용

주의:

- 무조건 `pull_from_web`을 실행하면 원본인 로컬 데이터를 웹 조회 DB 상태로 덮어쓸 수 있다.
- 특히 예측값은 `teams.home_elo`, `teams.away_elo`, `predictions`, `prediction_runs`가 함께 맞아야 한다.

## 검증

수정 후 확인:

- `python -m compileall backend/app/sync.py backend/scripts/pull_from_web.py`
- `docker exec kbo_api python -m pytest tests/test_analytics.py`

결과:

- compile 통과
- 컨테이너 pytest `3 passed`

## 후속 조치

1. 상세페이지 데이터 신뢰도 표시

완료. 예측 생성 시각, 데이터 완성도, 반영 지표, 대기 데이터를 프리뷰 화면에서 바로 확인할 수 있게 했다.

2. 1회 수동 동기화

로컬 DB를 기준으로 웹 DB를 한 번 맞춘다.

3. 스케줄러 단일화 검토

운영 예측은 로컬 스케줄러에서만 생성하고, Render는 조회용으로만 쓰는 편이 안전하다. Render 백엔드 스케줄러가 동시에 예측을 생성하면 로컬 원본과 웹 복제본 사이에 충돌이 생길 수 있다.

4. 스케줄러 실행 상태 가시화

크롤링, ELO, 예측, sync 작업의 마지막 실행 시각과 성공/실패 상태를 관리자 화면 또는 운영 API에서 확인할 수 있게 한다.
