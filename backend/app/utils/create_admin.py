"""
Create the first (or additional) HMS administrator from the CLI.

Usage (from the `backend` directory, with dependencies installed):

  python -m app.utils.create_admin --email admin@hospital.local --password 'secure-password'
  python -m app.utils.create_admin   # prompts for email and password

When users already exist, use --force to add another admin account.
"""

from __future__ import annotations

import argparse
import asyncio
import getpass
import sys

from sqlalchemy import func, select

from app.database import AsyncSessionLocal
from app.models import User
from app.models.enums import UserRole
from app.schemas.user import UserCreate
from app.services import auth_service


async def _run(email: str, password: str, full_name: str, *, force: bool) -> None:
    async with AsyncSessionLocal() as db:
        count = int((await db.execute(select(func.count()).select_from(User))).scalar_one())
        if count > 0 and not force:
            print(
                "Users already exist. Use --force to create another admin, "
                "or create staff via POST /api/auth/register as an existing admin.",
                file=sys.stderr,
            )
            sys.exit(1)

        body = UserCreate(
            email=email,
            full_name=full_name,
            role=UserRole.admin,
            password=password,
        )
        try:
            if count == 0:
                user = await auth_service.create_user(db, body, force_role=UserRole.admin)
            else:
                user = await auth_service.create_user(db, body)
            await db.commit()
        except ValueError as exc:
            print(str(exc), file=sys.stderr)
            sys.exit(1)

        print(f"Created admin user: {user.email} ({user.full_name}) id={user.id}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Create an HMS admin user.")
    parser.add_argument("--email", help="Admin email address")
    parser.add_argument(
        "--password",
        help="Password (min 12 characters, must include a letter and a digit); omit to prompt securely",
    )
    parser.add_argument("--full-name", dest="full_name", default="", help="Display name (default: derived from email)")
    parser.add_argument("--force", action="store_true", help="Create admin even if other users already exist")
    args = parser.parse_args()

    email = (args.email or input("Admin email: ")).strip()
    if not email:
        print("Email is required.", file=sys.stderr)
        sys.exit(1)

    password = args.password
    if not password:
        password = getpass.getpass("Password: ")
        confirm = getpass.getpass("Password (again): ")
        if password != confirm:
            print("Passwords do not match.", file=sys.stderr)
            sys.exit(1)

    if len(password) < 12:
        print("Password must be at least 12 characters.", file=sys.stderr)
        sys.exit(1)

    local = email.split("@", 1)[0].replace(".", " ").replace("_", " ").strip()
    full_name = (args.full_name or local.title() or "Administrator").strip()

    asyncio.run(_run(email, password, full_name, force=args.force))


if __name__ == "__main__":
    main()
