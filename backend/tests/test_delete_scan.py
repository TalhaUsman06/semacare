import json
from typing import Any
from unittest.mock import Mock

import pytest
from botocore.exceptions import ClientError

from delete_scan import handler
from shared.supabase_rest import SupabaseError

USER_ID = "6f1c2a9e-1b7d-4c2e-9a51-0b7a3e5d9c11"
OTHER_USER_ID = "00000000-0000-4000-8000-000000000001"
SCAN_ID = "a2b9c0de-3f41-4a8b-9c77-1e2d3c4b5a69"
BUCKET = "semacare-thumbs-test"


def make_event(user_id: str = USER_ID, scan_id: str = SCAN_ID) -> dict[str, Any]:
    return {
        "headers": {"Authorization": f"Bearer {user_id}"},
        "pathParameters": {"scan_id": scan_id},
    }


def body(result: dict[str, Any]) -> dict[str, Any]:
    return json.loads(result["body"])


class FakePaginator:
    def __init__(self, pages: list[dict[str, Any]]) -> None:
        self.pages = pages
        self.arguments: dict[str, Any] | None = None

    def paginate(self, **kwargs: Any) -> list[dict[str, Any]]:
        self.arguments = kwargs
        return self.pages


class FakeS3:
    def __init__(
        self,
        pages: list[dict[str, Any]] | None = None,
        delete_response: dict[str, Any] | None = None,
    ) -> None:
        self.paginator = FakePaginator(pages or [])
        self.delete_response = delete_response or {}
        self.deleted: list[dict[str, Any]] = []

    def get_paginator(self, operation: str) -> FakePaginator:
        assert operation == "list_objects_v2"
        return self.paginator

    def delete_objects(self, **kwargs: Any) -> dict[str, Any]:
        self.deleted.append(kwargs)
        return self.delete_response


def setup_delete(
    monkeypatch: pytest.MonkeyPatch,
    *,
    scan_rows: list[dict[str, str]] | None = None,
    pages: list[dict[str, Any]] | None = None,
    delete_response: dict[str, Any] | None = None,
) -> tuple[Mock, Mock, FakeS3]:
    monkeypatch.setenv("BUCKET_NAME", BUCKET)
    select = Mock(
        return_value=(
            [{"id": SCAN_ID, "user_id": USER_ID}]
            if scan_rows is None
            else scan_rows
        )
    )
    delete = Mock()
    s3 = FakeS3(pages, delete_response)
    monkeypatch.setattr(handler.db, "select", select)
    monkeypatch.setattr(handler.db, "delete", delete)
    monkeypatch.setattr(handler, "S3_CLIENT", s3)
    return select, delete, s3


def test_delete_wipes_s3_prefix_and_scan_row(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    pages = [
        {
            "Contents": [
                {"Key": f"{USER_ID}/{SCAN_ID}/image-1.jpg"},
                {"Key": f"{USER_ID}/{SCAN_ID}/image-2.jpg"},
            ]
        },
        {"Contents": [{"Key": f"{USER_ID}/{SCAN_ID}/image-3.jpg"}]},
    ]
    select, delete, s3 = setup_delete(
        monkeypatch,
        pages=pages,
    )

    result = handler.lambda_handler(make_event(), None)

    assert result["statusCode"] == 200
    assert body(result) == {
        "scan_id": SCAN_ID,
        "deleted_objects": 3,
        "deleted": True,
    }
    select.assert_called_once_with(f"scans?id=eq.{SCAN_ID}&select=id,user_id")
    assert s3.paginator.arguments == {
        "Bucket": BUCKET,
        "Prefix": f"{USER_ID}/{SCAN_ID}/",
    }
    assert [len(call["Delete"]["Objects"]) for call in s3.deleted] == [2, 1]
    delete.assert_called_once_with(
        "scans", {"id": f"eq.{SCAN_ID}", "user_id": f"eq.{USER_ID}"}
    )


@pytest.mark.parametrize(
    "event",
    [
        {"headers": {"Authorization": "Bearer invalid"}, "pathParameters": {"scan_id": SCAN_ID}},
        {"headers": {"Authorization": f"Bearer {USER_ID}"}, "pathParameters": {"scan_id": "invalid"}},
        {"headers": {"Authorization": f"Bearer {USER_ID}"}, "pathParameters": None},
    ],
)
def test_invalid_identity_or_scan_id_returns_bad_request(
    monkeypatch: pytest.MonkeyPatch, event: dict[str, Any]
) -> None:
    select = Mock()
    monkeypatch.setattr(handler.db, "select", select)
    result = handler.lambda_handler(event, None)
    is_unauthorized = event["headers"]["Authorization"] == "Bearer invalid"
    assert result["statusCode"] == (401 if is_unauthorized else 400)
    assert body(result)["error"] == ("unauthorized" if is_unauthorized else "bad_request")
    select.assert_not_called()


@pytest.mark.parametrize(
    "scan_rows",
    [[], [{"id": SCAN_ID, "user_id": OTHER_USER_ID}]],
)
def test_missing_or_foreign_scan_is_not_found_without_s3_access(
    monkeypatch: pytest.MonkeyPatch, scan_rows: list[dict[str, str]]
) -> None:
    select, delete, s3 = setup_delete(monkeypatch, scan_rows=scan_rows)
    monkeypatch.setenv("BUCKET_NAME", "")

    result = handler.lambda_handler(make_event(), None)

    assert result["statusCode"] == 404
    assert body(result)["error"] == "not_found"
    delete.assert_not_called()
    assert s3.paginator.arguments is None
    assert not s3.deleted


def test_empty_s3_prefix_still_deletes_database_scan(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _, delete, s3 = setup_delete(monkeypatch, pages=[{}])

    result = handler.lambda_handler(make_event(), None)

    assert result["statusCode"] == 200
    assert body(result)["deleted_objects"] == 0
    assert not s3.deleted
    delete.assert_called_once()


def test_missing_bucket_configuration_is_reported_for_owned_scan(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _, delete, s3 = setup_delete(monkeypatch)
    monkeypatch.setenv("BUCKET_NAME", "")

    result = handler.lambda_handler(make_event(), None)

    assert result["statusCode"] == 500
    assert body(result)["error"] == "server_error"
    assert s3.paginator.arguments is None
    delete.assert_not_called()


def test_s3_partial_failure_preserves_database_scan_for_retry(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _, delete, _ = setup_delete(
        monkeypatch,
        pages=[{"Contents": [{"Key": "one"}]}],
        delete_response={
            "Deleted": [],
            "Errors": [{"Key": "one", "Code": "AccessDenied"}],
        },
    )

    result = handler.lambda_handler(make_event(), None)

    assert result["statusCode"] == 500
    assert body(result)["error"] == "server_error"
    delete.assert_not_called()


def test_s3_request_error_returns_server_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _, delete, _ = setup_delete(monkeypatch)
    s3 = Mock()
    s3.get_paginator.side_effect = ClientError(
        {"Error": {"Code": "AccessDenied", "Message": "denied"}},
        "ListObjectsV2",
    )
    monkeypatch.setattr(handler, "S3_CLIENT", s3)

    result = handler.lambda_handler(make_event(), None)

    assert result["statusCode"] == 500
    delete.assert_not_called()


def test_supabase_failure_returns_server_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _, _, s3 = setup_delete(monkeypatch)
    monkeypatch.setattr(handler.db, "delete", Mock(side_effect=SupabaseError("offline")))

    result = handler.lambda_handler(make_event(), None)

    assert result["statusCode"] == 500
    assert s3.paginator.arguments is not None
