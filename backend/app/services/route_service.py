"""
Route + route-stop creation logic, including support for optional inline
route definitions submitted alongside a bus report.
"""
from app.extensions import db
from app.models.route import Route, RouteStop
from app.services.bus_service import find_or_create_stop


def create_route_with_stops(bus_id: int, route_name: str, stop_names: list[str]) -> Route:
    """
    Create a Route for `bus_id` with an ordered list of stop names.
    Each name is resolved via find_or_create_stop so re-used stop names
    (e.g. "Gandhipuram" appearing in many routes) map to one Stop row.
    """
    route = Route(bus_id=bus_id, route_name=route_name)
    db.session.add(route)
    db.session.flush()

    for order, name in enumerate(stop_names):
        stop = find_or_create_stop(name)
        db.session.add(RouteStop(route_id=route.id, stop_id=stop.id, stop_order=order))

    db.session.flush()
    return route


def find_route_containing_stop(bus_id: int, stop_id: int):
    return (
        Route.query.join(RouteStop)
        .filter(Route.bus_id == bus_id, RouteStop.stop_id == stop_id)
        .first()
    )


def route_supports_direction(route: Route, origin_stop_id: int, destination_stop_id: int) -> bool:
    """
    True only if `origin_stop_id` appears before `destination_stop_id` in the
    route's stop ordering — i.e. the route actually travels in that direction.
    """
    ordered_ids = route.ordered_stop_ids()
    try:
        origin_index = ordered_ids.index(origin_stop_id)
        destination_index = ordered_ids.index(destination_stop_id)
    except ValueError:
        return False
    return origin_index < destination_index
