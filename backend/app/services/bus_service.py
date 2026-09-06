"""
Bus and Stop lookup/creation logic, including "find or create" semantics
used heavily by report submission (users type free-text names, we resolve
them to normalized DB rows without creating needless duplicates).
"""
from app.extensions import db
from app.models.bus import Bus, BusType
from app.models.stop import Stop, normalize_stop_name


def find_or_create_stop(stop_name: str) -> Stop:
    normalized = normalize_stop_name(stop_name)
    stop = Stop.query.filter_by(normalized_name=normalized).first()
    if stop:
        return stop
    stop = Stop(stop_name=stop_name.strip(), normalized_name=normalized)
    db.session.add(stop)
    db.session.flush()  # get stop.id without committing yet
    return stop


def find_or_create_bus(bus_name: str, bus_number: str = None, operator: str = None,
                        bus_type: BusType = BusType.UNKNOWN) -> Bus:
    query = Bus.query.filter(Bus.bus_name.ilike(bus_name.strip()))
    if bus_number:
        query = query.filter(Bus.bus_number == bus_number.strip())
    else:
        query = query.filter(Bus.bus_number.is_(None))
    if operator:
        query = query.filter(Bus.operator == operator.strip())
    else:
        query = query.filter(Bus.operator.is_(None))

    bus = query.first()
    if bus:
        return bus

    bus = Bus(
        bus_name=bus_name.strip(),
        bus_number=bus_number.strip() if bus_number else None,
        operator=operator.strip() if operator else None,
        bus_type=bus_type or BusType.UNKNOWN,
    )
    db.session.add(bus)
    db.session.flush()
    return bus


def search_stops(query: str, limit: int = 10):
    """Autocomplete-style stop search. Indexed on normalized_name for scale."""
    if not query or not query.strip():
        return []
    normalized_query = normalize_stop_name(query)
    if not normalized_query:
        return []
    like_pattern = f"%{normalized_query}%"
    return (
        Stop.query.filter(Stop.normalized_name.ilike(like_pattern))
        .order_by(Stop.stop_name.asc())
        .limit(limit)
        .all()
    )
