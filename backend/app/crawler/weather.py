"""
Open-Meteo 날씨 크롤러 (무료 API, 인증 불필요)

API 문서: https://open-meteo.com/en/docs
"""

import logging
from datetime import date
from typing import Optional

from app.crawler.base import BaseCrawler, make_client
from app.crawler.schemas import WeatherData

logger = logging.getLogger(__name__)

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"

# WMO 날씨 코드 → 한국어 설명
WMO_CODE_MAP: dict[int, str] = {
    0: "맑음",
    1: "대체로 맑음",
    2: "부분적 구름",
    3: "흐림",
    45: "안개",
    48: "결빙 안개",
    51: "가벼운 이슬비",
    53: "보통 이슬비",
    55: "강한 이슬비",
    61: "가벼운 비",
    63: "보통 비",
    65: "강한 비",
    71: "가벼운 눈",
    73: "보통 눈",
    75: "강한 눈",
    80: "소나기",
    81: "강한 소나기",
    95: "뇌우",
    99: "강한 뇌우",
}

# KBO 구장 GPS 좌표 (위도, 경도)
STADIUM_COORDS: dict[str, tuple[float, float]] = {
    "잠실야구장": (37.5122, 127.0719),
    "고척스카이돔": (37.5017, 126.8673),
    "수원KT위즈파크": (37.2997, 127.0097),
    "인천SSG랜더스필드": (37.4371, 126.6934),
    "대전한화생명볼파크": (36.3171, 127.4286),
    "창원NC파크": (35.2225, 128.5822),
    "부산사직야구장": (35.1937, 129.0613),
    "광주기아챔피언스필드": (35.1677, 126.8888),
    "대구삼성라이온즈파크": (35.8416, 128.6808),
}


class WeatherCrawler(BaseCrawler):
    async def fetch_forecast(self, stadium: str, game_date: date) -> Optional[WeatherData]:
        """
        경기 당일 18:00 기준 기상 예보 반환.
        7일 이내는 예보 API, 그 이전 날짜는 과거 데이터 API 사용.
        """
        coords = STADIUM_COORDS.get(stadium)
        if coords is None:
            logger.warning("Unknown stadium: %s", stadium)
            return None

        lat, lon = coords
        today = date.today()
        days_diff = (game_date - today).days

        if days_diff < -180:
            logger.warning("Date too far in the past for weather: %s", game_date)
            return None

        # 과거 데이터 vs 예보
        if days_diff < 0:
            url = ARCHIVE_URL
        else:
            url = FORECAST_URL

        try:
            data = await self.fetch_json(
                url,
                params={
                    "latitude": lat,
                    "longitude": lon,
                    "hourly": "temperature_2m,weathercode",
                    "timezone": "Asia/Seoul",
                    "start_date": game_date.isoformat(),
                    "end_date": game_date.isoformat(),
                },
            )
        except Exception as e:
            logger.error("Weather API error for %s %s: %s", stadium, game_date, e)
            return None

        return self._parse_response(data, stadium, game_date)

    def _parse_response(self, data: dict, stadium: str, game_date: date) -> Optional[WeatherData]:
        """18:00 시각 기준 기온/날씨 추출."""
        try:
            hourly = data["hourly"]
            times: list[str] = hourly["time"]
            temps: list[float] = hourly["temperature_2m"]
            codes: list[int] = hourly["weathercode"]

            # 18:00 인덱스 찾기
            target = f"{game_date.isoformat()}T18:00"
            idx = next((i for i, t in enumerate(times) if t == target), None)

            if idx is None:
                # 18시 없으면 14~20시 평균
                afternoon = [
                    (t, c)
                    for t, c in zip(times, codes)
                    if f"{game_date.isoformat()}T1" in t or f"{game_date.isoformat()}T2" in t
                ]
                if not afternoon:
                    return None
                temp = sum(temps[times.index(t)] for t, _ in afternoon) / len(afternoon)
                code = afternoon[len(afternoon) // 2][1]
            else:
                temp = temps[idx]
                code = codes[idx]

            return WeatherData(
                game_date=game_date,
                stadium=stadium,
                temperature=round(temp, 1),
                condition=WMO_CODE_MAP.get(code, f"코드:{code}"),
            )
        except (KeyError, IndexError, StopIteration) as e:
            logger.warning("Weather parse error: %s", e)
            return None


async def fetch_weather_for_games(
    games: list[tuple[str, date]]  # [(stadium, game_date), ...]
) -> dict[tuple[str, date], WeatherData]:
    """여러 경기 날씨 일괄 수집. 결과: {(stadium, date): WeatherData}"""
    async with make_client() as client:
        crawler = WeatherCrawler(client)
        results: dict[tuple[str, date], WeatherData] = {}
        for stadium, game_date in games:
            key = (stadium, game_date)
            if key in results:
                continue
            wd = await crawler.fetch_forecast(stadium, game_date)
            if wd:
                results[key] = wd
    return results
