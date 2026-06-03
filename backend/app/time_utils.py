from datetime import date, datetime
from zoneinfo import ZoneInfo


KST = ZoneInfo("Asia/Seoul")


def today_kst() -> date:
    return datetime.now(KST).date()


def now_kst() -> datetime:
    """KST 기준 현재 시각 (naive — DB DateTime 컬럼 저장 관례에 맞춤).

    DB는 모든 DateTime을 KST naive로 저장하므로 tzinfo를 제거해 반환한다.
    aware 시각이 필요한 화면 로직은 별도로 KST tz를 부여한다.
    """
    return datetime.now(KST).replace(tzinfo=None)
