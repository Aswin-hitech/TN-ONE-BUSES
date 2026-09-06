"""add password auth and bus catalog details"""
from alembic import op
import sqlalchemy as sa

revision = "0002_auth_bus_catalog"
down_revision = "0001_initial"
branch_labels = None
depends_on = None

def upgrade():
    with op.batch_alter_table("users") as batch:
        batch.alter_column("google_id", nullable=True)
        batch.add_column(sa.Column("username", sa.String(80), nullable=True))
        batch.add_column(sa.Column("password_hash", sa.String(255), nullable=True))
        batch.create_index("ix_users_username", ["username"], unique=True)
    op.create_table("bus_timings", sa.Column("id", sa.Integer, primary_key=True), sa.Column("bus_id", sa.Integer, sa.ForeignKey("buses.id", ondelete="CASCADE"), nullable=False), sa.Column("timing", sa.String(20), nullable=False), sa.Column("sort_order", sa.Integer, nullable=False, server_default="0"), sa.Column("created_at", sa.DateTime(timezone=True)))
    op.create_index("ix_bus_timings_bus_id", "bus_timings", ["bus_id"])
    op.create_table("bus_photos", sa.Column("id", sa.Integer, primary_key=True), sa.Column("bus_id", sa.Integer, sa.ForeignKey("buses.id", ondelete="CASCADE"), nullable=False), sa.Column("url", sa.String(2048), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True)))
    op.create_index("ix_bus_photos_bus_id", "bus_photos", ["bus_id"])

def downgrade():
    op.drop_table("bus_photos"); op.drop_table("bus_timings")
    with op.batch_alter_table("users") as batch:
        batch.drop_index("ix_users_username"); batch.drop_column("password_hash"); batch.drop_column("username")
