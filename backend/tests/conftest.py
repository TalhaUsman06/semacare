import sys
import importlib
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1]
PROCESS_IMAGE_DIR = BACKEND_DIR / "process_image"

for directory in (BACKEND_DIR, PROCESS_IMAGE_DIR):
    directory_string = str(directory)
    if directory_string not in sys.path:
        sys.path.insert(0, directory_string)


@pytest.fixture(autouse=True)
def stub_supabase_auth(monkeypatch: pytest.MonkeyPatch) -> None:
    def get_user_id(event: dict[str, object]) -> str:
        headers = event.get("headers")
        if not isinstance(headers, dict):
            raise RuntimeError("Missing test Authorization header")
        token = headers.get("Authorization", headers.get("authorization"))
        if not isinstance(token, str) or not token.startswith("Bearer "):
            from shared.auth import UnauthorizedError

            raise UnauthorizedError("Missing test bearer token")
        user_id = token.removeprefix("Bearer ")
        from shared.auth import UnauthorizedError
        from shared.responses import is_uuid

        if not is_uuid(user_id):
            raise UnauthorizedError("Invalid test bearer token")
        return user_id

    for module_name in (
        "get_upload_urls.handler",
        "get_results.handler",
        "delete_scan.handler",
    ):
        module = importlib.import_module(module_name)
        monkeypatch.setattr(module, "get_user_id", get_user_id)
