FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Render는 PORT 환경변수를 자동 주입 (기본 10000)
# 로컬 docker-compose는 8002 사용
ENV PORT=8002

EXPOSE ${PORT}

# DB 마이그레이션은 배포 전에 별도 실행한다.
# 서버 시작 시 stamp를 실행하면 DB가 이미지보다 앞선 순간 롤백·재시작이 모두 실패한다.
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
