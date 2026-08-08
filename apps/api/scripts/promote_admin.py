"""Promote a user to admin role by username.

Run inside the api container:
    docker compose exec api python -m scripts.promote_admin sunbright
"""
import sys

from sqlalchemy import create_engine, text

from app.core.config import settings


def main(username: str) -> None:
    engine = create_engine(settings.DATABASE_URL_SYNC)
    with engine.begin() as conn:
        result = conn.execute(
            text("UPDATE users SET role='admin' WHERE username=:u RETURNING id, username, role"),
            {"u": username},
        ).fetchone()
    if not result:
        print(f"No user with username={username!r}")
        sys.exit(1)
    print(f"Promoted: id={result.id} username={result.username} role={result.role}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python -m scripts.promote_admin <username>")
        sys.exit(2)
    main(sys.argv[1])
