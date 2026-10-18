import logging
import os
from typing import Any
from unittest.mock import Mock

import pytest

os.environ.setdefault("AWS_EC2_METADATA_DISABLED", "true")

from process_image import handler
from shared.supabase_rest import SupabaseError

USER_ID = "6f1c2a9e-1b7d-4c2e-9a51-0b7a3e5d9c11"
SCAN_ID = "a2b9c0de-3f41-4a8b-9c77-1e2d3c4b5a69"
IMAGE_ID = "0d3e12ab-3f41-4a8b-9c77-1e2d3c4b5a69"
BUCKET = "semacare-thumbs-test"
KEY = f"{USER_ID}/{SCAN_ID}/{IMAGE_ID}.jpg"


class FakeS3:
    def __init__(self) -> None:
        self.deleted: list[tuple[str, str]] = []

    def delete_object(self, Bucket: str, Key: str) -> None:
        self.deleted.append((Bucket, Key))


def make_event(key: str = KEY) -> dict[str, Any]:
    return {
        "Records": [
            {
                "s3": {
                    "bucket": {"name": BUCKET},
                    "object": {"key": key},
                }
            }
        ]
    }


def image_row(**changes: Any) -> dict[str, Any]:
    row: dict[str, Any] = {
        "id": IMAGE_ID,
        "scan_id": SCAN_ID,
        "user_id": USER_ID,
        "width": 1170,
        "height": 2532,
        "is_png": True,
        "name_hint": False,
    }
    row.update(changes)
    return row


def setup_worker(monkeypatch: pytest.MonkeyPatch) -> tuple[Mock, Mock, Mock, FakeS3]:
    database_select = Mock(return_value=[image_row()])
    database_update = Mock()
    recognition = Mock(
        detect_labels=Mock(
            return_value={
                "Labels": [
                    {"Name": "Text", "Confidence": 91.0},
                    {"Name": "Screenshot", "Confidence": 88.0},
                ]
            }
        )
    )
    textract = Mock()
    s3 = FakeS3()
    monkeypatch.setattr(handler.db, "select", database_select)
    monkeypatch.setattr(handler.db, "update", database_update)
    monkeypatch.setattr(handler, "REKOGNITION_CLIENT", recognition)
    monkeypatch.setattr(handler, "TEXTRACT_CLIENT", textract)
    monkeypatch.setattr(handler, "S3_CLIENT", s3)
    return database_select, database_update, recognition, s3


def test_labels_are_categorised_without_textract_when_not_needed(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    database_select, database_update, recognition, s3 = setup_worker(monkeypatch)
    recognition.detect_labels.return_value = {
        "Labels": [{"Name": "Person", "Confidence": 97.0}]
    }

    with caplog.at_level(logging.INFO):
        handler.lambda_handler(make_event(), None)

    database_select.assert_called_once()
    recognition.detect_labels.assert_called_once_with(
        Image={"S3Object": {"Bucket": BUCKET, "Name": KEY}},
        MaxLabels=25,
        MinConfidence=60,
    )
    handler.TEXTRACT_CLIENT.detect_document_text.assert_not_called()
    patch = database_update.call_args.args[2]
    assert patch["status"] == "done"
    assert patch["category"] == "People"
    assert patch["labels"] == ["Person"]
    assert patch["textract_used"] is False
    assert isinstance(patch["processing_ms"], int)
    assert s3.deleted == [(BUCKET, KEY)]
    assert '"event":"image_processed"' in caplog.text


def test_text_labels_trigger_textract_and_ocr_is_not_logged(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    _, database_update, recognition, s3 = setup_worker(monkeypatch)
    private_ocr_text = "TEST PRIVACY TEXT amount due 12.00"
    recognition.detect_labels.return_value = {
        "Labels": [
            {"Name": "Text", "Confidence": 98.0},
            {"Name": "Receipt", "Confidence": 92.0},
        ]
    }
    handler.TEXTRACT_CLIENT.detect_document_text.return_value = {
        "Blocks": [
            {"BlockType": "LINE", "Text": "TEST PRIVACY TEXT"},
            {"BlockType": "WORD", "Text": "ignored"},
            {"BlockType": "LINE", "Text": "amount due 12.00"},
        ]
    }

    with caplog.at_level(logging.INFO):
        handler.lambda_handler(make_event(), None)

    handler.TEXTRACT_CLIENT.detect_document_text.assert_called_once_with(
        Document={"S3Object": {"Bucket": BUCKET, "Name": KEY}}
    )
    patch = database_update.call_args.args[2]
    assert patch["category"] == "Receipts"
    assert patch["ocr_summary"] == private_ocr_text
    assert patch["textract_used"] is True
    assert private_ocr_text not in caplog.text
    assert '"labels":["Text","Receipt"]' in caplog.text
    assert s3.deleted == [(BUCKET, KEY)]


def test_failed_ai_call_marks_image_error_and_deletes_thumbnail(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    _, database_update, recognition, s3 = setup_worker(monkeypatch)
    recognition.detect_labels.side_effect = RuntimeError("AI service unavailable")

    with caplog.at_level(logging.ERROR):
        handler.lambda_handler(make_event(), None)

    patch = database_update.call_args.args[2]
    assert patch["status"] == "error"
    assert patch["error"] == "AI service unavailable"
    assert isinstance(patch["processing_ms"], int)
    assert "Image processing failed" in caplog.text
    assert s3.deleted == [(BUCKET, KEY)]


def test_missing_database_row_skips_ai_and_still_deletes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database_select, _, recognition, s3 = setup_worker(monkeypatch)
    database_select.return_value = []

    handler.lambda_handler(make_event(), None)

    recognition.detect_labels.assert_not_called()
    assert s3.deleted == [(BUCKET, KEY)]


def test_mismatched_database_owner_skips_ai_and_deletes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database_select, _, recognition, s3 = setup_worker(monkeypatch)
    database_select.return_value = [image_row(user_id="00000000-0000-4000-8000-000000000001")]

    handler.lambda_handler(make_event(), None)

    recognition.detect_labels.assert_not_called()
    assert s3.deleted == [(BUCKET, KEY)]


def test_mismatched_database_image_id_skips_ai_and_deletes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database_select, _, recognition, s3 = setup_worker(monkeypatch)
    database_select.return_value = [image_row(id="00000000-0000-4000-8000-000000000005")]

    handler.lambda_handler(make_event(), None)

    recognition.detect_labels.assert_not_called()
    assert s3.deleted == [(BUCKET, KEY)]


def test_invalid_object_key_is_deleted_without_database_or_ai_calls(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database_select = Mock()
    recognition = Mock()
    s3 = FakeS3()
    monkeypatch.setattr(handler.db, "select", database_select)
    monkeypatch.setattr(handler, "REKOGNITION_CLIENT", recognition)
    monkeypatch.setattr(handler, "S3_CLIENT", s3)
    invalid_key = "user-name/private-image.jpg"

    handler.lambda_handler(make_event(invalid_key), None)

    database_select.assert_not_called()
    recognition.detect_labels.assert_not_called()
    assert s3.deleted == [(BUCKET, invalid_key)]


def test_database_failure_marks_error_and_deletes_thumbnail(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database_update = Mock()
    monkeypatch.setattr(
        handler.db, "select", Mock(side_effect=SupabaseError("database unavailable"))
    )
    monkeypatch.setattr(handler.db, "update", database_update)
    s3 = FakeS3()
    monkeypatch.setattr(handler, "S3_CLIENT", s3)

    handler.lambda_handler(make_event(), None)

    assert database_update.call_args.args[2]["status"] == "error"
    assert s3.deleted == [(BUCKET, KEY)]


def test_invalid_s3_event_is_logged_not_raised(caplog: pytest.LogCaptureFixture) -> None:
    with caplog.at_level(logging.ERROR):
        handler.lambda_handler({"Records": [{}]}, None)
    assert "Ignoring malformed S3 event record" in caplog.text


def test_s3_client_configuration_uses_adaptive_retries() -> None:
    assert handler.S3_CLIENT.meta.config.retries == {
        "mode": "adaptive",
        "total_max_attempts": 9,
    }
