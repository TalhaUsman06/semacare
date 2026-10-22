import base64
import json
from collections.abc import Mapping
from io import BytesIO
from urllib.error import HTTPError
from unittest.mock import patch

import pytest

from shared import auth
from shared import responses
from shared.supabase_rest import (
    SupabaseError,
    _headers,
    count,
    delete,
    insert,
    select,
    update,
    upsert,
)

USER_ID = "6f1c2a9e-1b7d-4c2e-9a51-0b7a3e5d9c11"


class FakeResponse:
    def __init__(self, body: bytes = b"", headers: Mapping[str, str] | None = None):
        self.body = body
        self.headers = headers or {}

    def __enter__(self) -> "FakeResponse":
        return self

    def __exit__(self, *args: object) -> None:
        return None

    def read(self, amount: int = -1) -> bytes:
        return self.body if amount < 0 else self.body[:amount]


def configure_env(monkeypatch: pytest.MonkeyPatch, key: str = "sb_secret_test") -> None:
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co/")
    monkeypatch.setenv("SUPABASE_SERVICE_KEY", key)


def test_is_uuid_accepts_only_lowercase_uuid_v4_shape() -> None:
    assert responses.is_uuid(USER_ID)
    assert not responses.is_uuid(USER_ID.upper())
    assert not responses.is_uuid("not-a-uuid")
    assert not responses.is_uuid(None)


def test_api_response_and_error_shapes() -> None:
    result = responses.response(200, {"ok": True})
    assert result["statusCode"] == 200
    assert result["headers"] == {"content-type": "application/json"}
    assert json.loads(result["body"]) == {"ok": True}
    assert json.loads(responses.error(400, "bad_request", "Bad input")["body"]) == {
        "error": "bad_request",
        "message": "Bad input",
    }


def test_get_user_id_verifies_supabase_bearer_token(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    configure_env(monkeypatch)
    monkeypatch.setenv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test")
    with patch(
        "shared.auth.urlopen",
        return_value=FakeResponse(json.dumps({"id": USER_ID}).encode()),
    ) as urlopen:
        assert auth.get_user_id({"headers": {"aUtHoRiZaTiOn": "Bearer access-token"}}) == USER_ID
    request = urlopen.call_args.args[0]
    assert request.full_url == "https://example.supabase.co/auth/v1/user"
    assert request.get_header("Apikey") == "sb_publishable_test"
    assert request.get_header("Authorization") == "Bearer access-token"


def test_get_user_id_rejects_missing_or_invalid_bearer_token() -> None:
    with pytest.raises(auth.UnauthorizedError):
        auth.get_user_id({"headers": {"x-user-id": USER_ID}})

    with patch.dict(
        "os.environ",
        {
            "SUPABASE_URL": "https://example.supabase.co",
            "SUPABASE_PUBLISHABLE_KEY": "sb_publishable_test",
        },
    ), patch(
        "shared.auth.urlopen",
        side_effect=HTTPError("https://example.supabase.co/auth/v1/user", 401, "Unauthorized", {}, BytesIO(b"")),
    ):
        with pytest.raises(auth.UnauthorizedError):
            auth.get_user_id({"headers": {"Authorization": "Bearer expired"}})


def test_get_user_id_reports_auth_service_failures(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    configure_env(monkeypatch)
    monkeypatch.setenv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test")
    with patch("shared.auth.urlopen", side_effect=OSError("offline")):
        with pytest.raises(auth.AuthServiceError):
            auth.get_user_id({"headers": {"Authorization": "Bearer access-token"}})


def test_parse_json_plain_body() -> None:
    assert responses.parse_json({"body": '{"ok":true}'}) == {"ok": True}


def test_parse_json_decodes_base64_body() -> None:
    body = base64.b64encode(b'{"scan_id":"demo"}').decode("ascii")
    assert responses.parse_json({"body": body, "isBase64Encoded": True}) == {
        "scan_id": "demo"
    }


@pytest.mark.parametrize(
    "event",
    [
        {"body": None},
        {"body": "{"},
        {"body": "////", "isBase64Encoded": True},
    ],
)
def test_parse_json_rejects_invalid_bodies(event: dict[str, object]) -> None:
    with pytest.raises(ValueError):
        responses.parse_json(event)


def test_service_secret_header_uses_apikey_and_authorization(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("SUPABASE_SERVICE_KEY", "sb_secret_test")
    assert _headers()["apikey"] == "sb_secret_test"
    assert _headers()["Authorization"] == "Bearer sb_secret_test"


def test_legacy_jwt_also_sends_bearer_authorization(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("SUPABASE_SERVICE_KEY", "eyJlegacy")
    assert _headers()["Authorization"] == "Bearer eyJlegacy"


def test_missing_supabase_configuration_fails_explicitly(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    with pytest.raises(SupabaseError, match="SUPABASE_URL"):
        select("scans?select=id")


def test_select_uses_rest_url_and_apikey(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    configure_env(monkeypatch)
    response_body = b'[{"id":"scan"}]'
    with patch(
        "shared.supabase_rest.urlopen", return_value=FakeResponse(response_body)
    ) as urlopen:
        assert select("scans?select=id") == [{"id": "scan"}]
    request = urlopen.call_args.args[0]
    assert request.full_url == "https://example.supabase.co/rest/v1/scans?select=id"
    assert request.get_header("Apikey") == "sb_secret_test"
    assert request.get_header("Authorization") == "Bearer sb_secret_test"


def test_insert_and_upsert_send_expected_prefer_headers(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    configure_env(monkeypatch)
    with patch(
        "shared.supabase_rest.urlopen",
        side_effect=[FakeResponse(), FakeResponse()],
    ) as urlopen:
        insert("scans", {"id": USER_ID})
        upsert("scans", [{"id": USER_ID}], ignore_duplicates=True)
    insert_request = urlopen.call_args_list[0].args[0]
    upsert_request = urlopen.call_args_list[1].args[0]
    assert insert_request.get_header("Prefer") == "return=minimal"
    assert upsert_request.full_url.endswith("/scans?on_conflict=id")
    assert upsert_request.get_header("Prefer") == (
        "resolution=ignore-duplicates,return=minimal"
    )


def test_update_and_delete_encode_filters(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    configure_env(monkeypatch)
    with patch(
        "shared.supabase_rest.urlopen",
        side_effect=[FakeResponse(), FakeResponse()],
    ) as urlopen:
        update("images", {"id": f"eq.{USER_ID}"}, {"status": "done"})
        delete("scans", {"id": f"eq.{USER_ID}"})
    update_request = urlopen.call_args_list[0].args[0]
    delete_request = urlopen.call_args_list[1].args[0]
    assert update_request.get_method() == "PATCH"
    assert update_request.full_url.endswith(f"/images?id=eq.{USER_ID}")
    assert json.loads(update_request.data) == {"status": "done"}
    assert delete_request.get_method() == "DELETE"


def test_count_parses_exact_content_range(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    configure_env(monkeypatch)
    with patch(
        "shared.supabase_rest.urlopen",
        return_value=FakeResponse(headers={"Content-Range": "0-9/10"}),
    ) as urlopen:
        assert count("images", {"scan_id": f"eq.{USER_ID}"}) == 10
    request = urlopen.call_args.args[0]
    assert request.get_header("Prefer") == "count=exact"


def test_count_rejects_missing_content_range(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    configure_env(monkeypatch)
    with patch("shared.supabase_rest.urlopen", return_value=FakeResponse()):
        with pytest.raises(SupabaseError, match="Content-Range"):
            count("images", {"scan_id": f"eq.{USER_ID}"})


def test_http_errors_include_status_and_truncated_response(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    configure_env(monkeypatch)
    body = b"x" * 400
    failure = HTTPError(
        "https://example.supabase.co/rest/v1/scans",
        403,
        "Forbidden",
        {},
        BytesIO(body),
    )
    with patch("shared.supabase_rest.urlopen", side_effect=failure):
        with pytest.raises(SupabaseError) as caught:
            select("scans?select=id")
    assert caught.value.status_code == 403
    assert len(caught.value.response_excerpt) == 300
    assert len(str(caught.value)) < 400
