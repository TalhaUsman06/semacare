import json
import os
from pathlib import Path
from zipfile import ZipFile

import pytest

from scripts.package import FUNCTIONS, package_function
from scripts.run_local import invoke, load_env

USER_ID = "6f1c2a9e-1b7d-4c2e-9a51-0b7a3e5d9c11"


def test_load_env_reads_values_without_overriding_process_environment(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    env_file = tmp_path / ".env"
    env_file.write_text(
        '# local only\nSEMATEST_VALUE="from-file"\nSEMATEST_EXISTING=file-value\n',
        encoding="utf-8",
    )
    monkeypatch.setenv("SEMATEST_EXISTING", "from-process")
    monkeypatch.setenv("SEMATEST_VALUE", "from-process")
    monkeypatch.delenv("SEMATEST_VALUE", raising=False)

    load_env(env_file)

    assert os.environ["SEMATEST_VALUE"] == "from-file"
    assert os.environ["SEMATEST_EXISTING"] == "from-process"


def test_load_env_rejects_malformed_assignment(tmp_path: Path) -> None:
    env_file = tmp_path / ".env"
    env_file.write_text("not an assignment\n", encoding="utf-8")

    with pytest.raises(ValueError, match="line 1"):
        load_env(env_file)


def test_local_runner_invokes_handler_with_json_event(tmp_path: Path) -> None:
    event_file = tmp_path / "event.json"
    event_file.write_text(
        json.dumps(
            {
                "headers": {},
                "body": "{",
                "isBase64Encoded": False,
            }
        ),
        encoding="utf-8",
    )

    result = invoke("get_upload_urls", event_file)

    assert result["statusCode"] == 401
    assert json.loads(result["body"])["error"] == "unauthorized"


def test_local_runner_imports_flat_process_image_handler(
    tmp_path: Path,
) -> None:
    event_file = tmp_path / "event.json"
    event_file.write_text('{"Records":[]}', encoding="utf-8")

    assert invoke("process_image", event_file) is None


def test_local_runner_rejects_unknown_function(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="Unknown function"):
        invoke("other", tmp_path / "event.json")


@pytest.mark.parametrize("function", FUNCTIONS)
def test_lambda_package_has_flat_handler_and_shared_module(
    tmp_path: Path, function: str
) -> None:
    archive_path = package_function(function, tmp_path)

    with ZipFile(archive_path) as archive:
        names = set(archive.namelist())
    assert "handler.py" in names
    assert "shared/__init__.py" in names
    assert "shared/auth.py" in names
    if function == "get_upload_urls":
        assert "get_upload_urls/handler.py" in names
        assert "process_image/handler.py" in names
        assert "process_image/categoriser.py" in names
        assert "get_results/handler.py" in names
        assert "delete_scan/handler.py" in names
    elif function == "process_image":
        assert "categoriser.py" in names
