from __future__ import annotations

import asyncio
from decimal import Decimal

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models import ServiceCatalog

STARTERS = [
    ("CONSULT-OPD", "OPD Consultation", Decimal("500.00")),
    ("LAB-BASIC", "Basic Lab Panel", Decimal("1500.00")),
    ("PROC-MINOR", "Minor Procedure", Decimal("3000.00")),
]


async def _run() -> None:
    async with AsyncSessionLocal() as db:
        for code, name, price in STARTERS:
            exists = (await db.execute(select(ServiceCatalog.id).where(ServiceCatalog.code == code))).scalar_one_or_none()
            if exists is None:
                db.add(ServiceCatalog(code=code, name=name, default_price=price))
        await db.commit()
    print("Seeded service catalog.")


if __name__ == "__main__":
    asyncio.run(_run())
