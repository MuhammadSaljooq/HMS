from __future__ import annotations

import asyncio
import logging
from uuid import UUID

from app.celery_app import celery_app
from app.database import AsyncSessionLocal
from app.services import transcription_service

logger = logging.getLogger(__name__)


async def _run_transcription(transcription_id: UUID) -> None:
    async with AsyncSessionLocal() as session:
        try:
            await transcription_service.process_transcription(session, transcription_id)
            await session.commit()
        except Exception:
            await session.rollback()
            raise


@celery_app.task(bind=True, name="app.tasks.transcribe_task.process_transcription_async")
def process_transcription_async(self, transcription_id: str) -> dict[str, str]:
    """
    Async pipeline for longer audio. Updates the `transcriptions` row in the database.
    """
    self.update_state(state="STARTED", meta={"transcription_id": transcription_id})
    tid = UUID(transcription_id)
    try:
        asyncio.run(_run_transcription(tid))
    except Exception as exc:  # noqa: BLE001
        logger.exception("Transcription task failed for %s", transcription_id)
        return {"transcription_id": transcription_id, "error": str(exc)}
    return {"transcription_id": transcription_id, "error": ""}
