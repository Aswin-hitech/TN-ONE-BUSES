"""add change_requests table"""
from alembic import op
import sqlalchemy as sa

revision = "0003_change_requests"
down_revision = "0002_auth_bus_catalog"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "change_requests",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "bus_id",
            sa.Integer,
            sa.ForeignKey("buses.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "requester_id",
            sa.Integer,
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("payload", sa.Text, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True)),
        sa.Column("updated_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_change_requests_bus_id", "change_requests", ["bus_id"])
    op.create_index("ix_change_requests_requester_id", "change_requests", ["requester_id"])
    op.create_index("ix_change_requests_status", "change_requests", ["status"])


def downgrade():
    op.drop_index("ix_change_requests_status", table_name="change_requests")
    op.drop_index("ix_change_requests_requester_id", table_name="change_requests")
    op.drop_index("ix_change_requests_bus_id", table_name="change_requests")
    op.drop_table("change_requests")
