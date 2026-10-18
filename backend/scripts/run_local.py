import argparse
import importlib.util
import json
import os
import sys
from pathlib import Path
from typing import Any

BACKEND_DIR = Path(__file__).resolve().parents[1]
FUNCTIONS = {"get_upload_urls", "process_image", "get_results", "delete_scan"}


def load_env(path: Path) -> None:
    if not path.exists():
        return
    for line_number, raw_line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        name, separator, value = line.partition("=")
        name = name.strip()
        if not separator or not name:
            raise ValueError(f"Invalid environment assignment on line {line_number}.")
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]
        os.environ.setdefault(name, value)


def invoke(function: str, event_path: Path) -> Any:
    if function not in FUNCTIONS:
        raise ValueError(f"Unknown function '{function}'.")
    handler_path = BACKEND_DIR / function / "handler.py"
    if not handler_path.is_file():
        raise FileNotFoundError(f"Lambda handler not found: {handler_path}")

    for directory in (BACKEND_DIR, handler_path.parent):
        directory_string = str(directory)
        if directory_string not in sys.path:
            sys.path.insert(0, directory_string)

    spec = importlib.util.spec_from_file_location(
        f"semacare_{function}_handler", handler_path
    )
    if spec is None or spec.loader is None:
        raise ImportError(f"Could not load Lambda handler: {handler_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    event = json.loads(event_path.read_text(encoding="utf-8"))
    return module.lambda_handler(event, None)


def main() -> int:
    parser = argparse.ArgumentParser(description="Invoke a SEMACARE Lambda locally.")
    parser.add_argument("function", choices=sorted(FUNCTIONS))
    parser.add_argument("event", type=Path)
    args = parser.parse_args()

    load_env(BACKEND_DIR / ".env")
    result = invoke(args.function, args.event)
    print(json.dumps(result, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
