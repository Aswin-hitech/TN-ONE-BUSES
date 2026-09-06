"""
Consistent API response envelopes so the frontend can rely on a predictable
shape, and so internal errors are never leaked to the client.
"""
from flask import jsonify


def ok(data=None, message=None, status=200):
    payload = {"success": True}
    if message is not None:
        payload["message"] = message
    if data is not None:
        payload["data"] = data
    return jsonify(payload), status


def fail(message: str, status: int = 400, code: str = None):
    payload = {"success": False, "error": message}
    if code:
        payload["code"] = code
    return jsonify(payload), status
