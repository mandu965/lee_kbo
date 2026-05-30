"""
KBO 공식 타자 기록 크롤러 (시즌 누적 성적)

소스 (2026 검증):
  Basic1: https://www.koreabaseball.com/Record/Player/HitterBasic/Basic1.aspx
    → AVG / G / PA / AB / R / H / 2B / 3B / HR / TB / RBI / SAC / SF
  Basic2: ...Basic2.aspx
    → BB / IBB / HBP / SO / SLG / OBP / OPS

ASP.NET 포스트백으로 ddlTeam 필터 → 해당 팀 전체 타자.
"""

import logging
from dataclasses import dataclass
from typing import Optional

from bs4 import BeautifulSoup

from app.crawler.base import BaseCrawler, make_client

logger = logging.getLogger(__name__)

BASE_URL = "https://www.koreabaseball.com/Record/Player/HitterBasic"
BASIC1_URL = f"{BASE_URL}/Basic1.aspx"
BASIC2_URL = f"{BASE_URL}/Basic2.aspx"

_P = "ctl00$ctl00$ctl00$cphContents$cphContents$cphContents$"
_F_SEASON = _P + "ddlSeason$ddlSeason"
_F_SERIES = _P + "ddlSeries$ddlSeries"
_F_TEAM = _P + "ddlTeam$ddlTeam"

# KBO ddlTeam 코드 → 내부 code
BATTER_TEAM_CODES: dict[str, str] = {
    "SS": "SS", "LG": "LG", "KT": "KT", "HT": "KIA", "HH": "HH",
    "OB": "OB", "SK": "SSG", "LT": "LT", "NC": "NC", "WO": "WO",
}

BASIC1_COLS = {
    "선수명": "name", "AVG": "avg", "G": "games", "PA": "pa",
    "AB": "ab", "R": "runs", "H": "hits",
    "2B": "doubles", "3B": "triples", "HR": "hr",
    "TB": "tb", "RBI": "rbi", "SAC": "sac", "SF": "sf",
}
BASIC2_COLS = {
    "선수명": "name", "BB": "bb", "IBB": "ibb", "HBP": "hbp",
    "SO": "so", "SLG": "slg", "OBP": "obp", "OPS": "ops",
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


def _hidden_fields(soup: BeautifulSoup) -> dict[str, str]:
    return {
        inp["name"]: inp.get("value", "")
        for inp in soup.find_all("input", {"type": "hidden"})
        if inp.get("name")
    }


def _parse_table(soup: BeautifulSoup, col_aliases: dict[str, str]) -> dict[str, dict]:
    """name → {field: value} 매핑 반환."""
    table = soup.find("table", class_="tData01")
    if not table:
        return {}
    headers = [th.get_text(strip=True) for th in table.find_all("th")]
    col_map: dict[str, int] = {}
    for i, h in enumerate(headers):
        k = col_aliases.get(h)
        if k and k not in col_map:
            col_map[k] = i

    if "name" not in col_map:
        return {}

    result: dict[str, dict] = {}
    tbody = table.find("tbody")
    if not tbody:
        return result
    for tr in tbody.find_all("tr"):
        cells = [td.get_text(strip=True) for td in tr.find_all("td")]
        if not cells:
            continue

        def col(key: str) -> str:
            idx = col_map.get(key)
            return cells[idx] if idx is not None and idx < len(cells) else ""

        name = col("name")
        if not name or name in ("-", "합계", "평균"):
            continue
        result[name] = {k: col(k) for k in col_map if k != "name"}
    return result


@dataclass
class BatterStatData:
    player_name: str
    team_code: str
    season: int
    avg: Optional[float] = None
    games: Optional[int] = None
    plate_app: Optional[int] = None
    at_bats: Optional[int] = None
    runs: Optional[int] = None
    hits: Optional[int] = None
    doubles: Optional[int] = None
    triples: Optional[int] = None
    home_runs: Optional[int] = None
    total_bases: Optional[int] = None
    rbi: Optional[int] = None
    sac_hits: Optional[int] = None
    sac_flies: Optional[int] = None
    walks: Optional[int] = None
    ibb: Optional[int] = None
    hbp: Optional[int] = None
    strikeouts: Optional[int] = None
    slg: Optional[float] = None
    obp: Optional[float] = None
    ops: Optional[float] = None


class KBOBatterCrawler(BaseCrawler):
    async def fetch_team_batters(self, kbo_team: str, year: int) -> list[BatterStatData]:
        internal_code = BATTER_TEAM_CODES.get(kbo_team, kbo_team)

        async def post_page(url: str, col_aliases: dict) -> dict:
            form_soup = await self.fetch_html(url)
            form = _hidden_fields(form_soup)
            form[_F_SEASON] = str(year)
            form[_F_SERIES] = "0"
            form[_F_TEAM] = kbo_team
            form["__EVENTTARGET"] = _F_TEAM
            form["__EVENTARGUMENT"] = ""
            soup = await self.fetch_html(url, data=form, headers={"Referer": url})
            return _parse_table(soup, col_aliases)

        basic1 = await post_page(BASIC1_URL, BASIC1_COLS)
        basic2 = await post_page(BASIC2_URL, BASIC2_COLS)

        results: list[BatterStatData] = []
        for name, d1 in basic1.items():
            d2 = basic2.get(name, {})
            results.append(BatterStatData(
                player_name=name,
                team_code=internal_code,
                season=year,
                avg=_to_float(d1.get("avg", "")),
                games=_to_int(d1.get("games", "")),
                plate_app=_to_int(d1.get("pa", "")),
                at_bats=_to_int(d1.get("ab", "")),
                runs=_to_int(d1.get("runs", "")),
                hits=_to_int(d1.get("hits", "")),
                doubles=_to_int(d1.get("doubles", "")),
                triples=_to_int(d1.get("triples", "")),
                home_runs=_to_int(d1.get("hr", "")),
                total_bases=_to_int(d1.get("tb", "")),
                rbi=_to_int(d1.get("rbi", "")),
                sac_hits=_to_int(d1.get("sac", "")),
                sac_flies=_to_int(d1.get("sf", "")),
                walks=_to_int(d2.get("bb", "")),
                ibb=_to_int(d2.get("ibb", "")),
                hbp=_to_int(d2.get("hbp", "")),
                strikeouts=_to_int(d2.get("so", "")),
                slg=_to_float(d2.get("slg", "")),
                obp=_to_float(d2.get("obp", "")),
                ops=_to_float(d2.get("ops", "")),
            ))
        return results


async def run_batter_stats_all_teams(year: int) -> list[BatterStatData]:
    async with make_client() as client:
        crawler = KBOBatterCrawler(client)
        all_stats: list[BatterStatData] = []
        for kbo_team, internal in BATTER_TEAM_CODES.items():
            try:
                stats = await crawler.fetch_team_batters(kbo_team, year)
                all_stats.extend(stats)
                logger.info("KBO batter stats: %s(%s) %d → %d rows", internal, kbo_team, year, len(stats))
            except Exception as e:
                logger.error("Failed to fetch batter stats for %s: %s", kbo_team, e)
        return all_stats
