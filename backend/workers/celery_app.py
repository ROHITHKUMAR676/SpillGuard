from celery import Celery

from core.config import settings

celery_app = Celery("ps26143", broker=settings.redis_url, backend=settings.redis_url)
celery_app.conf.task_routes = {
    "workers.ml_worker.run_segmentation": {"queue": "ml"},
    "workers.drift_worker.run_backward_drift": {"queue": "drift"},
    "workers.drift_worker.run_forward_drift": {"queue": "drift"},
    "workers.drift_worker.run_vessel_analysis": {"queue": "drift"},
}
celery_app.autodiscover_tasks(["workers.ml_worker", "workers.drift_worker"])

import workers.drift_worker  # noqa: E402,F401
import workers.ml_worker  # noqa: E402,F401
