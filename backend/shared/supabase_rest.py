import json
import os
import re
from collections.abc import Mapping, Sequence
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

HTTP_TIMEOUT_SECONDS = 10
RESPONSE_EXCERPT_LENGTH = 300


class SupabaseError(RuntimeError):
    def __init__(
        self, message: str, status_code: int | None = None, response_excerpt: str = ""
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.response_excerpt = response_excerpt


def _base_url() -> str:
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    if not url:
        raise SupabaseError("SUPABASE_URL is not configured")
    return f"{url}/rest/v1"


def _headers(prefer: str | None = None) -> dict[str, str]:
    key = os.environ.get("SUPABASE_SERVICE_KEY", "")
    if not key:
        raise SupabaseError("SUPABASE_SERVICE_KEY is not configured")

    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer
    return headers


def _url(path: str) -> str:
    if not path or path.startswith("/") or "://" in path:
        raise ValueError("REST path must be a relative path without a leading slash")
    return f"{_base_url()}/{path}"


def _request(
    method: str,
    path: str,
    body: Any = None,
    prefer: str | None = None,
) -> tuple[Any, Mapping[str, str]]:
    data = None if body is None else json.dumps(body, separators=(",", ":")).encode()
    request = Request(
        _url(path),
        data=data,
        headers=_headers(prefer),
        method=method,
    )
    try:
        with urlopen(request, timeout=HTTP_TIMEOUT_SECONDS) as result:
            raw_body = result.read()
            parsed_body = json.loads(raw_body) if raw_body else None
            return parsed_body, result.headers
    except HTTPError as exc:
        excerpt = exc.read(RESPONSE_EXCERPT_LENGTH).decode("utf-8", errors="replace")
        raise SupabaseError(
            f"Supabase returned HTTP {exc.code}: {excerpt[:RESPONSE_EXCERPT_LENGTH]}",
            status_code=exc.code,
            response_excerpt=excerpt[:RESPONSE_EXCERPT_LENGTH],
        ) from exc
    except URLError as exc:
        raise SupabaseError(f"Supabase request failed: {exc.reason}") from exc
    except json.JSONDecodeError as exc:
        raise SupabaseError("Supabase returned an invalid JSON response") from exc


def select(path: str) -> Any:
    result, _ = _request("GET", path)
    return result


def insert(table: str, rows: Mapping[str, Any] | Sequence[Mapping[str, Any]]) -> Any:
    result, _ = _request(
        "POST", table, body=rows, prefer="return=minimal"
    )
    return result


def upsert(
    table: str,
    rows: Mapping[str, Any] | Sequence[Mapping[str, Any]],
    ignore_duplicates: bool = False,
) -> Any:
    resolution = "ignore-duplicates" if ignore_duplicates else "merge-duplicates"
    result, _ = _request(
        "POST",
        f"{table}?on_conflict=id",
        body=rows,
        prefer=f"resolution={resolution},return=minimal",
    )
    return result


def _filtered_path(table: str, filters: Mapping[str, str]) -> str:
    if not table or not re.fullmatch(r"[a-z_][a-z0-9_]*", table):
        raise ValueError("Invalid REST table name")
    if not filters:
        raise ValueError("At least one filter is required")
    query = urlencode(filters)
    return f"{table}?{query}"


def update(table: str, filters: Mapping[str, str], patch: Mapping[str, Any]) -> Any:
    if not patch:
        raise ValueError("Update patch cannot be empty")
    result, _ = _request(
        "PATCH",
        _filtered_path(table, filters),
        body=patch,
        prefer="return=minimal",
    )
    return result


def delete(table: str, filters: Mapping[str, str]) -> Any:
    result, _ = _request(
        "DELETE",
        _filtered_path(table, filters),
        prefer="return=minimal",
    )
    return result


def count(table: str, filters: Mapping[str, str]) -> int:
    path = _filtered_path(table, filters) + "&select=id"
    _, headers = _request("GET", path, prefer="count=exact")
    content_range = next(
        (value for key, value in headers.items() if key.lower() == "content-range"),
        "",
    )
    match = re.fullmatch(r"(?:\d+-\d+|\*)/(\d+|\*)", content_range.strip())
    if match is None or match.group(1) == "*":
        raise SupabaseError(f"Supabase returned an invalid Content-Range: {content_range!r}")
    return int(match.group(1))
