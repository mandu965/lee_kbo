# KBO Predictor PRD
# SEO 콘텐츠 자동화 모듈 (경량 MVP)

Version: 1.0
작성일: 2026-06-02

---

# 1. 개요

KBO Predictor의 자정 배치(`task_midnight_batch`) 및 일중 예측 업데이트가 완료된 후, 매일 생성되는 데이터를 템플릿에 적용하여 블로그 게시용 글 초안을 **파일로 출력**하는 경량 스크립트를 만든다.

운영자는 출력된 파일을 열어 내용을 확인하고, 복사하여 네이버 블로그 또는 티스토리에 **직접 수동 게시**한다.

본 모듈은 DB·API·웹 UI 없이 동작하는 **단일 생성 스크립트 + 템플릿 + 출력 폴더** 구조의 내부 운영 도구이다.

목적:

- KBO 경기 예측 관련 검색 유입 증가
- 블로그 콘텐츠 자산 축적
- KBO Predictor 브랜드 노출 증가
- 사이트 방문자 증가
- 애드센스 수익 기반 확보

---

# 2. 문제 정의

현재 KBO Predictor는 다음 데이터를 매일 생성한다.

- 오늘 경기 예측 (`predictions`, `prediction_runs` 테이블)
- 팀 ELO 레이팅 (`teams.elo_rating` + `elo_history` 테이블)
- 팀 순위 (`team_season_standings` 테이블)
- 선발 투수 성적 (`pitcher_stats`, `players` 테이블)
- 경기 결과 및 예측 적중률 (`predictions.is_correct`, `predictions.brier_score`)

그러나 해당 데이터가 외부 검색 유입으로 연결되지 않고 있다.

---

# 3. 목표

## 단기 목표

매일 데이터 기반 글 초안을 파일로 자동 출력

운영자가 복사하여 즉시 게시 가능한 수준으로 제공

---

## 중기 목표

6개월 내 180개 이상 콘텐츠 누적 게시

---

## 장기 목표

1년 내 365개 이상 콘텐츠 누적 게시

네이버 / 티스토리 검색 유입 확보

KBO Predictor 브랜드 구축

---

# 4. 범위

## 포함

데이터 리포트형 콘텐츠 (오늘의 경기 예측, ELO 순위, 예측 적중률 리포트)

네이버 블로그용 plain text 파일 출력

티스토리용 markdown 파일 출력

Jinja2 템플릿 기반 생성 스크립트

---

## 제외

자동 게시 (블로그 업로드는 운영자가 수동 수행)

SNS 자동 발행

LLM / GPT API 실시간 호출

content_drafts DB 테이블, 콘텐츠 API, 웹 UI (→ §15 향후 확장)

KBO Predictor 사이트 내부 블로그/리포트 페이지 자동 연동

---

# 5. 시스템 구조

## 전체 흐름

```
자정 배치 완료 (Render 클라우드, 00:10 KST)
  task_midnight_batch 실행
    → 전날 결과 정산, ELO 업데이트, 투수·타자·순위 갱신, 예측 초안 생성
  ↓
15:00 최종 예측 생성/갱신 완료 (선발 라인업 확정 후)
  task_update_predictions 실행
  ↓
[16:00] generate_blog_posts.py 실행 (로컬 머신 또는 수동)
  ├─ 데이터 읽기: DB(DATABASE_URL)
  └─ Jinja2 템플릿 적용
  ↓
backend/backend/outputs/blog_drafts/ 에 파일 출력
  2026-06-02_typeA_naver.txt      ← 오늘의 경기 예측
  2026-06-02_typeA_tistory.md
  2026-06-02_typeB_naver.txt      ← ELO 팀 순위/강팀 분석
  2026-06-02_typeB_tistory.md
  2026-06-02_typeC_naver.txt      ← 예측 적중률 리포트
  2026-06-02_typeC_tistory.md
  (Docker 볼륨: 컨테이너 /app/outputs/blog_drafts/ ↔ 로컬 backend/outputs/blog_drafts/)
  ↓
운영자가 폴더에서 파일 열기 → 복사
  ↓
네이버 블로그 또는 티스토리에 수동 게시
```

## 구현 위치

KBO Predictor 백엔드는 **Render 클라우드**에서 동작하며, 데이터는 Supabase PostgreSQL에 저장된다 (`DATABASE_WEB_URL`).

신규 콘텐츠 생성 스크립트는 **로컬 머신**에서 `DATABASE_URL` 또는 `DATABASE_WEB_URL`로 Supabase에 직접 조회하여 실행한다. Render에 별도 서비스를 만들지 않는다. 기존 백엔드 코드는 변경하지 않는다.

신규 구현 대상:

- `backend/app/scheduler/tasks.py` — `task_generate_blog()` 태스크 함수
- `backend/templates/blog/` — Jinja2 템플릿 6개 + variations.json
- `backend/outputs/blog_drafts/` — 출력 폴더 (Docker 볼륨 마운트로 로컬에서 직접 확인 가능)

---

# 6. 데이터 소스

## 6.1 오늘의 경기 예측 (TYPE_A)

데이터: `predictions` JOIN `games` JOIN `teams` JOIN `players`

백엔드 API: `GET /v1/games?date={today}` (기존 `games.router` 재사용 가능)

또는 DB 직접 조회:

```sql
SELECT
  g.game_date, g.stadium, g.start_time,
  ht.name AS home_team, at.name AS away_team,
  ht.elo_rating AS home_elo, at.elo_rating AS away_elo,
  p.home_win_prob, p.away_win_prob,
  p.predicted_winner_id,
  p.elo_diff,
  p.pitcher_score_home, p.pitcher_score_away,
  p.recent_form_home, p.recent_form_away,
  pr.key_factors, pr.data_completeness,
  pr.feature_snapshot,
  hp.name AS home_starter, ap.name AS away_starter
FROM games g
JOIN teams ht ON g.home_team_id = ht.id
JOIN teams at ON g.away_team_id = at.id
LEFT JOIN predictions p ON g.id = p.game_id
LEFT JOIN (
  SELECT DISTINCT ON (game_id) *
  FROM prediction_runs
  WHERE is_published = TRUE
  ORDER BY game_id, generated_at DESC
) pr ON g.id = pr.game_id
LEFT JOIN players hp ON g.home_starter_id = hp.id
LEFT JOIN players ap ON g.away_starter_id = ap.id
WHERE g.game_date = :today
  AND g.status = 'scheduled'
ORDER BY g.start_time;
```

주요 필드:

- `home_win_prob`, `away_win_prob`: 홈/원정 승리 확률
- `predicted_winner_id`: AI 예측 승자
- `elo_diff`: ELO 레이팅 차이 (홈팀 기준)
- `pitcher_score_home / away`: 선발 투수 평가 점수 (ERA/WHIP 기반)
- `recent_form_home / away`: 최근 10경기 폼 점수
- `key_factors`: 핵심 예측 요인 목록 (최대 5개)
- `data_completeness`: 예측 데이터 완전성 (%)
- `feature_snapshot.confidence_level`: 예측 신뢰도 ("높음"/"보통"/"낮음")

---

## 6.2 ELO 팀 순위 (TYPE_B)

데이터: `teams` + `team_season_standings` + `elo_history`

```sql
-- 현재 ELO 순위
SELECT
  t.name, t.code, t.elo_rating,
  s.rank, s.wins, s.losses, s.draws, s.win_pct, s.games_behind, s.streak
FROM teams t
LEFT JOIN team_season_standings s
  ON t.id = s.team_id AND s.season = :season
ORDER BY t.elo_rating DESC;
```

```sql
-- 최근 7일 ELO 변동 (상승/하락 팀 파악)
SELECT
  t.name, t.code,
  SUM(h.elo_change) AS elo_change_7d,
  COUNT(*) AS games_played
FROM elo_history h
JOIN teams t ON h.team_id = t.id
WHERE h.game_date >= :today - INTERVAL '7 days'
GROUP BY t.id, t.name, t.code
ORDER BY elo_change_7d DESC;
```

주요 필드:

- `elo_rating`: 현재 ELO 레이팅 (초기값 1500)
- `rank`: 시즌 현재 순위
- `win_pct`: 승률
- `streak`: 현재 연속 승패 (예: "3연승")
- `elo_change_7d`: 최근 7일 ELO 변동량 (상승=좋은 흐름)

---

## 6.3 예측 적중률 리포트 (TYPE_C)

데이터: `predictions` + `prediction_runs` + `games`

```sql
-- 이번 달 예측 적중률
SELECT
  COUNT(*) AS total,
  SUM(CASE WHEN is_correct THEN 1 ELSE 0 END) AS correct,
  ROUND(AVG(brier_score)::numeric, 4) AS avg_brier
FROM predictions p
JOIN games g ON p.game_id = g.id
WHERE EXTRACT(year FROM g.game_date) = :season
  AND EXTRACT(month FROM g.game_date) = :month
  AND p.is_correct IS NOT NULL;
```

```sql
-- 최근 적중/실패 스트릭 (직전 5경기)
SELECT
  g.game_date,
  ht.name AS home_team, at.name AS away_team,
  p.home_win_prob, p.away_win_prob,
  pw.name AS predicted_winner, aw.name AS actual_winner,
  p.is_correct
FROM predictions p
JOIN games g ON p.game_id = g.id
JOIN teams ht ON g.home_team_id = ht.id
JOIN teams at ON g.away_team_id = at.id
LEFT JOIN teams pw ON p.predicted_winner_id = pw.id
LEFT JOIN teams aw ON p.actual_winner_id = aw.id
WHERE p.is_correct IS NOT NULL
ORDER BY g.game_date DESC
LIMIT 5;
```

주요 필드:

- `total`: 정산 완료 예측 수
- `correct`: 적중 수
- `avg_brier`: 평균 브라이어 점수 (낮을수록 우수, 0~1)
- 최근 경기별 예측 결과 (O/X)

---

# 7. 콘텐츠 유형

## TYPE_A — 오늘의 KBO 경기 AI 예측

생성 주기: 매일 (경기 있는 날)

생성 시점: 15:00 최종 예측 완료 후 (16:00 권장)

데이터 소스: `predictions`, `prediction_runs`, `games`, `teams`, `players`

표현 규칙:

- `data_completeness >= 75%`인 경기만 "예측 신뢰도 있음"으로 표현
- `confidence_level="높음"`인 경기는 강조 표현 가능
- 선발 투수 미확정(`home_starter_id IS NULL`)인 경기는 "선발 미정" 명시
- 승리 확률을 수치로 제시할 때 "예측 확률"임을 반드시 명시
- 확률 60% 이상을 "유력", 55~60%를 "약세 우위", 50~55%를 "박빙"으로 표현

---

## TYPE_B — KBO 팀 ELO 순위 분석

생성 주기: 매일 (전날 경기 결과 반영 후)

생성 시점: 자정 배치 완료 후 (09:00 권장)

데이터 소스: `teams`, `team_season_standings`, `elo_history`

표현 규칙:

- ELO 순위와 공식 순위의 차이가 있는 경우 해석 제공 (ELO 기반 전력 vs 현재 승률)
- 최근 7일 ELO 상승 상위 3팀 = "상승세 팀"으로 표현
- ELO 초기값(1500) 기준: 1500 이상이면 평균 이상 팀

---

## TYPE_C — AI 예측 적중률 주간 리포트

생성 주기: 주 1회 (매주 월요일, 전주 결과 정산 후)

생성 시점: 자정 배치 완료 후 (09:00 권장)

데이터 소스: `predictions`, `prediction_runs`, `games`

표현 규칙:

- 적중률을 "AI가 맞혔다"가 아닌 "모델 예측이 일치했다" 표현
- 브라이어 점수는 설명과 함께 제공 (낮을수록 좋음)
- 과거 적중률 데이터 부족 초기(총 예측 20건 미만)에는 TYPE_C 생성 건너뜀

---

비고: 선발 투수 개인 분석(투수 성적 심층 비교)은 `pitcher_stats` 데이터가 충분히 축적된 후 §15 확장 단계에서 TYPE_D로 추가한다.

---

# 8. 출력 포맷 및 파일 규칙

## 8.1 출력 위치 및 파일명

출력 폴더: `backend/outputs/blog_drafts/`

파일명 규칙: `{source_date}_{type}_{platform}.{ext}`

```
2026-06-02_typeA_naver.txt
2026-06-02_typeA_tistory.md
2026-06-02_typeB_naver.txt
2026-06-02_typeB_tistory.md
2026-06-02_typeC_naver.txt    ← 주 1회 (월요일)
2026-06-02_typeC_tistory.md
```

동일 파일이 이미 존재하면 덮어쓰지 않고 건너뛴다(중복 생성 방지). 재생성이 필요하면 기존 파일 삭제 후 실행한다.

---

## 8.2 네이버 블로그 (plain text)

```
[제목]
2026-06-02 KBO 오늘 경기 AI 승리 예측 — LG vs KIA 외 4경기

[본문 구성]
1. 오늘의 AI 예측 요약 (경기별 승리 확률)
2. 경기별 핵심 포인트 (선발 투수 비교, 최근 흐름)
3. AI 예측 신뢰도 안내
4. 이번 주 모델 적중률
5. 면책 고지
```

---

## 8.3 티스토리 (markdown)

```markdown
---
title: {제목}
category: KBO 경기 분석
tags: [KBO, 야구, 승리예측, AI분석, 오늘경기]
---

# {제목}

## 오늘의 경기 예측 요약

## 경기별 AI 분석

### {홈팀} vs {원정팀}

## AI 예측 신뢰도 안내

> 면책 고지
```

---

# 9. 템플릿 구조

위치: `templates/blog/`

```
templates/blog/
  type_a_naver.txt.j2      ← 오늘의 경기 예측 (네이버)
  type_a_tistory.md.j2     ← 오늘의 경기 예측 (티스토리)
  type_b_naver.txt.j2      ← ELO 팀 순위 분석 (네이버)
  type_b_tistory.md.j2     ← ELO 팀 순위 분석 (티스토리)
  type_c_naver.txt.j2      ← 예측 적중률 리포트 (네이버)
  type_c_tistory.md.j2     ← 예측 적중률 리포트 (티스토리)
```

- Jinja2 문법 사용
- 템플릿은 데이터를 받아 본문 문자열을 렌더링
- 면책 고지·금지 표현 규칙(§10)을 모든 템플릿에 내장

---

# 10. 콘텐츠 생성 규칙

## 반드시 포함

- 경기 날짜, 홈팀 vs 원정팀 구도
- AI 예측 승리 확률 (수치 + 예측임을 명시)
- 예측의 근거 요인 (key_factors: ELO, 선발 투수, 최근 흐름 등)
- 데이터 완전성/신뢰도 안내 (`data_completeness`)
- 면책 고지

---

## 면책 고지 — 모든 콘텐츠에 필수 포함

```
본 예측은 통계 모델 기반 참고 정보이며, 실제 경기 결과와 다를 수 있습니다.
스포츠 베팅 등 금전적 결정의 근거로 사용하지 마십시오.
```

---

## 금지 표현

- 반드시 이긴다 / 무조건 승리
- 승리 보장 / 결과 보장
- 확실한 예측 / 100% 예측
- 베팅 추천 / 도박 관련 표현
- 특정 팀 일방적 비하

---

## 운영 상태 기반 표현 규칙

- 생성 전 대상 날짜에 `predictions` 데이터가 존재하는지 검증
- 예측이 없는 날짜(무경기일, 데이터 미수집)에는 신규 콘텐츠를 생성하지 않는다
- `data_completeness < 50%`인 경기는 "데이터 부족으로 신뢰도 낮음" 표기
- `confidence_level="낮음"`인 경기는 예측 수치를 강조하지 않음
- 선발 투수 `NULL`인 경우: "선발 미정" 표기, 투수 비교 섹션 생략

---

## 10.5 저품질(유사문서) 회피 전략

매일 동일 형식·문구의 글을 올리면 네이버/티스토리에서 유사문서(저품질)로 분류될 위험이 있다. 시스템과 운영 양쪽에서 완화한다.

### 시스템 측 (변형 엔진)

`scripts/blog_variation.py` + `templates/blog/variations.json`으로 다음을 자동 변형한다.

#### 변형 메커니즘

- **시드 기반 결정적 변형**: 시드 = `날짜 + 유형 + 플랫폼(+팀코드)`. 같은 날 같은 입력이면 동일 결과(멱등·재현), 날짜가 바뀌면 각 슬롯이 자동으로 달라진다.
- **플랫폼 교차 중복 방지**: 네이버/티스토리는 시드 살트가 달라 같은 날이라도 제목·문구·구조가 서로 다르게 생성된다. (네이버=대화체 plain text, 티스토리=표·헤더 포함 markdown)
- **데이터 기반 본문 차별화**: 경기 조합·확률·선발 투수·key_factors가 매일 바뀌므로 본문 텍스트 자체가 매일 달라진다.
- **면책 고지·금지 표현은 변형 제외**: 법적·운영 일관성 유지.

#### 슬롯별 최소 후보 수 기준 (variations.json 구현 시 준수)

| 슬롯 | 적용 유형 | 최소 후보 수 | 예시 |
|------|-----------|-------------|------|
| 제목 패턴 | A / B / C | **12개 이상** | "오늘의 KBO 예측", "AI가 본 오늘 KBO 승부", "KBO 경기 전망", "승부 가른 변수", "오늘 야구 AI 분석" 등 |
| 도입 문구 | A / B / C | **10개 이상** | 날씨 연계형, 이전 경기 언급형, 팀 분위기형, 순위 언급형, 시즌 흐름형 등 |
| 경기 서술 중심축 | A | **5개 이상** | ELO 우위 중심 / 선발 투수 중심 / 최근 흐름 중심 / 홈 이점 중심 / 박빙 구도 중심 |
| 팀 수식어 | A / B | **팀당 6개 이상** | "상승세의", "안정적인", "변수가 많은", "주춤하는", "최근 좋은 흐름의", "전력이 탄탄한" 등 |
| 연결어·전환 문구 | A / B / C | **8개 이상** | "특히", "주목할 점은", "눈여겨볼 것은", "여기서 변수는", "또한", "한편" 등 |
| 마무리 문구 | A / B / C | **8개 이상** | "오늘도 좋은 경기를", "결과가 궁금하다면", "AI 예측과 실제 결과를 비교해보세요" 등 |
| ELO 설명 방식 | B | **4개 이상** | 순위 테이블 중심 / 상승세 팀 중심 / ELO vs 공식순위 괴리 중심 / 주간 변동 중심 |
| 적중률 서술 방식 | C | **4개 이상** | 누적 전체 중심 / 이번 달 중심 / 브라이어 점수 설명 중심 / 최근 스트릭 중심 |

#### 섹션 순서 변형 (TYPE_A)

경기가 여러 건인 날, 경기 서술 순서를 날짜 시드로 변형한다.

- 순서 A: 예측 확률 차이가 큰 경기 → 박빙 경기 순 (= 확도 높은 것부터)
- 순서 B: 경기 시작 시간 순 (실제 관람 순서)
- 순서 C: key_factors 개수가 많은 경기 선두 배치 (볼거리 많은 경기 먼저)
- 순서 D: 홈팀 가나다 순

날짜 시드로 4가지 중 하나를 선택하여 섹션 순서가 매일 달라지게 한다.

#### 최소 글자 수 보장

각 유형별 최소 출력 글자 수를 템플릿 렌더링 후 검증한다. 미달 시 생성 실패로 처리하고 로그에 기록한다.

| 유형 | 플랫폼 | 최소 글자 수 |
|------|--------|-------------|
| TYPE_A (경기 3건 이상) | 네이버 / 티스토리 | **1,800자 이상** |
| TYPE_A (경기 1~2건) | 네이버 / 티스토리 | **1,200자 이상** |
| TYPE_B | 네이버 / 티스토리 | **1,500자 이상** |
| TYPE_C | 네이버 / 티스토리 | **1,200자 이상** |

글자 수를 채우기 위한 패딩(무의미한 반복 문장)은 금지. **데이터 기반 본문 확장**으로만 충족한다.

TYPE_A에서 경기가 적어 글자 수 부족 시 다음 순서로 보완한다:

1. key_factors 각 항목을 단문 → 2~3문장으로 풀어쓰기
2. 선발 투수 최근 3경기 ERA 추이 서술 (데이터 있는 경우)
3. 두 팀의 최근 5경기 결과 나열 (W/L → "최근 5경기 3승 2패" 형태로 서술)
4. 모델 신뢰도(`data_completeness`) 수치와 누락 지표 풀어쓰기

### 운영 측 (수동 권장)

- **게시 시각 분산**: 매일 같은 시각에 기계적으로 올리지 않는다.
- **이미지 차별화**: 매번 동일 이미지 재사용을 피한다. (템플릿에 이미지 삽입 위치 안내 포함)
- **플랫폼별 분리 게시 권장**: 변형 엔진이 다른 결과를 주지만, 가능하면 한쪽은 직접 한두 문장 가필한다.
- **주기적 수동 가필**: 주 1~2회는 도입/마무리에 운영자 코멘트를 직접 추가해 자동 생성 패턴을 흐린다.
- **게시 이력 관리**: 스프레드시트 등으로 어디에 올렸는지 기록하여 중복 게시를 방지한다.

### 향후 확장

- 문구 풀 확대(슬롯당 20개 이상) 및 구조 스킨(섹션 순서 패턴) 다중화
- §15.5 LLM 엔진 도입 시 문장 자연스러움·다양성 대폭 향상

---

# 11. 생성 스크립트

## scripts/generate_blog_posts.py

실행 예시

```bash
# 오늘 날짜 기준 전체 유형 생성
python scripts/generate_blog_posts.py

# 특정 날짜 / 특정 유형
python scripts/generate_blog_posts.py --date 2026-06-02 --type A

# TYPE_A만 (경기 있는 날 16:00 이후)
python scripts/generate_blog_posts.py --type A
```

동작

1. 대상 날짜 결정 (인자 없으면 오늘 KST)
2. DB 연결 확인 (`DATABASE_URL` 또는 `DATABASE_WEB_URL`)
3. 데이터 유효성 검증
   - TYPE_A: 해당 날짜 `predictions` 레코드 존재 여부 확인
   - TYPE_B: `teams.elo_rating` 갱신 여부 (`elo_history.game_date` 최신 확인)
   - TYPE_C: 월요일 여부 + 정산 완료 예측 20건 이상 확인
4. 유형별 Jinja2 템플릿 렌더링 (네이버 / 티스토리)
5. 렌더링 후 최소 글자 수 검증 (§10.5) — 미달 시 오류 로그 후 건너뜀
6. `backend/outputs/blog_drafts/`에 파일 출력 (기존 파일 있으면 건너뜀)
7. 생성 결과 요약을 stdout 및 로그에 출력

DB 접속: `DATABASE_WEB_URL` (Supabase, 운영 DB) 우선, 없으면 `DATABASE_URL` (로컬)

```python
# 환경변수 우선순위 (backend/app/config.py와 동일한 패턴)
DATABASE_URL = os.getenv("DATABASE_WEB_URL") or os.getenv("DATABASE_URL")
```

---

# 12. 운영 절차 (수동 업로드 동선)

## TYPE_A (매일)

1. 15:00 최종 예측 생성 완료 확인 (Render 로그 또는 사이트 확인)
2. 16:00 이후 `generate_blog_posts.py --type A` 실행
3. `backend/outputs/blog_drafts/` 폴더에서 당일 파일 확인
4. 내용 검토 (이상 표현·데이터 오류 확인)
5. 복사하여 네이버 블로그 / 티스토리에 붙여넣기 후 게시

## TYPE_B (매일)

1. 자정 배치 완료 후 (익일 09:00 이후 권장) `generate_blog_posts.py --type B` 실행
2. ELO 변동 확인 후 게시

## TYPE_C (주 1회, 월요일)

1. 월요일 자정 배치 완료 후 `generate_blog_posts.py --type C` 실행
2. 전주 적중률 수치 확인 후 게시

게시 이력은 운영자가 별도로 관리(스프레드시트 등). MVP에서는 시스템이 게시 상태를 추적하지 않는다.

---

# 13. 비기능 요구사항

전체 생성 시간: 30초 이하 (3유형 × 2플랫폼)

생성 실패 시: `logs/` 디렉토리에 에러 로그 저장, 수동 재실행 가능

재실행 시 기존 출력 파일 덮어쓰지 않음 (중복 방지)

외부 의존 최소화: DB 조회 실패 시 사유를 로그에 기록하고 종료

Render 백엔드와의 결합 없음: 스크립트는 DB에만 직접 접근 (HTTP API 호출 불필요)

---

# 14. 성공 기준

매일 TYPE_A / TYPE_B 파일 출력 성공 (TYPE_C는 주 1회)

운영자가 복사하여 즉시 게시 가능한 품질

생성 글에 면책 고지 포함, 금지 표현 미포함

각 콘텐츠 최소 글자 수 충족 (§10.5 기준)

6개월 내 180건 이상 콘텐츠 누적 게시

1년 내 365건 이상 콘텐츠 누적 게시

검색 유입 및 KBO Predictor 브랜드 노출 증가

---

# 15. 향후 확장 (MVP 이후 검토)

아래는 콘텐츠 누적량이 늘고 검토·이력 관리 필요성이 생길 때 도입을 검토하는 항목이다. MVP 범위에 포함하지 않는다.

## 15.1 콘텐츠 보관 DB (content_drafts)

파일 대신 PostgreSQL에 초안을 저장하여 상태·이력 추적

```sql
CREATE TABLE public.content_drafts (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    content_type TEXT NOT NULL
        CHECK (content_type IN ('TYPE_A','TYPE_B','TYPE_C','TYPE_D')),
    title TEXT NOT NULL,
    summary TEXT,
    content_naver TEXT NOT NULL,
    content_tistory TEXT NOT NULL,
    source_date DATE NOT NULL,
    source_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    template_version TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'DRAFT'
        CHECK (status IN ('DRAFT','REVIEWED','PUBLISHED','ARCHIVED')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE,
    published_at TIMESTAMP WITH TIME ZONE,
    UNIQUE (content_type, source_date, template_version)
);
```

## 15.2 콘텐츠 API (Render web)

- `GET /v1/content` (목록, 필터: type/status/date)
- `GET /v1/content/{id}` (상세)
- `POST /v1/content/generate` (생성 트리거)
- `PUT /v1/content/{id}/status` (상태 변경)
- 인증: 기존 admin 라우터 패턴 재사용 (`/v1/admin`)

## 15.3 운영자 UI

관리자 페이지(`/admin`) 내 콘텐츠 탭 추가. 콘텐츠 목록/상세, 네이버·티스토리 복사 버튼, 상태 변경

## 15.4 선발 투수 심층 분석 콘텐츠 (TYPE_D)

`pitcher_stats` 데이터가 시즌 내 충분히 축적된 후 (게임 로그 100건 이상) 활성화.
ERA, WHIP 기반 선발 투수 매치업 분석 콘텐츠.

## 15.5 LLM 엔진 (V2)

GPT / Gemini / Claude API로 문장 자연스러움 및 SEO 품질 향상. 비용·결과 편차 고려하여 검토.

---

# 16. 의존성

- Python: `Jinja2`, `psycopg2-binary` (또는 `asyncpg` + `sqlalchemy`) — requirements에 추가
- DB 접속: Supabase PostgreSQL (`DATABASE_WEB_URL`)
- 출력 폴더: `backend/outputs/blog_drafts/` 신규 생성
- 로그 폴더: `logs/` 기존 폴더 재사용

---

# 17. KBO Predictor 시스템 참조

## 관련 테이블

| 테이블 | 용도 | TYPE_A | TYPE_B | TYPE_C |
|--------|------|--------|--------|--------|
| `games` | 경기 일정/결과 | O | - | O |
| `teams` | 팀 정보 + ELO | O | O | - |
| `predictions` | 예측 결과/정산 | O | - | O |
| `prediction_runs` | 예측 스냅샷 + key_factors | O | - | O |
| `team_season_standings` | 시즌 순위 | - | O | - |
| `elo_history` | ELO 변동 이력 | - | O | - |
| `players` | 선발 투수 이름 | O | - | - |
| `pitcher_stats` | 선발 투수 성적 | O (참고) | - | - |

## 관련 스케줄러 태스크

| 태스크 | 실행 시각 | 연관 콘텐츠 |
|--------|-----------|-------------|
| `task_midnight_batch` | 00:10 KST | TYPE_B, TYPE_C |
| `task_crawl_standings` | 07:30 KST | TYPE_B |
| `task_crawl_lineup` | 11:30 / 13:00 / 17:00 | TYPE_A |
| `task_update_predictions` | 15:00 KST | TYPE_A |
| `task_settle_results` | 23:50 KST | TYPE_C |

## 예측 모델 가중치 (콘텐츠 설명용)

```
ELO 전력 레이팅      40%
선발 투수 지표       28%
최근 10경기 흐름     14%
홈 이점 보정          8%
파크팩터(검증대기)    5%
날씨 보정             3%
불펜 소진도           2%
```

콘텐츠에서 모델 구조를 설명할 때 위 가중치를 참고한다. 단, "AI가 이 비율로 계산했다"가 아닌 "여러 요소를 종합 분석한다"는 표현을 권장한다.
