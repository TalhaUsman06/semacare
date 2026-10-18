import argparse
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

BACKEND_DIR = Path(__file__).resolve().parents[1]
FUNCTIONS = ("get_upload_urls", "process_image", "get_results", "delete_scan")


def package_function(function: str, output_dir: Path | None = None) -> Path:
    if function not in FUNCTIONS:
        raise ValueError(f"Unsupported Lambda function '{function}'.")

    function_dir = BACKEND_DIR / function
    handler = function_dir / "handler.py"
    shared_dir = BACKEND_DIR / "shared"
    if not handler.is_file():
        raise FileNotFoundError(f"Lambda handler not found: {handler}")
    if not shared_dir.is_dir():
        raise FileNotFoundError(f"Shared Lambda package not found: {shared_dir}")

    destination_dir = output_dir or BACKEND_DIR / "dist"
    destination_dir.mkdir(parents=True, exist_ok=True)
    archive_path = destination_dir / f"{function}.zip"
    with ZipFile(archive_path, "w", compression=ZIP_DEFLATED) as archive:
        if function == "get_upload_urls":
            entrypoint = BACKEND_DIR / "entrypoint.py"
            if not entrypoint.is_file():
                raise FileNotFoundError(f"Combined Lambda entrypoint not found: {entrypoint}")
            archive.write(entrypoint, "handler.py")
            for module_name in FUNCTIONS:
                module_dir = BACKEND_DIR / module_name
                sources = sorted(module_dir.glob("*.py"))
                if not any(source.name == "__init__.py" for source in sources):
                    archive.writestr(f"{module_name}/__init__.py", "")
                for source in sources:
                    archive.write(
                        source,
                        f"{module_name}/{source.name}",
                    )
        else:
            for source in sorted(function_dir.glob("*.py")):
                archive.write(source, source.name)
        for source in sorted(shared_dir.rglob("*.py")):
            archive.write(source, (Path("shared") / source.relative_to(shared_dir)).as_posix())
    return archive_path


def main() -> int:
    parser = argparse.ArgumentParser(description="Package SEMACARE Lambda functions.")
    parser.add_argument("functions", nargs="*", choices=FUNCTIONS)
    args = parser.parse_args()
    functions = args.functions or FUNCTIONS
    for function in functions:
        archive_path = package_function(function)
        print(f"Packaged {function} -> {archive_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
