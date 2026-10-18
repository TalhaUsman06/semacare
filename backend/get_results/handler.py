import logging
from collections import Counter
from collections.abc import Mapping
from typing import Any

from shared.auth import AuthServiceError, UnauthorizedError, get_user_id
from shared import supabase_rest as db
from shared.responses import error, is_uuid, response

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

IMAGE_FIELDS = (
    "id,status,category,labels,ocr_summary,confidence,textract_used,processing_ms,error"
)
IMAGE_LIMIT = 1000


def lambda_handler(event: Mapping[str, Any], context: Any) -> dict[str, Any]:
    del context
    try:
        user_id = get_user_id(event)
    except UnauthorizedError:
        return error(401, "unauthorized", "Sign in to use the image processing service.")
    except AuthServiceError:
        logger.exception("Supabase Auth verification is unavailable.")
        return error(503, "auth_unavailable", "Sign-in verification is temporarily unavailable.")

    query = event.get("queryStringParameters")
    scan_id = query.get("scan_id") if isinstance(query, Mapping) else None
    if not is_uuid(scan_id):
        return error(400, "bad_request", "scan_id must be a lowercase UUID.")

    try:
        scans = db.select(f"scans?id=eq.{scan_id}&select=id,user_id")
        if (
            not isinstance(scans, list)
            or not scans
            or not isinstance(scans[0], Mapping)
            or scans[0].get("user_id") != user_id
        ):
            return error(404, "not_found", "Scan not found.")

        rows = db.select(
            f"images?scan_id=eq.{scan_id}&select={IMAGE_FIELDS}&limit={IMAGE_LIMIT}"
        )
        if not isinstance(rows, list):
            logger.error("Image results returned an unexpected response for scan %s", scan_id)
            return error(500, "server_error", "Scan results could not be loaded.")

        counts: Counter[str] = Counter()
        images = []
        for row in rows:
            if not isinstance(row, Mapping):
                logger.error("Image results contained a malformed row for scan %s", scan_id)
                return error(500, "server_error", "Scan results could not be loaded.")
            status = row.get("status")
            if not isinstance(status, str) or status not in {"pending", "done", "error"}:
                logger.error("Invalid image status returned for scan %s", scan_id)
                return error(500, "server_error", "Scan results could not be loaded.")
            counts[status] += 1
            image = dict(row)
            image["image_id"] = image.pop("id")
            images.append(image)
    except db.SupabaseError:
        logger.exception("Supabase request failed while loading scan %s", scan_id)
        return error(500, "server_error", "Scan results could not be loaded.")

    return response(
        200,
        {
            "scan_id": scan_id,
            "counts": {
                "pending": counts["pending"],
                "done": counts["done"],
                "error": counts["error"],
            },
            "images": images,
        },
    )
