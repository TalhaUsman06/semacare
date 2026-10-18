from unittest.mock import Mock

from entrypoint import lambda_handler


def test_api_gateway_routes_to_upload_handler(monkeypatch) -> None:
    expected = {"statusCode": 200}
    upload = Mock(return_value=expected)
    monkeypatch.setattr("entrypoint.get_upload_urls", upload)

    result = lambda_handler(
        {
            "requestContext": {"http": {"method": "POST"}},
            "rawPath": "/upload-urls",
        },
        None,
    )

    assert result is expected
    upload.assert_called_once()


def test_api_gateway_delete_route_extracts_scan_id(monkeypatch) -> None:
    expected = {"statusCode": 200}
    delete = Mock(return_value=expected)
    monkeypatch.setattr("entrypoint.delete_scan", delete)
    event = {
        "requestContext": {"http": {"method": "DELETE"}},
        "rawPath": "/scans/00000000-0000-4000-8000-000000000001",
    }

    assert lambda_handler(event, None) is expected
    assert delete.call_args.args[0]["pathParameters"]["scan_id"] == (
        "00000000-0000-4000-8000-000000000001"
    )


def test_s3_event_routes_to_ai_processor(monkeypatch) -> None:
    expected = None
    process = Mock(return_value=expected)
    monkeypatch.setattr("entrypoint.process_image", process)
    event = {"Records": [{"eventSource": "aws:s3"}]}

    assert lambda_handler(event, None) is expected
    process.assert_called_once_with(event, None)


def test_unknown_route_returns_not_found() -> None:
    result = lambda_handler(
        {"requestContext": {"http": {"method": "GET"}}, "rawPath": "/unknown"},
        None,
    )

    assert result["statusCode"] == 404
