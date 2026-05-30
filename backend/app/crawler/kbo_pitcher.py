"""
KBO 공식 투수 기록 크롤러 (시즌 누적 성적)

※ 기존 PRD 는 Statiz(statiz.sporki.com)를 투수 성적 소스로 지정했으나,
  - statiz.sporki.com 도메인이 폐기(DNS 소멸)되고 statiz.co.kr 로 이전됨
  - statiz.co.kr 의 기록/팀 페이지가 전부 로그인 필수로 전환됨
  따라서 공개 접근이 가능하고 권위 있는 KBO 공식 기록실로 소스를 교체함.

데이터 소스 (2026 검증 완료):
  https://www.koreabaseball.com/Record/Player/PitcherBasic/Basic1.aspx
  ASP.NET WebForms — ddlTeam(팀) 필터로 POST(__doPostBack) 시
  해당 팀 투수 전원이 단일 페이지 tData01 테이블로 반환됨.

  테이블 컬럼: 순위 / 선수명 / 팀명 / ERA / G / W / L / SV / HLD /
              WPCT / IP / H / HR / BB / HBP / SO / R / ER / WHIP
  IP 표기: "70 2/3", "3 1/3", "12", "0"
"""

import logging
import re
from typing import Optional

from bs4 import BeautifulSoup

from app.crawler.base import BaseCrawler, make_client
from app.crawler.schemas import PitcherStatData

logger = logging.getLogger(__name__)

BASE_URL = "https://www.koreabaseball.com"
PITCHER_URL = f"{BASE_URL}/Record/Player/PitcherBasic/Basic1.aspx"

# ASP.NET 컨트롤 prefix
_P = "ctl00$ctl00$ctl00$cphContents$cphContents$cphContents$"
_F_SEASON = _P + "ddlSeason$ddlSeason"
_F_SERIES = _P + "ddlSeries$ddlSeries"
_F_TEAM = _P + "ddlTeam$ddlTeam"

# KBO ddlTeam 값 → 내부 code (seed_data 기준). HT=KIA, SK=SSG 만 상이.
PITCHER_TEAM_CODES: dict[str, str] = {
    "SS": "SS",   # 삼성
    "LG": "LG",
    "KT": "KT",
    "HT": "KIA",
    "HH": "HH",   # 한화
    "OB": "OB",   # 두산
    "SK": "SSG",
    "LT": "LT",   # 롯데
    "NC": "NC",
    "WO": "WO",   # 키움
}

# 헤더 텍스트 → PitcherStatData 필드
COLUMN_ALIASES: dict[str, str] = {
    "선수명": "name",
    "ERA": "era",
    "G": "games",
    "W": "wins",
    "L": "losses",
    "SV": "saves",
    "HLD": "holds",
    "IP": "ip",
    "H": "hits",
    "HR": "hr",
    "BB": "walks",
    "HBP": "hbp",
    "SO": "strikeouts",
    "R": "runs",
    "ER": "earned_runs",
    "WHIP": "whip",
}


def _to_float(text: str) -> Optional[float]:
    text = (text or "").strip().replace(",", "")
    try:
        return float(text)
    except ValueError:
        return None


def _to_int(text: str) -> Optional[int]:
    text = (text or "").strip().replace(",", "")
    try:
        return int(text)
    except ValueError:
        return None


def _parse_innings(raw: str) -> Optional[float]:
    """KBO 표기 IP → 소수 이닝. '70 2/3'→70.667, '3 1/3'→3.333, '12'→12, '0'→0."""
    raw = (raw or "").strip()
    if not raw or raw == "-":
        return None
    m = re.fullmatch(r"(?:(\d+))?\s*(?:([12])/3)?", raw)
    if not m or (m.group(1) is None and m.group(2) is None):
        return _to_float(raw)
    whole = int(m.group(1)) if m.group(1) else 0
    frac = int(m.group(2)) / 3 if m.group(2) else 0.0
    return round(whole + frac, 3)


def _hidden_fields(soup: BeautifulSoup) -> dict[str, str]:
    fields: dict[str, str] = {}
    for inp in soup.find_all("input", {"type": "hidden"}):
        name = inp.get("name")
        if name:
            fields[name] = inp.get("value", "")
    return fields


class KBOPitcherCrawler(BaseCrawler):
    """KBO 공식 투수 기록 — 팀별 시즌 누적 성적."""

    async def _get_form_state(self) -> dict[str, str]:
        soup = await self.fetch_html(PITCHER_URL)
        return _hidden_fields(soup)

    async def fetch_team_pitchers(self, kbo_team: str, year: int) -> list[PitcherStatData]:
        """KBO ddlTeam 값(kbo_team)으로 해당 팀 투수 시즌 성적 반환."""
        internal_code = PITCHER_TEAM_CODES.get(kbo_team, kbo_team)

        form = await self._get_form_state()  # ViewState 회전 대비 팀마다 새로 취득
        form[_F_SEASON] = str(year)
        form[_F_SERIES] = "0"  # 정규시즌
        form[_F_TEAM] = kbo_team
        form["__EVENTTARGET"] = _F_TEAM
        form["__EVENTARGUMENT"] = ""

        soup = await self.fetch_html(
            PITCHER_URL, data=form, headers={"Referer": PITCHER_URL}
        )
        return self._parse_table(soup, internal_code, year)

    def _parse_table(
        self, soup: BeautifulSoup, team_code: str, year: int
    ) -> list[PitcherStatData]:
        table = soup.find("table", class_="tData01")
        if table is None:
            logger.warning("Pitcher table not found for %s %d", team_code, year)
            return []

        headers = [th.get_text(strip=True) for th in table.find_all("th")]
        col_map: dict[str, int] = {}
        for i, h in enumerate(headers):
            key = COLUMN_ALIASES.get(h)
            if key and key not in col_map:
                col_map[key] = i

        if "name" not in col_map or "era" not in col_map:
            logger.warning("Unexpected pitcher table header for %s: %s", team_code, headers)
            return []

        tbody = table.find("tbody")
        if tbody is None:
            return []

        results: list[PitcherStatData] = []
        for tr in tbody.find_all("tr"):
            cells = [td.get_text(strip=True) for td in tr.find_all("td")]
            if not cells:
                continue

            def col(key: str) -> str:
                idx = col_map.get(key)
                return cells[idx] if idx is not None and idx < len(cells) else ""

            name = col("name")
            if not name or name in ("합계", "평균", "-"):
                continue

            results.append(
                PitcherStatData(
                    player_name=name,
                    team_code=team_code,
                    season=year,
                    era=_to_float(col("era")),
                    whip=_to_float(col("whip")),
                    innings_pitched=_parse_innings(col("ip")),
                    hits=_to_int(col("hits")),
                    runs=_to_int(col("runs")),
                    earned_runs=_to_int(col("earned_runs")),
                    walks=_to_int(col("walks")),
                    strikeouts=_to_int(col("strikeouts")),
                    games=_to_int(col("games")),
                    wins=_to_int(col("wins")),
                    losses=_to_int(col("losses")),
                    saves=_to_int(col("saves")),
                    holds=_to_int(col("holds")),
                    home_runs_allowed=_to_int(col("hr")),
                    hbp=_to_int(col("hbp")),
                )
            )
        return results


async def run_pitcher_stats_all_teams(year: int) -> list[PitcherStatData]:
    """전 팀 투수 시즌 성적 수집 (KBO 공식)."""
    async with make_client() as client:
        crawler = KBOPitcherCrawler(client)
        all_stats: list[PitcherStatData] = []
        for kbo_team, internal in PITCHER_TEAM_CODES.items():
            try:
                stats = await crawler.fetch_team_pitchers(kbo_team, year)
                all_stats.extend(stats)
                logger.info("KBO pitcher stats: %s(%s) %d → %d rows", internal, kbo_team, year, len(stats))
            except Exception as e:
                logger.error("Failed to fetch pitcher stats for %s: %s", kbo_team, e)
        return all_stats
