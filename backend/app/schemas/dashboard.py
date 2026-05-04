from __future__ import annotations

from pydantic import BaseModel


class DashboardStats(BaseModel):
    total_patients: int
    patients_registered_today: int
    appointments_today: int
    pending_transcriptions: int
    active_doctors: int
