"""Configuration comes from the environment only.

There are deliberately no built-in fallback values: a missing variable must fail loudly, naming the
variable, instead of silently using a default. Values are read lazily (when first used) so importing a
module never fails just because an unrelated feature is not configured.
"""
import os
from typing import Optional


def require_env(name: str) -> str:
    value = os.environ.get(name)
    if value is None or value.strip() == "":
        raise RuntimeError(f"Environment variable {name} belum diisi. Isi di ai-service/.env (lihat .env.example).")
    return value


def require_env_int(name: str) -> int:
    raw = require_env(name)
    try:
        return int(raw)
    except ValueError:
        raise RuntimeError(f"Environment variable {name} harus berupa bilangan bulat, bukan '{raw}'.")


def require_env_float(name: str) -> float:
    raw = require_env(name)
    try:
        return float(raw)
    except ValueError:
        raise RuntimeError(f"Environment variable {name} harus berupa angka, bukan '{raw}'.")


def optional_env(name: str) -> Optional[str]:
    """Optional setting with no invented value: returns None when unset or empty."""
    value = os.environ.get(name)
    return value if value is not None and value.strip() != "" else None


def optional_env_int(name: str) -> Optional[int]:
    raw = optional_env(name)
    return int(raw) if raw is not None else None


def optional_env_float(name: str) -> Optional[float]:
    raw = optional_env(name)
    return float(raw) if raw is not None else None
