import logging
import os
import re
from collections.abc import Mapping
from typing import Any

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

from shared.auth import AuthServiceError, UnauthorizedError, get_user_id
from shared import supabase_rest as db
from shared.responses import error, is_uuid, response

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

AWS_REGION = os.environ.get("AWS_REGION", "eu-west-2")
S3_CLIENT = boto3.client(
    "s3",
    region_name=AWS_REGION,
    config=Config(retries={"max_attempts": 8, "mode": "adaptive"}),
)


def lambda_handler(event: Mapping[str, Any], context: Any) -> dict[str, Any]:
    del context
    try:
        user_id = get_user_id(event)
    except UnauthorizedError:
        return error(401, "unauthorized", "Sign in to use the image processing service.")
    except AuthServiceError:
        logger.exception("Supabase Auth verification is unavailable.")
        return error(503, "auth_unavailable", "Sign-in verification is temporarily unavailable.")

    path_parameters = event.get("pathParameters")
    scan_id = (
        path_parameters.get("scan_id")
        if isinstance(path_parameters, Mapping)
        else None
    )
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

        bucket_name = os.environ.get("BUCKET_NAME", "")
        if not re.fullmatch(r"[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]", bucket_name):
            logger.error("BUCKET_NAME is missing or invalid.")
            return error(500, "server_error", "Delete service is not configured.")

        deleted_objects = 0
        paginator = S3_CLIENT.get_paginator("list_objects_v2")
        pages = paginator.paginate(
            Bucket=bucket_name,
            Prefix=f"{user_id}/{scan_id}/",
        )
        for page in pages:
            objects = [
                {"Key": item["Key"]}
                for item in page.get("Contents", [])
                if isinstance(item, Mapping) and isinstance(item.get("Key"), str)
            ]
            if not objects:
                continue
            result = S3_CLIENT.delete_objects(
                Bucket=bucket_name,
                Delete={"Objects": objects, "Quiet": True},
            )
            failures = result.get("Errors", [])
            if failures:
                logger.error(
                    "S3 reported %s errors while deleting scan %s",
                    len(failures),
                    scan_id,
                )
                return error(500, "server_error", "Scan files could not be deleted.")
            deleted_objects += len(result.get("Deleted", objects))

        db.delete("scans", {"id": f"eq.{scan_id}", "user_id": f"eq.{user_id}"})
    except db.SupabaseError:
        logger.exception("Supabase request failed while deleting scan %s", scan_id)
        return error(500, "server_error", "Scan data could not be deleted.")
    except (BotoCoreError, ClientError):
        logger.exception("S3 request failed while deleting scan %s", scan_id)
        return error(500, "server_error", "Scan files could not be deleted.")

    return response(
        200,
        {"scan_id": scan_id, "deleted_objects": deleted_objects, "deleted": True},
    )
