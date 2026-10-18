import base64
import binascii
import json
import re
from collections.abc import Mapping
from typing import Any

UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
)


def is_uuid(value: object) -> bool:
    return isinstance(value, str) and UUID_RE.fullmatch(value) is not None


def response(status: int, body: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "statusCode": status,
        "headers": {"content-type": "application/json"},
        "body": json.dumps(body, separators=(",", ":"), ensure_ascii=False),
    }


def error(status: int, code: str, message: str) -> dict[str, Any]:
    return response(status, {"error": code, "message": message})


def parse_json(event: Mapping[str, Any]) -> Any:
    body = event.get("body")
    if not isinstance(body, str):
        raise ValueError("Request body must be a JSON string")

    if event.get("isBase64Encoded") is True:
        try:
            body = base64.b64decode(body, validate=True).decode("utf-8")
        except (binascii.Error, UnicodeDecodeError) as exc:
            raise ValueError("Request body is not valid base64-encoded UTF-8") from exc

    try:
        return json.loads(body)
    except json.JSONDecodeError as exc:
        raise ValueError("Request body is not valid JSON") from exc
