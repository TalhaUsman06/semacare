import json
import logging
import os
import re
from collections.abc import Mapping
from typing import Any

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

from shared.auth import AuthServiceError, UnauthorizedError
from shared.auth import get_user_id
from shared import supabase_rest as db
from shared.responses import error, is_uuid, parse_json, response

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

MAX_FILES_PER_REQUEST = 50
MAX_IMAGES_PER_SCAN = 500
DEFAULT_URL_EXPIRY_SECONDS = 300
MIN_DIMENSION = 1
MAX_DIMENSION = 100_000
ALLOWED_FILE_FIELDS = {"image_id", "width", "height", "is_png", "name_hint"}

AWS_REGION = os.environ.get("AWS_REGION", "eu-west-2")
S3_CLIENT = boto3.client(
    "s3",
    region_name=AWS_REGION,
    endpoint_url=f"https://s3.{AWS_REGION}.amazonaws.com",
    config=Config(
        signature_version="s3v4",
        s3={"addressing_style": "virtual"},
    ),
)


def _validate_body(body: Any) -> tuple[str, list[dict[str, Any]]] | str:
    if not isinstance(body, Mapping):
        return "Request body must be a JSON object."

    scan_id = body.get("scan_id")
    if not is_uuid(scan_id):
        return "scan_id must be a lowercase UUID."

    files = body.get("files")
    if not isinstance(files, list):
        return "files must be an array."
    if len(files) > MAX_FILES_PER_REQUEST:
        return "A request can contain at most 50 files."
    if not files:
        return "files must contain at least one file."

    validated_files: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for index, item in enumerate(files):
        if not isinstance(item, Mapping) or set(item) != ALLOWED_FILE_FIELDS:
            return f"files[{index}] must contain only image_id, width, height, is_png, and name_hint."

        image_id = item["image_id"]
        if not is_uuid(image_id):
            return f"files[{index}].image_id must be a lowercase UUID."
        if image_id in seen_ids:
            return "image_id values must be unique within a request."
        seen_ids.add(image_id)

        for dimension in ("width", "height"):
            value = item[dimension]
            if (
                not isinstance(value, int)
                or isinstance(value, bool)
                or not MIN_DIMENSION <= value <= MAX_DIMENSION
            ):
                return f"files[{index}].{dimension} must be an integer from 1 to 100000."

        for flag in ("is_png", "name_hint"):
            if not isinstance(item[flag], bool):
                return f"files[{index}].{flag} must be a boolean."

        validated_files.append(dict(item))

    return scan_id, validated_files


def _configuration() -> tuple[str, int]:
    bucket_name = os.environ.get("BUCKET_NAME", "")
    if not bucket_name or not re.fullmatch(r"[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]", bucket_name):
        raise ValueError("BUCKET_NAME is missing or invalid.")

    try:
        expiry = int(os.environ.get("URL_EXPIRY", str(DEFAULT_URL_EXPIRY_SECONDS)))
    except ValueError as exc:
        raise ValueError("URL_EXPIRY must be an integer.") from exc
    if not 1 <= expiry <= 3600:
        raise ValueError("URL_EXPIRY must be between 1 and 3600 seconds.")
    return bucket_name, expiry


def lambda_handler(event: Mapping[str, Any], context: Any) -> dict[str, Any]:
    del context

    try:
        user_id = get_user_id(event)
    except UnauthorizedError:
        return error(401, "unauthorized", "Sign in to use the image processing service.")
    except AuthServiceError:
        logger.exception("Supabase Auth verification is unavailable.")
        return error(503, "auth_unavailable", "Sign-in verification is temporarily unavailable.")

    try:
        body = parse_json(event)
    except ValueError:
        return error(400, "bad_request", "Request body must contain valid JSON.")

    validated = _validate_body(body)
    if isinstance(validated, str):
        if isinstance(body, Mapping) and isinstance(body.get("files"), list):
            if len(body["files"]) > MAX_FILES_PER_REQUEST:
                return error(413, "too_many", validated)
        return error(400, "bad_request", validated)
    scan_id, files = validated

    try:
        bucket_name, url_expiry = _configuration()
    except ValueError as exc:
        logger.error("Invalid upload URL configuration: %s", exc)
        return error(500, "server_error", "Upload service is not configured.")

    try:
        db.upsert(
            "scans",
            {"id": scan_id, "user_id": user_id},
            ignore_duplicates=True,
        )
        scans = db.select(f"scans?id=eq.{scan_id}&select=id,user_id")
        if (
            not isinstance(scans, list)
            or not scans
            or not isinstance(scans[0], Mapping)
        ):
            logger.error("Scan upsert did not create or return scan %s", scan_id)
            return error(500, "server_error", "The scan could not be initialized.")
        if scans[0].get("user_id") != user_id:
            return error(403, "forbidden", "This scan belongs to another user.")

        image_ids = ",".join(item["image_id"] for item in files)
        existing_images = db.select(
            f"images?id=in.({image_ids})&select=id,scan_id,user_id"
        )
        if not isinstance(existing_images, list):
            logger.error("Image lookup returned an unexpected response for scan %s", scan_id)
            return error(500, "server_error", "The scan could not be checked.")

        existing_ids: set[str] = set()
        for image in existing_images:
            if not isinstance(image, Mapping) or not isinstance(image.get("id"), str):
                logger.error("Image lookup returned malformed data for scan %s", scan_id)
                return error(500, "server_error", "The scan could not be checked.")
            if image.get("scan_id") != scan_id or image.get("user_id") != user_id:
                return error(400, "bad_request", "An image_id is already used by another scan.")
            existing_ids.add(image["id"])

        existing_count = db.count("images", {"scan_id": f"eq.{scan_id}"})
        new_image_count = sum(item["image_id"] not in existing_ids for item in files)
        if existing_count + new_image_count > MAX_IMAGES_PER_SCAN:
            return error(413, "too_many", "A scan can contain at most 500 images.")

        rows = [
            {
                "id": item["image_id"],
                "scan_id": scan_id,
                "user_id": user_id,
                "width": item["width"],
                "height": item["height"],
                "is_png": item["is_png"],
                "name_hint": item["name_hint"],
                "status": "pending",
            }
            for item in files
        ]
        db.upsert("images", rows, ignore_duplicates=True)

        uploads = []
        for item in files:
            key = f"{user_id}/{scan_id}/{item['image_id']}.jpg"
            url = S3_CLIENT.generate_presigned_url(
                "put_object",
                Params={
                    "Bucket": bucket_name,
                    "Key": key,
                    "ContentType": "image/jpeg",
                },
                ExpiresIn=url_expiry,
                HttpMethod="PUT",
            )
            uploads.append({"image_id": item["image_id"], "url": url})
    except db.SupabaseError:
        logger.exception("Supabase request failed while creating upload URLs for scan %s", scan_id)
        return error(500, "server_error", "The scan could not be prepared.")
    except (BotoCoreError, ClientError):
        logger.exception("S3 presigned URL generation failed for scan %s", scan_id)
        return error(500, "server_error", "Upload URLs could not be created.")

    return response(200, {"expires_in": url_expiry, "uploads": uploads})
