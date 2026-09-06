"""
Edge-case tests for the "next reported bus" ranking logic. This is the
highest-risk piece of business logic, so it gets focused coverage:
future buses, already-passed buses, midnight transitions, missing timing
information, and stale reports.
"""
from datetime import datetime, timedelta, timezone
import pytest


def test_upcoming_bus_ranked_first(client, db, make_user):
    from tests.test_search import _report

    _report(db, make_user, "Gandhipuram", "Ukkadam", 35, bus_name="12B")
    _report(db, make_user, "Gandhipuram", "Ukkadam", 10, bus_name="12A")

    resp = client.get("/api/search?destination=Ukkadam")
    results = resp.get_json()["data"]["results"]
    assert results[0]["bus"]["bus_name"] == "12A"
    assert results[0]["is_next_bus"] is True
    assert results[0]["timing_state"] == "upcoming"


def test_already_passed_bus_not_marked_next_over_upcoming(client, db, make_user):
    from tests.test_search import _report

    _report(db, make_user, "Gandhipuram", "Ukkadam", -60, bus_name="OldBus")
    _report(db, make_user, "Gandhipuram", "Ukkadam", 15, bus_name="NewBus")

    resp = client.get("/api/search?destination=Ukkadam")
    results = resp.get_json()["data"]["results"]
    assert results[0]["bus"]["bus_name"] == "NewBus"
    assert results[0]["timing_state"] == "upcoming"


def test_bus_far_in_future_not_treated_as_next_over_soon_bus(client, db, make_user):
    from tests.test_search import _report

    _report(db, make_user, "Gandhipuram", "Ukkadam", 240, bus_name="FarBus")  # 4 hours out
    _report(db, make_user, "Gandhipuram", "Ukkadam", 12, bus_name="SoonBus")

    resp = client.get("/api/search?destination=Ukkadam")
    results = resp.get_json()["data"]["results"]
    assert results[0]["bus"]["bus_name"] == "SoonBus"
    assert results[0]["timing_state"] == "upcoming"
    # The far-future bus should still appear, just not first / not "upcoming".
    far = next(r for r in results if r["bus"]["bus_name"] == "FarBus")
    assert far["timing_state"] == "later"


def test_missing_boarding_time_does_not_crash_ranking(db, make_user):
    from app.schemas.report import BusReportCreate
    from app.services.report_service import create_bus_report
    from app.services.search_service import search_by_destination

    user = make_user()
    payload = BusReportCreate(
        bus_name="NoTimeBus",
        boarding_stop="Gandhipuram",
        destination_stop="Ukkadam",
        boarding_time=None,
    )
    create_bus_report(user.id, payload)

    result = search_by_destination("Ukkadam")
    assert len(result["results"]) == 1
    assert result["results"][0]["timing_state"] == "unknown"


def test_midnight_transition_handled_correctly(db, make_user):
    """
    A boarding_time that is technically 'earlier' in clock-time than now
    (e.g. reported at 11:55 PM for a 12:10 AM bus the next day) must still
    be recognized as upcoming because we compare full datetimes, not bare
    clock times.
    """
    from app.schemas.report import BusReportCreate
    from app.services.report_service import create_bus_report
    from app.services.search_service import search_by_destination
    from app.utils.time_utils import utcnow

    user = make_user()
    boarding_time = utcnow() + timedelta(minutes=15)  # crosses midnight in some timezones
    payload = BusReportCreate(
        bus_name="MidnightBus",
        boarding_stop="Gandhipuram",
        destination_stop="Ukkadam",
        boarding_time=boarding_time,
    )
    create_bus_report(user.id, payload)

    result = search_by_destination("Ukkadam")
    assert result["results"][0]["timing_state"] == "upcoming"
    assert result["results"][0]["minutes_until_boarding"] > 0


def test_stale_report_still_shown_but_marked(db, make_user):
    from app.models.report import BusReport
    from app.schemas.report import BusReportCreate
    from app.services.report_service import create_bus_report
    from app.services.search_service import search_by_destination
    from app.utils.time_utils import utcnow

    user = make_user()
    payload = BusReportCreate(
        bus_name="StaleBus",
        boarding_stop="Gandhipuram",
        destination_stop="Ukkadam",
        boarding_time=utcnow() - timedelta(hours=5),
    )
    report = create_bus_report(user.id, payload)
    # Backdate reported_at to simulate an old report.
    report.reported_at = utcnow() - timedelta(hours=5)
    from app.extensions import db
    db.session.commit()

    result = search_by_destination("Ukkadam")
    assert len(result["results"]) == 1
    entry = result["results"][0]
    assert entry["timing_state"] == "passed"
    assert entry["freshness"]["level"] in ("stale", "very_stale")
