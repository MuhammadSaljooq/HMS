from types import SimpleNamespace
from uuid import uuid4

from app.models.enums import UserRole
from app.services.authorization_service import (
    can_manage_appointment,
    can_record_vitals,
    can_view_doctor_schedule,
    requires_patient_filter_for_records,
)


def test_can_manage_appointment_for_admin_and_receptionist() -> None:
    appointment = SimpleNamespace(doctor_id=uuid4())
    admin = SimpleNamespace(role=UserRole.admin, id=uuid4())
    receptionist = SimpleNamespace(role=UserRole.receptionist, id=uuid4())
    assert can_manage_appointment(admin, appointment) is True
    assert can_manage_appointment(receptionist, appointment) is True


def test_doctor_can_manage_only_own_appointment() -> None:
    doctor_id = uuid4()
    own_appointment = SimpleNamespace(doctor_id=doctor_id)
    other_appointment = SimpleNamespace(doctor_id=uuid4())
    doctor = SimpleNamespace(role=UserRole.doctor, id=doctor_id)
    assert can_manage_appointment(doctor, own_appointment) is True
    assert can_manage_appointment(doctor, other_appointment) is False


def test_can_view_doctor_schedule_rules() -> None:
    doctor_id = uuid4()
    admin = SimpleNamespace(role=UserRole.admin, id=uuid4())
    doctor = SimpleNamespace(role=UserRole.doctor, id=doctor_id)
    other_doctor = SimpleNamespace(role=UserRole.doctor, id=uuid4())
    assert can_view_doctor_schedule(admin, doctor_id) is True
    assert can_view_doctor_schedule(doctor, doctor_id) is True
    assert can_view_doctor_schedule(other_doctor, doctor_id) is False


def test_vitals_and_record_filter_policies() -> None:
    nurse = SimpleNamespace(role=UserRole.nurse)
    receptionist = SimpleNamespace(role=UserRole.receptionist)
    doctor = SimpleNamespace(role=UserRole.doctor)
    assert can_record_vitals(nurse) is True
    assert requires_patient_filter_for_records(nurse) is True
    assert requires_patient_filter_for_records(receptionist) is True
    assert requires_patient_filter_for_records(doctor) is False
