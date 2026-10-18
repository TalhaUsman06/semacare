import logging
from collections.abc import Mapping
from typing import Any

from delete_scan.handler import lambda_handler as delete_scan
from get_results.handler import lambda_handler as get_results
from get_upload_urls.handler import lambda_handler as get_upload_urls
from process_image.handler import lambda_handler as process_image
from shared.responses import error

logger = logging.getLogger(__name__)


def lambda_handler(event: Mapping[str, Any], context: Any) -> Any:
    if isinstance(event.get("Records"), list):
        return process_image(event, context)

    request_context = event.get("requestContext")
    http_context = (
        request_context.get("http")
        if isinstance(request_context, Mapping)
        else None
    )
    method = (
        http_context.get("method")
        if isinstance(http_context, Mapping)
        else event.get("httpMethod")
    )
    path = event.get("rawPath", event.get("path", ""))
    if not isinstance(path, str) or not isinstance(method, str):
        return error(400, "bad_request", "A valid API Gateway HTTP request is required.")

    if method == "POST" and path.rstrip("/") == "/upload-urls":
        return get_upload_urls(event, context)
    if method == "GET" and path.rstrip("/") == "/results":
        return get_results(event, context)
    if method == "DELETE":
        segments = path.rstrip("/").split("/")
        if len(segments) == 3 and segments[1] == "scans":
            path_parameters = event.get("pathParameters")
            if not isinstance(path_parameters, Mapping):
                event = {**event, "pathParameters": {"scan_id": segments[2]}}
            return delete_scan(event, context)
    return error(404, "not_found", "API route not found.")
