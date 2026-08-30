from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.config import settings
from workers.synthetic_ingestion_worker import SYNTHETIC_NEXT_DELAY_SECONDS, run_synthetic_ingestion_batch


def main() -> None:
    if not settings.synthetic_ingestion_enabled:
        raise SystemExit("Set SYNTHETIC_INGESTION_ENABLED=true before starting the synthetic ingestion loop.")
    async_result = run_synthetic_ingestion_batch.apply_async(queue="drift")
    print(json.dumps({"task_id": async_result.id, "queue": "drift", "next_delay_seconds": SYNTHETIC_NEXT_DELAY_SECONDS}))


if __name__ == "__main__":
    main()
