import json
import os
from collections.abc import Mapping
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from .responses import is_uuid

AUTH_TIMEOUT_SECONDS = 8


class UnauthorizedError(RuntimeError):
    pass


class AuthServiceError(RuntimeError):
    pass


def _authorization_header(event: Mapping[str, object]) -> str | None:
    headers = event.get("headers")
    if not isinstance(headers, Mapping):
        return None
    for key, value in headers.items():
        if isinstance(key, str) and key.lower() == "authorization" and isinstance(value, str):
            scheme, separator, token = value.partition(" ")
            if separator and scheme.lower() == "bearer" and token.strip():
                return token.strip()
    return None


def get_user_id(event: Mapping[str, object]) -> str:
    token = _authorization_header(event)
    if token is None:
        raise UnauthorizedError("A valid Supabase access token is required.")

    base_url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    publishable_key = os.environ.get("SUPABASE_PUBLISHABLE_KEY", "")
    if not base_url or not publishable_key:
        raise AuthServiceError("Supabase Auth verification is not configured.")

    request = Request(
        f"{base_url}/auth/v1/user",
        headers={
            "apikey": publishable_key,
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
        },
        method="GET",
    )
    try:
        with urlopen(request, timeout=AUTH_TIMEOUT_SECONDS) as result:
            try:
                payload = json.loads(result.read())
            except json.JSONDecodeError as exc:
                raise AuthServiceError("Supabase Auth returned an invalid response.") from exc
    except HTTPError as exc:
        if exc.code in (401, 403):
            raise UnauthorizedError("The Supabase access token is invalid or expired.") from exc
        raise AuthServiceError(f"Supabase Auth returned HTTP {exc.code}.") from exc
    except URLError as exc:
        raise AuthServiceError("Supabase Auth could not be reached.") from exc
    except OSError as exc:
        raise AuthServiceError("Supabase Auth could not be reached.") from exc

    user_id = payload.get("id") if isinstance(payload, Mapping) else None
    if not is_uuid(user_id):
        raise AuthServiceError("Supabase Auth returned an invalid user identity.")
    return user_id
