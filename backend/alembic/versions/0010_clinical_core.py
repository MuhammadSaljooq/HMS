"""Eye-care clinical core: eye exams + measurements + dx/procedures + optical Rx

Revision ID: 0010
Revises: 0009
Create Date: 2026-08-23

Additive-only. Creates new enum types and new clinical tables. Nothing existing
is removed, renamed, or altered.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0010"
down_revision: Union[str, Sequence[str], None] = "0009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# create_type=False: upgrade() creates the types explicitly below so the enum
# is not implicitly re-created by each column reference (mirrors 0001/0004).
eye = postgresql.ENUM("od", "os", "ou", name="eye", create_type=False)
acuity_distance = postgresql.ENUM(
    "distance", "near", name="acuity_distance", create_type=False
)
refraction_type = postgresql.ENUM(
    "manifest", "cycloplegic", "autorefraction", name="refraction_type", create_type=False
)
iop_method = postgresql.ENUM(
    "applanation", "noncontact", "tonopen", "other", name="iop_method", create_type=False
)
laterality = postgresql.ENUM(
    "right", "left", "bilateral", name="laterality", create_type=False
)


def upgrade() -> None:
    bind = op.get_bind()
    eye.create(bind, checkfirst=True)
    acuity_distance.create(bind, checkfirst=True)
    refraction_type.create(bind, checkfirst=True)
    iop_method.create(bind, checkfirst=True)
    laterality.create(bind, checkfirst=True)

    # --- eye_exams ---
    op.create_table(
        "eye_exams",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("medical_record_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("medical_records.id", ondelete="CASCADE"), nullable=False),
        sa.Column("patient_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("patients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("clinic_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("clinics.id", ondelete="SET NULL"), nullable=True),
        sa.Column("exam_date", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("chief_complaint", sa.String(length=4000), nullable=True),
        sa.Column("history", sa.String(length=8000), nullable=True),
        sa.Column("assessment", sa.String(length=8000), nullable=True),
        sa.Column("plan", sa.String(length=8000), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=True),
        sa.Column("updated_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=True),
    )
    op.create_index("ix_eye_exams_medical_record_id", "eye_exams", ["medical_record_id"])
    op.create_index("ix_eye_exams_patient_id", "eye_exams", ["patient_id"])
    op.create_index("ix_eye_exams_clinic_id", "eye_exams", ["clinic_id"])

    # --- visual_acuities ---
    op.create_table(
        "visual_acuities",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("eye_exam_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("eye_exams.id", ondelete="CASCADE"), nullable=False),
        sa.Column("eye", eye, nullable=False),
        sa.Column("distance", acuity_distance, nullable=False),
        sa.Column("corrected", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("value", sa.String(length=16), nullable=False),
        sa.Column("pinhole", sa.String(length=16), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_visual_acuities_eye_exam_id", "visual_acuities", ["eye_exam_id"])

    # --- refractions ---
    op.create_table(
        "refractions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("eye_exam_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("eye_exams.id", ondelete="CASCADE"), nullable=False),
        sa.Column("eye", eye, nullable=False),
        sa.Column("type", refraction_type, nullable=False),
        sa.Column("sphere", sa.Numeric(5, 2), nullable=True),
        sa.Column("cylinder", sa.Numeric(5, 2), nullable=True),
        sa.Column("axis", sa.Integer(), nullable=True),
        sa.Column("add_power", sa.Numeric(4, 2), nullable=True),
        sa.Column("prism", sa.String(length=32), nullable=True),
        sa.Column("pd", sa.Numeric(4, 1), nullable=True),
        sa.Column("resulting_va", sa.String(length=16), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_refractions_eye_exam_id", "refractions", ["eye_exam_id"])

    # --- iop_measurements ---
    op.create_table(
        "iop_measurements",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("eye_exam_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("eye_exams.id", ondelete="CASCADE"), nullable=False),
        sa.Column("eye", eye, nullable=False),
        sa.Column("mmhg", sa.Numeric(4, 1), nullable=False),
        sa.Column("method", iop_method, nullable=False),
        sa.Column("measured_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_iop_measurements_eye_exam_id", "iop_measurements", ["eye_exam_id"])

    # --- keratometries ---
    op.create_table(
        "keratometries",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("eye_exam_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("eye_exams.id", ondelete="CASCADE"), nullable=False),
        sa.Column("eye", eye, nullable=False),
        sa.Column("k1", sa.Numeric(5, 2), nullable=True),
        sa.Column("k2", sa.Numeric(5, 2), nullable=True),
        sa.Column("axis", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_keratometries_eye_exam_id", "keratometries", ["eye_exam_id"])

    # --- diagnoses ---
    op.create_table(
        "diagnoses",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("medical_record_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("medical_records.id", ondelete="CASCADE"), nullable=False),
        sa.Column("eye_exam_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("eye_exams.id", ondelete="SET NULL"), nullable=True),
        sa.Column("patient_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("patients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("clinic_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("clinics.id", ondelete="SET NULL"), nullable=True),
        sa.Column("icd10_code", sa.String(length=16), nullable=False),
        sa.Column("description", sa.String(length=255), nullable=False),
        sa.Column("laterality", laterality, nullable=True),
        sa.Column("is_primary", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=True),
        sa.Column("updated_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=True),
    )
    op.create_index("ix_diagnoses_medical_record_id", "diagnoses", ["medical_record_id"])
    op.create_index("ix_diagnoses_eye_exam_id", "diagnoses", ["eye_exam_id"])
    op.create_index("ix_diagnoses_patient_id", "diagnoses", ["patient_id"])
    op.create_index("ix_diagnoses_clinic_id", "diagnoses", ["clinic_id"])

    # --- procedures ---
    op.create_table(
        "procedures",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("medical_record_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("medical_records.id", ondelete="CASCADE"), nullable=False),
        sa.Column("eye_exam_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("eye_exams.id", ondelete="SET NULL"), nullable=True),
        sa.Column("patient_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("patients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("clinic_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("clinics.id", ondelete="SET NULL"), nullable=True),
        sa.Column("cpt_code", sa.String(length=16), nullable=False),
        sa.Column("description", sa.String(length=255), nullable=False),
        sa.Column("eye", eye, nullable=True),
        sa.Column("quantity", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=True),
        sa.Column("updated_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=True),
    )
    op.create_index("ix_procedures_medical_record_id", "procedures", ["medical_record_id"])
    op.create_index("ix_procedures_eye_exam_id", "procedures", ["eye_exam_id"])
    op.create_index("ix_procedures_patient_id", "procedures", ["patient_id"])
    op.create_index("ix_procedures_clinic_id", "procedures", ["clinic_id"])

    # --- spectacle_rx ---
    op.create_table(
        "spectacle_rx",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("patient_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("patients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("medical_record_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("medical_records.id", ondelete="SET NULL"), nullable=True),
        sa.Column("eye_exam_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("eye_exams.id", ondelete="SET NULL"), nullable=True),
        sa.Column("clinic_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("clinics.id", ondelete="SET NULL"), nullable=True),
        sa.Column("od_sphere", sa.Numeric(5, 2), nullable=True),
        sa.Column("od_cylinder", sa.Numeric(5, 2), nullable=True),
        sa.Column("od_axis", sa.Integer(), nullable=True),
        sa.Column("od_add", sa.Numeric(4, 2), nullable=True),
        sa.Column("od_prism", sa.String(length=32), nullable=True),
        sa.Column("os_sphere", sa.Numeric(5, 2), nullable=True),
        sa.Column("os_cylinder", sa.Numeric(5, 2), nullable=True),
        sa.Column("os_axis", sa.Integer(), nullable=True),
        sa.Column("os_add", sa.Numeric(4, 2), nullable=True),
        sa.Column("os_prism", sa.String(length=32), nullable=True),
        sa.Column("pd", sa.Numeric(4, 1), nullable=True),
        sa.Column("lens_type", sa.String(length=64), nullable=True),
        sa.Column("notes", sa.String(length=4000), nullable=True),
        sa.Column("prescribed_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("prescribed_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=True),
        sa.Column("updated_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=True),
    )
    op.create_index("ix_spectacle_rx_patient_id", "spectacle_rx", ["patient_id"])
    op.create_index("ix_spectacle_rx_medical_record_id", "spectacle_rx", ["medical_record_id"])
    op.create_index("ix_spectacle_rx_eye_exam_id", "spectacle_rx", ["eye_exam_id"])
    op.create_index("ix_spectacle_rx_clinic_id", "spectacle_rx", ["clinic_id"])

    # --- contact_lens_rx ---
    op.create_table(
        "contact_lens_rx",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("patient_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("patients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("medical_record_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("medical_records.id", ondelete="SET NULL"), nullable=True),
        sa.Column("eye_exam_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("eye_exams.id", ondelete="SET NULL"), nullable=True),
        sa.Column("clinic_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("clinics.id", ondelete="SET NULL"), nullable=True),
        sa.Column("od_brand", sa.String(length=64), nullable=True),
        sa.Column("od_base_curve", sa.Numeric(4, 2), nullable=True),
        sa.Column("od_diameter", sa.Numeric(4, 2), nullable=True),
        sa.Column("od_power", sa.Numeric(5, 2), nullable=True),
        sa.Column("od_cylinder", sa.Numeric(5, 2), nullable=True),
        sa.Column("od_axis", sa.Integer(), nullable=True),
        sa.Column("od_add", sa.Numeric(4, 2), nullable=True),
        sa.Column("os_brand", sa.String(length=64), nullable=True),
        sa.Column("os_base_curve", sa.Numeric(4, 2), nullable=True),
        sa.Column("os_diameter", sa.Numeric(4, 2), nullable=True),
        sa.Column("os_power", sa.Numeric(5, 2), nullable=True),
        sa.Column("os_cylinder", sa.Numeric(5, 2), nullable=True),
        sa.Column("os_axis", sa.Integer(), nullable=True),
        sa.Column("os_add", sa.Numeric(4, 2), nullable=True),
        sa.Column("modality", sa.String(length=32), nullable=True),
        sa.Column("notes", sa.String(length=4000), nullable=True),
        sa.Column("prescribed_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("prescribed_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=True),
        sa.Column("updated_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=True),
    )
    op.create_index("ix_contact_lens_rx_patient_id", "contact_lens_rx", ["patient_id"])
    op.create_index("ix_contact_lens_rx_medical_record_id", "contact_lens_rx", ["medical_record_id"])
    op.create_index("ix_contact_lens_rx_eye_exam_id", "contact_lens_rx", ["eye_exam_id"])
    op.create_index("ix_contact_lens_rx_clinic_id", "contact_lens_rx", ["clinic_id"])


def downgrade() -> None:
    op.drop_table("contact_lens_rx")
    op.drop_table("spectacle_rx")
    op.drop_table("procedures")
    op.drop_table("diagnoses")
    op.drop_table("keratometries")
    op.drop_table("iop_measurements")
    op.drop_table("refractions")
    op.drop_table("visual_acuities")
    op.drop_table("eye_exams")

    bind = op.get_bind()
    laterality.drop(bind, checkfirst=True)
    iop_method.drop(bind, checkfirst=True)
    refraction_type.drop(bind, checkfirst=True)
    acuity_distance.drop(bind, checkfirst=True)
    eye.drop(bind, checkfirst=True)
