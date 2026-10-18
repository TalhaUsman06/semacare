import json
from unittest.mock import Mock

import pytest

from get_results import handler
from shared.supabase_rest import SupabaseError

USER_ID = "6f1c2a9e-1b7d-4c2e-9a51-0b7a3e5d9c11"
OTHER_USER_ID = "00000000-0000-4000-8000-000000000001"
SCAN_ID = "a2b9c0de-3f41-4a8b-9c77-1e2d3c4b5a69"


def make_event(
    user_id: str = USER_ID, scan_id: str = SCAN_ID
) -> dict[str, object]:
    return {
        "headers": {"Authorization": f"Bearer {user_id}"},
        "queryStringParameters": {"scan_id": scan_id},
    }


def body(result: dict[str, object]) -> dict[str, object]:
    return json.loads(result["body"])


def test_results_are_owner_scoped_and_statuses_are_counted(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database_select = Mock(
        side_effect=[
            [{"id": SCAN_ID, "user_id": USER_ID}],
            [
                {
                    "id": "00000000-0000-4000-8000-000000000002",
                    "status": "done",
                    "category": "People",
                    "labels": ["Person"],
                    "ocr_summary": None,
                    "confidence": 97,
                    "textract_used": False,
                    "processing_ms": 12,
                    "error": None,
                },
                {
                    "id": "00000000-0000-4000-8000-000000000003",
                    "status": "pending",
                    "category": None,
                    "labels": None,
                    "ocr_summary": None,
                    "confidence": None,
                    "textract_used": False,
                    "processing_ms": None,
                    "error": None,
                },
                {
                    "id": "00000000-0000-4000-8000-000000000004",
                    "status": "error",
                    "category": None,
                    "labels": None,
                    "ocr_summary": None,
                    "confidence": None,
                    "textract_used": False,
                    "processing_ms": 8,
                    "error": "Processing failed",
                },
            ],
        ]
    )
    monkeypatch.setattr(handler.db, "select", database_select)

    result = handler.lambda_handler(make_event(), None)

    assert result["statusCode"] == 200
    payload = body(result)
    assert payload["scan_id"] == SCAN_ID
    assert payload["counts"] == {"pending": 1, "done": 1, "error": 1}
    assert len(payload["images"]) == 3
    assert payload["images"][0]["image_id"] == (
        "00000000-0000-4000-8000-000000000002"
    )
    assert "id" not in payload["images"][0]
    assert database_select.call_args_list[0].args[0] == (
        f"scans?id=eq.{SCAN_ID}&select=id,user_id"
    )
    assert database_select.call_args_list[1].args[0] == (
        f"images?scan_id=eq.{SCAN_ID}&select={handler.IMAGE_FIELDS}&limit=1000"
    )


@pytest.mark.parametrize(
    "event",
    [
        {"headers": {"Authorization": "Bearer invalid"}, "queryStringParameters": {"scan_id": SCAN_ID}},
        {"headers": {"Authorization": f"Bearer {USER_ID}"}, "queryStringParameters": {"scan_id": "invalid"}},
        {"headers": {"Authorization": f"Bearer {USER_ID}"}, "queryStringParameters": None},
    ],
)
def test_invalid_identity_or_scan_id_returns_bad_request(
    monkeypatch: pytest.MonkeyPatch, event: dict[str, object]
) -> None:
    database_select = Mock()
    monkeypatch.setattr(handler.db, "select", database_select)

    result = handler.lambda_handler(event, None)

    assert result["statusCode"] == (401 if event["headers"]["Authorization"] == "Bearer invalid" else 400)
    assert body(result)["error"] == (
        "unauthorized" if event["headers"]["Authorization"] == "Bearer invalid" else "bad_request"
    )
    database_select.assert_not_called()


@pytest.mark.parametrize(
    "scan_rows",
    [[], [{"id": SCAN_ID, "user_id": OTHER_USER_ID}]],
)
def test_missing_or_foreign_scan_returns_not_found(
    monkeypatch: pytest.MonkeyPatch, scan_rows: list[dict[str, str]]
) -> None:
    database_select = Mock(return_value=scan_rows)
    monkeypatch.setattr(handler.db, "select", database_select)

    result = handler.lambda_handler(make_event(), None)

    assert result["statusCode"] == 404
    assert body(result)["error"] == "not_found"
    assert database_select.call_count == 1


def test_database_error_returns_server_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        handler.db, "select", Mock(side_effect=SupabaseError("database unavailable"))
    )

    result = handler.lambda_handler(make_event(), None)

    assert result["statusCode"] == 500
    assert body(result)["error"] == "server_error"


def test_unexpected_status_returns_server_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        handler.db,
        "select",
        Mock(
            side_effect=[
                [{"id": SCAN_ID, "user_id": USER_ID}],
                [{"id": "image", "status": "unknown"}],
            ]
        ),
    )

    result = handler.lambda_handler(make_event(), None)

    assert result["statusCode"] == 500
    assert body(result)["error"] == "server_error"
