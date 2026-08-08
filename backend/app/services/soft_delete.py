from __future__ import annotations

from sqlalchemy.sql.elements import ColumnElement


def not_deleted(model) -> ColumnElement[bool]:
    """SQL predicate selecting rows that have not been soft-deleted.

    Usage: ``select(Model).where(not_deleted(Model))``.
    """
    return model.deleted_at.is_(None)
