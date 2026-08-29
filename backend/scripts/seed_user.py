from sqlalchemy import text

from core.db import SessionLocal
from core.security import hash_password


def main() -> None:
    db = SessionLocal()
    try:
        db.execute(
            text(
                """
                INSERT INTO users (username, password_hash, role)
                VALUES ('analyst1', :password_hash, 'analyst')
                ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash
                """
            ),
            {"password_hash": hash_password("changeme")},
        )
        db.commit()
        print("Seeded analyst1 / changeme")
    finally:
        db.close()


if __name__ == "__main__":
    main()
