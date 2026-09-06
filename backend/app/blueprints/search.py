from flask import Blueprint, request
from pydantic import ValidationError
from app.schemas.search import SearchQuery
from app.services import search_service
from app.utils.responses import ok, fail

bp = Blueprint("search", __name__, url_prefix="/api/search")


@bp.route("", methods=["GET"])
def search():
    try:
        query = SearchQuery(
            destination=request.args.get("destination") or request.args.get("to"),
            origin=request.args.get("from") or request.args.get("origin"),
        )
    except ValidationError as e:
        return fail(e.errors()[0].get("msg", "Invalid search request."), 422)

    if query.origin and query.destination:
        result = search_service.search_from_to(query.origin, query.destination)
    elif query.origin:
        result = search_service.search_by_origin(query.origin)
    elif query.destination:
        result = search_service.search_by_destination(query.destination)
    else:
        result = search_service.search_all()

    if not result["results"] and not result.get("other_buses"):
        return ok(data=result, message="No recent bus information found.")
    return ok(data=result)

