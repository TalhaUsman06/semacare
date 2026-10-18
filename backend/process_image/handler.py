import json
import logging
import os
import re
import time
from collections.abc import Mapping
from typing import Any
from urllib.parse import unquote_plus

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

from shared import supabase_rest as db
if __package__:
    from .categoriser import categorise, needs_text
else:
    from categoriser import categorise, needs_text

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

AWS_REGION = os.environ.get("AWS_REGION", "eu-west-2")
AWS_CLIENT_CONFIG = Config(retries={"max_attempts": 8, "mode": "adaptive"})
S3_CLIENT = boto3.client("s3", region_name=AWS_REGION, config=AWS_CLIENT_CONFIG)
REKOGNITION_CLIENT = boto3.client(
    "rekognition", region_name=AWS_REGION, config=AWS_CLIENT_CONFIG
)
TEXTRACT_CLIENT = boto3.client(
    "textract", region_name=AWS_REGION, config=AWS_CLIENT_CONFIG
)

UUID_PATTERN = r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
S3_KEY_PATTERN = re.compile(
    rf"^(?P<user_id>{UUID_PATTERN})/(?P<scan_id>{UUID_PATTERN})/"
    rf"(?P<image_id>{UUID_PATTERN})\.jpg$"
)


def _delete_object(bucket: str, key: str) -> None:
    try:
        S3_CLIENT.delete_object(Bucket=bucket, Key=key)
    except (BotoCoreError, ClientError):
        logger.exception("Could not delete processed thumbnail from S3")


def _process_record(record: Mapping[str, Any]) -> None:
    bucket = record["s3"]["bucket"]["name"]
    key = unquote_plus(record["s3"]["object"]["key"])
    match = S3_KEY_PATTERN.fullmatch(key)

    if match is None:
        logger.warning("Ignoring S3 object with an invalid SEMACARE key")
        _delete_object(bucket, key)
        return

    user_id = match.group("user_id")
    scan_id = match.group("scan_id")
    image_id = match.group("image_id")
    start_time = time.perf_counter()
    textract_used = False

    try:
        rows = db.select(
            f"images?id=eq.{image_id}"
            "&select=id,scan_id,user_id,width,height,is_png,name_hint"
        )
        if not isinstance(rows, list) or not rows:
            logger.warning("No image row found for uploaded thumbnail")
            return

        image = rows[0]
        if (
            image.get("id") != image_id
            or image.get("scan_id") != scan_id
            or image.get("user_id") != user_id
        ):
            logger.error("S3 object identifiers do not match the image row")
            return

        label_response = REKOGNITION_CLIENT.detect_labels(
            Image={"S3Object": {"Bucket": bucket, "Name": key}},
            MaxLabels=25,
            MinConfidence=60,
        )
        response_labels = label_response.get("Labels", [])
        labels = (
            [
                label
                for label in response_labels
                if isinstance(label, Mapping)
                and isinstance(label.get("Name"), str)
                and isinstance(label.get("Confidence"), (int, float))
                and not isinstance(label.get("Confidence"), bool)
                and 60 <= label["Confidence"] <= 100
            ][:25]
            if isinstance(response_labels, list)
            else []
        )
        categoriser_labels = [
            {"name": label["Name"], "confidence": label["Confidence"]}
            for label in labels
        ]
        ocr_text = ""
        if needs_text(categoriser_labels):
            textract_used = True
            text_response = TEXTRACT_CLIENT.detect_document_text(
                Document={"S3Object": {"Bucket": bucket, "Name": key}}
            )
            ocr_text = "\n".join(
                block["Text"]
                for block in text_response.get("Blocks", [])
                if block.get("BlockType") == "LINE" and isinstance(block.get("Text"), str)
            )

        category, confidence = categorise(
            categoriser_labels,
            ocr_text,
            image["width"],
            image["height"],
            image["is_png"],
            image["name_hint"],
        )
        ocr_summary = re.sub(r"\s+", " ", ocr_text).strip()[:200] or None
        processing_ms = round((time.perf_counter() - start_time) * 1000)

        db.update(
            "images",
            {
                "id": f"eq.{image_id}",
                "scan_id": f"eq.{scan_id}",
                "user_id": f"eq.{user_id}",
            },
            {
                "status": "done",
                "category": category,
                "labels": [
                    label["Name"]
                    for label in labels
                    if isinstance(label, Mapping) and isinstance(label.get("Name"), str)
                ],
                "ocr_summary": ocr_summary,
                "confidence": confidence,
                "textract_used": textract_used,
                "processing_ms": processing_ms,
                "error": None,
            },
        )
        logger.info(
            json.dumps(
                {
                    "event": "image_processed",
                    "scan_id": scan_id,
                    "image_id": image_id,
                    "category": category,
                    "confidence": confidence,
                    "textract_used": textract_used,
                    "processing_ms": processing_ms,
                    "labels": [
                        label["Name"]
                        for label in labels
                        if isinstance(label, Mapping)
                        and isinstance(label.get("Name"), str)
                    ],
                },
                separators=(",", ":"),
            )
        )
    except Exception as exc:
        processing_ms = round((time.perf_counter() - start_time) * 1000)
        logger.exception(
            "Image processing failed for scan %s image %s", scan_id, image_id
        )
        try:
            db.update(
                "images",
                {
                    "id": f"eq.{image_id}",
                    "scan_id": f"eq.{scan_id}",
                    "user_id": f"eq.{user_id}",
                },
                {
                    "status": "error",
                    "error": str(exc)[:200],
                    "processing_ms": processing_ms,
                },
            )
        except db.SupabaseError:
            logger.exception(
                "Could not persist processing failure for scan %s image %s",
                scan_id,
                image_id,
            )
    finally:
        _delete_object(bucket, key)


def lambda_handler(event: Mapping[str, Any], context: Any) -> None:
    del context
    records = event.get("Records")
    if not isinstance(records, list):
        logger.error("S3 event has no Records array")
        return

    for record in records:
        if not isinstance(record, Mapping):
            logger.error("Ignoring malformed S3 event record")
            continue
        try:
            _process_record(record)
        except (KeyError, TypeError, ValueError):
            logger.exception("Ignoring malformed S3 event record")
