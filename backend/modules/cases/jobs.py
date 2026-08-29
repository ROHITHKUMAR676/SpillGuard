from uuid import UUID

from sqlalchemy import text
from sqlalchemy.orm import Session


TASKS = {
    "detect": ("workers.ml_worker.run_segmentation", "ml"),
    "drift": ("workers.drift_worker.run_backward_drift", "drift"),
    "vessel_analysis": ("workers.drift_worker.run_vessel_analysis", "drift"),
}


def enqueue_job(db: Session, case_id: UUID, job_type: str, args: list[str]):
    task_name, queue = TASKS[job_type]
    row = db.execute(
        text(
            """
            INSERT INTO jobs (case_id, job_type, status, progress)
            VALUES (:case_id, :job_type, 'queued', 0)
            RETURNING id, job_type, status, progress, result_ref, error
            """
        ),
        {"case_id": str(case_id), "job_type": job_type},
    ).mappings().one()
    db.commit()

    from workers.celery_app import celery_app

    celery_app.send_task(task_name, args=[str(row["id"]), *args], queue=queue)
    return row
