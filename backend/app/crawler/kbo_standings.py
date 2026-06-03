"""
KBO 공식 팀 순위 크롤러

소스 (2026 검증):
  https://www.koreabaseball.com/Record/TeamRank/TeamRankDaily.aspx
  table.tData:
    순위 | 팀명 | 경기 | 승 | 패 | 무 | 승률 | 게임차 | 최근10경기 | 연속 | 홈 | 방문
"""

import logging
import re
from datetime import date
from dataclasses import dataclass
from typing import Optional

from app.crawler.base import BaseCrawler, make_client
from app.time_utils import today_kst

logger = logging.getLogger(__name__)

STANDINGS_URL = "https://www.koreabaseball.com/Record/TeamRank/TeamRankDaily.aspx"

# KBO 표시 팀명 → 내부 code
STANDINGS_TEAM_MAP: dict[str, str] = {
    "LG": "LG", "KT": "KT", "SSG": "SSG", "NC": "NC", "KIA": "KIA",
    "두산": "OB", "롯데": "LT", "삼성": "SS", "한화": "HH", "키움": "WO",
}


def _to_float(text: str) -> Optional[float]:
    try:
        return float((text or "").strip().replace(",", ""))
    except ValueError:
        return None


def _to_int(text: str) -> Optional[int]:
    try:
        return int((text or "").strip().replace(",", ""))
    except ValueError:
        return None


def _parse_games_behind(raw: str) -> Optional[float]:
    raw = (raw or "").strip()
    if raw in ("-", "", "0", "0.0"):
        return 0.0
    return _to_float(raw)


@dataclass
class StandingsRow:
    team_code: str
    rank: int
    games_played: int
    wins: int
    losses: int
    draws: int
    win_pct: float
    games_behind: float
    last10: str        # "7승0무3패"
    streak: str        # "1패"
    home_record: str   # "14-1-10"
    away_record: str   # "16-0-9"
    as_of: date


class KBOStandingsCrawler(BaseCrawler):
    """KBO 공식 팀 순위 수집."""

    async def fetch(self) -> list[StandingsRow]:
        soup = await self.fetch_html(STANDINGS_URL)
        today = today_kst()
        # 첫 번째 tData 테이블
        table = soup.find("table", class_="tData")
        if table is None:
            logger.warning("Standings table not found")
            return []

        tbody = table.find("tbody")
        if not tbody:
            return []

        results: list[StandingsRow] = []
        for tr in tbody.find_all("tr"):
            cells = [td.get_text(strip=True) for td in tr.find_all("td")]
            if len(cells) < 12:
                continue
            # 순위 | 팀명 | 경기 | 승 | 패 | 무 | 승률 | 게임차 | 최근10 | 연속 | 홈 | 방문
            rank = _to_int(cells[0])
            team_name = cells[1]
            team_code = STANDINGS_TEAM_MAP.get(team_name, team_name)
            gp = _to_int(cells[2])
            w = _to_int(cells[3])
            l = _to_int(cells[4])
            d = _to_int(cells[5])
            wpct = _to_float(cells[6])
            gb = _parse_games_behind(cells[7])
            last10 = cells[8]
            streak = cells[9]
            home = cells[10]
            away = cells[11]

            if rank is None or gp is None:
                continue

            results.append(StandingsRow(
                team_code=team_code,
                rank=rank,
                games_played=gp,
                wins=w or 0,
                losses=l or 0,
                draws=d or 0,
                win_pct=wpct or 0.0,
                games_behind=gb or 0.0,
                last10=last10,
                streak=streak,
                home_record=home,
                away_record=away,
                as_of=today,
            ))
        return results


async def run_standings_crawl() -> list[StandingsRow]:
    async with make_client() as client:
        return await KBOStandingsCrawler(client).fetch()
