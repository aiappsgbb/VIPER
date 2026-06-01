#!/usr/bin/env python3
"""Hydrate a local dotenv file from the selected Azure Developer CLI environment."""
from __future__ import annotations

import argparse
import re
import subprocess
from pathlib import Path


ENV_ASSIGNMENT_PATTERN = re.compile(
    r"^(?P<prefix>\s*#?\s*)(?P<name>[A-Za-z_][A-Za-z0-9_]*)=(?P<value>.*)$"
)
ACTIVE_ENV_ASSIGNMENT_PATTERN = re.compile(
    r"^(?P<name>[A-Za-z_][A-Za-z0-9_]*)=(?P<value>.*)$"
)


def load_azd_values() -> dict[str, str]:
    try:
        result = subprocess.run(
            ["azd", "env", "get-values"],
            check=True,
            capture_output=True,
            text=True,
        )
    except FileNotFoundError as exc:
        raise SystemExit("Azure Developer CLI (`azd`) was not found on PATH.") from exc
    except subprocess.CalledProcessError as exc:
        details = (exc.stderr or exc.stdout or "").strip()
        message = "Failed to read the selected azd environment with `azd env get-values`."
        if details:
            message = f"{message}\n{details}"
        raise SystemExit(message) from exc

    values: dict[str, str] = {}
    for raw_line in result.stdout.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        match = ACTIVE_ENV_ASSIGNMENT_PATTERN.match(line)
        if match:
            values[match.group("name")] = match.group("value")
    return values


def hydrate_template(template: Path, values: dict[str, str]) -> list[str]:
    try:
        lines = template.read_text(encoding="utf-8").splitlines()
    except FileNotFoundError as exc:
        raise SystemExit(f"Template file '{template}' was not found.") from exc

    rendered: list[str] = []
    seen_names: set[str] = set()
    updated_names: set[str] = set()

    for line in lines:
        match = ENV_ASSIGNMENT_PATTERN.match(line)
        if not match:
            rendered.append(line)
            continue

        name = match.group("name")
        seen_names.add(name)
        if name in values and name not in updated_names:
            rendered.append(f"{name}={values[name]}")
            updated_names.add(name)
        else:
            rendered.append(line)

    extra_names = sorted(name for name in values if name not in seen_names)
    if extra_names:
        if rendered and rendered[-1] != "":
            rendered.append("")
        rendered.append("# --- azd environment values not present in sample.env ---")
        rendered.extend(f"{name}={values[name]}" for name in extra_names)

    return rendered


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--template",
        type=Path,
        default=Path("sample.env"),
        help="Dotenv template to preserve while applying azd values.",
    )
    parser.add_argument(
        "--env-file",
        type=Path,
        default=Path(".env"),
        help="Output dotenv file to write.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    values = load_azd_values()
    rendered = hydrate_template(args.template, values)
    args.env_file.write_text("\n".join(rendered) + "\n", encoding="utf-8")
    print(f"Wrote {args.env_file} from selected azd environment using {args.template}.")


if __name__ == "__main__":
    main()
