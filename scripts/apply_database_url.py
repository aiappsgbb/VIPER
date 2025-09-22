#!/usr/bin/env python3
"""Utility to materialize DATABASE_URL entries from the shared database configuration."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Dict


def load_database_urls(path: Path) -> Dict[str, str]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise SystemExit(f"Database configuration file '{path}' was not found.") from exc
    except json.JSONDecodeError as exc:
        raise SystemExit(f"Database configuration file '{path}' is not valid JSON: {exc}") from exc

    if not isinstance(data, dict):
        raise SystemExit(
            f"Database configuration '{path}' must contain an object mapping environment names to URLs."
        )

    normalized: Dict[str, str] = {}
    for key, value in data.items():
        if not isinstance(value, str) or not value.strip():
            raise SystemExit(
                f"Database configuration '{path}' entry '{key}' must be a non-empty string."
            )
        normalized[key.lower()] = value
    return normalized


def update_env_file(env_file: Path, database_url: str) -> None:
    lines = []
    if env_file.exists():
        for raw_line in env_file.read_text(encoding="utf-8").splitlines():
            if not raw_line.strip() or raw_line.lstrip().startswith("#"):
                lines.append(raw_line)
                continue

            name, sep, value = raw_line.partition("=")
            if not sep:
                lines.append(raw_line)
                continue

            if name.strip() == "DATABASE_URL":
                lines.append(format_env_assignment("DATABASE_URL", database_url))
            else:
                lines.append(raw_line)
    if not any(line.partition("=")[0].strip() == "DATABASE_URL" for line in lines if "=" in line):
        lines.append(format_env_assignment("DATABASE_URL", database_url))

    env_file.write_text("\n".join(lines) + "\n", encoding="utf-8")


def format_env_assignment(name: str, value: str) -> str:
    escaped = value.replace("\\", "\\\\").replace("\"", "\\\"")
    return f"{name}=\"{escaped}\""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--config",
        type=Path,
        default=Path("config/database_urls.json"),
        help="Path to the JSON file containing local and cloud database URLs.",
    )
    parser.add_argument(
        "--env-file",
        type=Path,
        default=Path(".env"),
        help="Path to the dotenv file that should receive the DATABASE_URL entry.",
    )
    parser.add_argument(
        "--target",
        choices=["local", "cloud"],
        default="local",
        help="Which database URL to materialize into the dotenv file.",
    )
    parser.add_argument(
        "--print",
        action="store_true",
        dest="should_print",
        help="Print the resolved DATABASE_URL to stdout without modifying the dotenv file.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    database_urls = load_database_urls(args.config)

    try:
        database_url = database_urls[args.target]
    except KeyError as exc:
        raise SystemExit(
            f"Database configuration '{args.config}' does not define a '{args.target}' connection string."
        ) from exc

    if args.should_print:
        print(database_url)

    update_env_file(args.env_file, database_url)


if __name__ == "__main__":
    main()
