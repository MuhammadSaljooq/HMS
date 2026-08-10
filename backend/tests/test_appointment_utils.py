from datetime import datetime
from zoneinfo import ZoneInfo

from app.services.appointment_service import intervals_overlap

TZ = ZoneInfo("Asia/Karachi")


def test_intervals_overlap_when_ranges_intersect() -> None:
    a0 = datetime(2026, 5, 4, 9, 0, tzinfo=TZ)
    a1 = datetime(2026, 5, 4, 9, 30, tzinfo=TZ)
    b0 = datetime(2026, 5, 4, 9, 15, tzinfo=TZ)
    b1 = datetime(2026, 5, 4, 9, 45, tzinfo=TZ)
    assert intervals_overlap(a0, a1, b0, b1) is True


def test_intervals_do_not_overlap_when_touching_edges() -> None:
    a0 = datetime(2026, 5, 4, 9, 0, tzinfo=TZ)
    a1 = datetime(2026, 5, 4, 9, 30, tzinfo=TZ)
    b0 = datetime(2026, 5, 4, 9, 30, tzinfo=TZ)
    b1 = datetime(2026, 5, 4, 10, 0, tzinfo=TZ)
    assert intervals_overlap(a0, a1, b0, b1) is False
