# API 운영 체크리스트

작성일: 2026-06-06

## 목적

웹(Render)과 로컬에서 화면 차이가 생기지 않도록 프론트엔드의 API 호출 경로와 환경 변수를 정리한다.

## 환경 변수

### NEXT_PUBLIC_API_URL

브라우저에 노출되는 공개 API 주소다.

현재 권장값:

```env
NEXT_PUBLIC_API_URL=https://lee-kbo.onrender.com/v1
```

로컬 단독 실행 시:

```env
NEXT_PUBLIC_API_URL=http://localhost:8002/v1
```

주의:

- 이름에 `NEXT_PUBLIC_`이 붙어 있어 브라우저 번들에 포함된다.
- 민감한 내부 주소나 토큰을 넣으면 안 된다.

### INTERNAL_API_URL

프론트엔드 서버 전용 API 주소다. Next.js Route Handler, Server Component, SSR fetch에서만 사용한다.

로컬 Docker 권장값:

```env
INTERNAL_API_URL=http://api:8002/v1
```

Render 즉시 적용 가능한 안정값:

```env
INTERNAL_API_URL=https://lee-kbo.onrender.com/v1
```

Render 내부망 최적화값:

```env
INTERNAL_API_URL=http://<Render Connect Internal 주소>/v1
```

예시:

```env
INTERNAL_API_URL=http://backend-internal-host:port/v1
```

주의:

- 실제 내부 host와 port는 Render Dashboard의 backend 서비스 `Connect > Internal`에서 확인한 값을 그대로 사용해야 한다.
- Render 공식 문서 기준으로 내부 주소는 같은 workspace/region 서비스 간 통신에 사용한다.
- 내부 주소가 확인되지 않았거나 연결이 실패하면 public URL인 `https://lee-kbo.onrender.com/v1`로 두는 것이 안전하다.

## 현재 적용된 안정화

### 일정 페이지

브라우저가 백엔드를 직접 호출하지 않고 프론트엔드 API Route를 경유한다.

```text
Browser
-> /api/games?date=YYYY-MM-DD
-> frontend/app/api/games/route.ts
-> INTERNAL_API_URL 또는 NEXT_PUBLIC_API_URL
-> /v1/games?date=YYYY-MM-DD&summary=true
```

효과:

- Render에서 무거운 전체 경기 상세 조회를 피한다.
- 일정 페이지는 lightweight summary 응답만 사용한다.
- public API CORS/타임아웃 영향을 줄인다.

## 다음 전환 후보

아래 화면은 아직 public API를 직접 호출하는 코드가 남아 있다. 문제가 보이면 일정 페이지와 같은 방식으로 frontend API Route를 먼저 만들고 점진적으로 전환한다.

- `frontend/components/GameDetailClient.tsx`
- `frontend/app/players/page.tsx`
- `frontend/app/player/[id]/page.tsx`
- `frontend/app/teams/[id]/page.tsx`
- `frontend/app/history/page.tsx`
- `frontend/app/admin/page.tsx`
- `frontend/components/VisitorTracker.tsx`

## 검증 URL

배포 후 최소 확인 항목:

- `https://lee-kbo-web.onrender.com/schedule`
- `https://lee-kbo-web.onrender.com/api/games?date=2026-06-04`
- `https://lee-kbo-web.onrender.com/games/291`
- `https://lee-kbo-web.onrender.com/games/296`

로컬 확인 항목:

- `http://localhost:3000/schedule`
- `http://localhost:3000/api/games?date=2026-06-04`
- `http://localhost:3000/games/291`

## 운영 원칙

- 화면 속도 문제는 먼저 API 응답 크기와 호출 경로를 줄인다.
- 화면 자체를 바꾸는 UI 단순화는 마지막에 한다.
- public URL이 확실히 동작하는 상태에서 internal URL로 최적화한다.
- internal URL 적용 후에는 Render 로그에서 `/api/games`와 backend `/v1/games?summary=true` 응답 시간을 함께 확인한다.
