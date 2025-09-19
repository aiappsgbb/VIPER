"""Project-level site customization for development convenience.

This module runs automatically whenever Python starts (if the project
root is on ``sys.path``) and ensures that the local ``src`` directory is
preferred over any globally installed ``cobrapy`` package.  It also loads
our standard ``.env`` files early so configuration is available to
modules that read from ``os.environ`` during import time.
"""

from __future__ import annotations

import sys
from pathlib import Path

try:  # python-dotenv is an optional dependency for certain environments
    from dotenv import load_dotenv
except Exception:  # pragma: no cover - missing dependency at runtime
    load_dotenv = None  # type: ignore[assignment]


PROJECT_ROOT = Path(__file__).resolve().parent
SRC_DIR = PROJECT_ROOT / "src"
PACKAGE_ENV = SRC_DIR / "cobrapy" / ".env"
ROOT_ENV = PROJECT_ROOT / ".env"


def _ensure_local_src() -> None:
    """Place the local ``src`` directory at the front of ``sys.path``."""

    if not SRC_DIR.is_dir():
        return

    src_str = str(SRC_DIR)
    try:
        existing_index = sys.path.index(src_str)
    except ValueError:
        sys.path.insert(0, src_str)
    else:
        if existing_index != 0:
            sys.path.insert(0, sys.path.pop(existing_index))


def _load_env_files() -> None:
    """Load default environment files if python-dotenv is available."""

    if load_dotenv is None:
        return

    for env_path in (ROOT_ENV, PACKAGE_ENV):
        if env_path.is_file():
            load_dotenv(env_path, override=False)


_ensure_local_src()
_load_env_files()
