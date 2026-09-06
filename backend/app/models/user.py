from datetime import datetime, timezone
from flask_login import UserMixin
from app.extensions import db


class User(db.Model, UserMixin):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    google_id = db.Column(db.String(64), unique=True, nullable=True, index=True)
    username = db.Column(db.String(80), unique=True, nullable=True, index=True)
    password_hash = db.Column(db.String(255), nullable=True)
    name = db.Column(db.String(255), nullable=False)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    profile_picture = db.Column(db.String(1024), nullable=True)

    created_at = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    reports = db.relationship("BusReport", back_populates="user", lazy="dynamic")

    def to_public_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "username": self.username,
            "email": self.email,
            "profile_picture": self.profile_picture,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self):
        return f"<User {self.email}>"
