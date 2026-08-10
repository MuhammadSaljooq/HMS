"""
Create an HMS cashier user from the CLI.

Usage (from the `backend` directory, with dependencies installed):

  python -m app.utils.create_cashier --email cashier@hospital.local --password 'secure-password'
  python -m app.utils.create_cashier   # prompts for email and password
"""

from __future__ import annotations

import argparse
import asyncio
import getpass
import sys

from app.database import AsyncSessionLocal
from app.models.enums import UserRole
from app.schemas.user import UserCreate
from app.services import auth_service


async def _run(email: str, password: str, full_name: str) -> None:
    async with AsyncSessionLocal() as db:
        body = UserCreate(
            email=email,
            full_name=full_name,
            role=UserRole.cashier,
            password=password,
        )
        try:
            user = await auth_service.create_user(db, body, force_role=UserRole.cashier)
            await db.commit()
        except ValueError as exc:
            print(str(exc), file=sys.stderr)
            sys.exit(1)

        print(f"Created cashier user: {user.email} ({user.full_name}) id={user.id}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Create an HMS cashier user.")
    parser.add_argument("--email", help="Cashier email address")
    parser.add_argument(
        "--password",
        help="Password (min 12 characters, must include a letter and a digit); omit to prompt securely",
    )
    parser.add_argument("--full-name", dest="full_name", default="", help="Display name (default: derived from email)")
    args = parser.parse_args()

    email = (args.email or input("Cashier email: ")).strip()
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
    full_name = (args.full_name or local.title() or "Cashier").strip()

    asyncio.run(_run(email, password, full_name))


if __name__ == "__main__":
    main()
