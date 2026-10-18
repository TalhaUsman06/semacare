import json
import os
from typing import Any
from unittest.mock import Mock

import pytest

os.environ.setdefault("AWS_EC2_METADATA_DISABLED", "true")

from get_upload_urls import handler
from shared.supabase_rest import SupabaseError

SCAN_ID = "a2b9c0de-3f41-4a8b-9c77-1e2d3c4b5a69"
USER_ID = "6f1c2a9e-1b7d-4c2e-9a51-0b7a3e5d9c11"
IMAGE_ID = "0d3e12ab-3f41-4a8b-9c77-1e2d3c4b5a69"


class FakeS3:
    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []

    def generate_presigned_url(self, operation: str, **kwargs: Any) -> str:
        self.calls.append({"operation": operation, **kwargs})
        return f"https://bucket.s3.eu-west-2.amazonaws.com/{kwargs['Params']['Key']}?signed"


def make_event(body: Any, user_id: str = USER_ID) -> dict[str, Any]:
    return {
        "headers": {"Authorization": f"Bearer {user_id}"},
        "body": json.dumps(body),
        "isBase64Encoded": False,
    }


def valid_file(image_id: str = IMAGE_ID) -> dict[str, Any]:
    return {
        "image_id": image_id,
        "width": 1170,
        "height": 2532,
        "is_png": True,
        "name_hint": False,
    }


def setup_service(
    monkeypatch: pytest.MonkeyPatch,
    *,
    scan_owner: str = USER_ID,
    existing_images: list[dict[str, str]] | None = None,
    image_count: int = 0,
) -> tuple[Mock, Mock, Mock, FakeS3]:
    monkeypatch.setenv("BUCKET_NAME", "semacare-thumbs-test")
    monkeypatch.setenv("URL_EXPIRY", "300")
    upsert = Mock()
    select = Mock(
        side_effect=[
            [{"id": SCAN_ID, "user_id": scan_owner}],
            existing_images or [],
        ]
    )
    count = Mock(return_value=image_count)
    monkeypatch.setattr(handler.db, "upsert", upsert)
    monkeypatch.setattr(handler.db, "select", select)
    monkeypatch.setattr(handler.db, "count", count)
    s3 = FakeS3()
    monkeypatch.setattr(handler, "S3_CLIENT", s3)
    return upsert, select, count, s3


def body_for(*files: dict[str, Any]) -> dict[str, Any]:
    return {"scan_id": SCAN_ID, "files": list(files)}


def response_body(result: dict[str, Any]) -> dict[str, Any]:
    return json.loads(result["body"])


def test_valid_request_creates_rows_and_regional_presigned_urls(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    upsert, select, count, s3 = setup_service(monkeypatch)
    result = handler.lambda_handler(make_event(body_for(valid_file())), None)

    assert result["statusCode"] == 200
    assert response_body(result)["expires_in"] == 300
    assert response_body(result)["uploads"] == [
        {
            "image_id": IMAGE_ID,
            "url": f"https://bucket.s3.eu-west-2.amazonaws.com/{USER_ID}/{SCAN_ID}/{IMAGE_ID}.jpg?signed",
        }
    ]
    assert upsert.call_count == 2
    assert upsert.call_args_list[0].args == (
        "scans",
        {"id": SCAN_ID, "user_id": USER_ID},
    )
    image_rows = upsert.call_args_list[1].args[1]
    assert image_rows[0]["status"] == "pending"
    assert "filename" not in image_rows[0]
    assert select.call_count == 2
    count.assert_called_once_with("images", {"scan_id": f"eq.{SCAN_ID}"})
    assert s3.calls[0]["operation"] == "put_object"
    assert s3.calls[0]["Params"]["ContentType"] == "image/jpeg"
    assert s3.calls[0]["ExpiresIn"] == 300
    assert s3.calls[0]["HttpMethod"] == "PUT"


def test_invalid_user_header_is_rejected_before_database_access(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    upsert = Mock()
    monkeypatch.setattr(handler.db, "upsert", upsert)
    result = handler.lambda_handler(make_event(body_for(valid_file()), "invalid"), None)
    assert result["statusCode"] == 401
    assert response_body(result)["error"] == "unauthorized"
    upsert.assert_not_called()


def test_invalid_json_is_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    event = {"headers": {"Authorization": f"Bearer {USER_ID}"}, "body": "{", "isBase64Encoded": False}
    result = handler.lambda_handler(event, None)
    assert result["statusCode"] == 400
    assert response_body(result)["message"] == "Request body must contain valid JSON."


def test_more_than_fifty_files_is_too_many(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    result = handler.lambda_handler(
        make_event(body_for(*(valid_file(
            f"00000000-0000-4000-8000-{index:012x}"
        ) for index in range(51)))),
        None,
    )
    assert result["statusCode"] == 413
    assert response_body(result)["error"] == "too_many"


@pytest.mark.parametrize(
    "field,value",
    [
        ("width", True),
        ("height", 0),
        ("width", 100001),
        ("is_png", 1),
        ("name_hint", "false"),
    ],
)
def test_invalid_file_metadata_is_rejected(
    monkeypatch: pytest.MonkeyPatch, field: str, value: Any
) -> None:
    item = valid_file()
    item[field] = value
    upsert = Mock()
    monkeypatch.setattr(handler.db, "upsert", upsert)
    result = handler.lambda_handler(make_event(body_for(item)), None)
    assert result["statusCode"] == 400
    upsert.assert_not_called()


def test_duplicate_image_ids_in_one_request_are_rejected(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    upsert = Mock()
    monkeypatch.setattr(handler.db, "upsert", upsert)
    result = handler.lambda_handler(
        make_event(body_for(valid_file(), valid_file())), None
    )
    assert result["statusCode"] == 400
    assert "unique" in response_body(result)["message"]
    upsert.assert_not_called()


def test_extra_filename_metadata_is_rejected(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    item = valid_file()
    item["filename"] = "private.jpg"
    upsert = Mock()
    monkeypatch.setattr(handler.db, "upsert", upsert)
    result = handler.lambda_handler(make_event(body_for(item)), None)
    assert result["statusCode"] == 400
    assert "only" in response_body(result)["message"]
    upsert.assert_not_called()


def test_scan_owned_by_another_user_is_forbidden(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    upsert, _, count, _ = setup_service(monkeypatch, scan_owner="00000000-0000-4000-8000-000000000001")
    result = handler.lambda_handler(make_event(body_for(valid_file())), None)
    assert result["statusCode"] == 403
    assert response_body(result)["error"] == "forbidden"
    upsert.assert_called_once()
    count.assert_not_called()


def test_scan_limit_counts_only_new_images_on_retried_request(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    existing = [{"id": IMAGE_ID, "scan_id": SCAN_ID, "user_id": USER_ID}]
    upsert, _, count, s3 = setup_service(
        monkeypatch, existing_images=existing, image_count=500
    )
    result = handler.lambda_handler(make_event(body_for(valid_file())), None)
    assert result["statusCode"] == 200
    count.assert_called_once()
    assert upsert.call_count == 2
    assert len(s3.calls) == 1


def test_scan_limit_rejects_new_images_that_exceed_five_hundred(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    upsert, _, _, s3 = setup_service(monkeypatch, image_count=500)
    result = handler.lambda_handler(make_event(body_for(valid_file())), None)
    assert result["statusCode"] == 413
    assert response_body(result)["error"] == "too_many"
    assert upsert.call_count == 1
    assert not s3.calls


def test_image_id_collision_with_another_scan_is_rejected(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    existing = [
        {
            "id": IMAGE_ID,
            "scan_id": "00000000-0000-4000-8000-000000000002",
            "user_id": USER_ID,
        }
    ]
    upsert, _, count, s3 = setup_service(monkeypatch, existing_images=existing)
    result = handler.lambda_handler(make_event(body_for(valid_file())), None)
    assert result["statusCode"] == 400
    assert upsert.call_count == 1
    count.assert_not_called()
    assert not s3.calls


def test_supabase_failure_is_logged_and_returned_as_server_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("BUCKET_NAME", "semacare-thumbs-test")
    monkeypatch.setattr(handler.db, "upsert", Mock(side_effect=SupabaseError("offline")))
    result = handler.lambda_handler(make_event(body_for(valid_file())), None)
    assert result["statusCode"] == 500
    assert response_body(result)["error"] == "server_error"


def test_invalid_bucket_configuration_is_reported_as_server_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("BUCKET_NAME", "")
    result = handler.lambda_handler(make_event(body_for(valid_file())), None)
    assert result["statusCode"] == 500
    assert response_body(result)["message"] == "Upload service is not configured."


def test_s3_client_uses_regional_endpoint_and_v4_signatures() -> None:
    assert handler.S3_CLIENT.meta.endpoint_url == (
        f"https://s3.{handler.AWS_REGION}.amazonaws.com"
    )
    assert handler.S3_CLIENT.meta.config.signature_version == "s3v4"
    assert handler.S3_CLIENT.meta.config.s3["addressing_style"] == "virtual"
