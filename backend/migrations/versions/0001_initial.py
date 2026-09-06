"""initial schema: users, buses, stops, routes, route_stops, bus_reports

Revision ID: 0001_initial
Revises:
Create Date: 2026-08-30 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    bus_type_enum = sa.Enum("GOVERNMENT", "PRIVATE", "UNKNOWN", name="bus_type_enum")
    report_status_enum = sa.Enum("ACTIVE", "EXPIRED", "FLAGGED", name="report_status_enum")

    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("google_id", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("profile_picture", sa.String(length=1024), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("google_id", name="uq_users_google_id"),
        sa.UniqueConstraint("email", name="uq_users_email"),
    )
    op.create_index("ix_users_google_id", "users", ["google_id"])
    op.create_index("ix_users_email", "users", ["email"])

    op.create_table(
        "buses",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("bus_name", sa.String(length=255), nullable=False),
        sa.Column("bus_number", sa.String(length=64), nullable=True),
        sa.Column("operator", sa.String(length=255), nullable=True),
        sa.Column("bus_type", bus_type_enum, nullable=False, server_default="UNKNOWN"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("bus_name", "bus_number", "operator", name="uq_bus_identity"),
    )
    op.create_index("ix_buses_bus_name", "buses", ["bus_name"])
    op.create_index("ix_buses_bus_number", "buses", ["bus_number"])

    op.create_table(
        "stops",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("stop_name", sa.String(length=255), nullable=False),
        sa.Column("normalized_name", sa.String(length=255), nullable=False),
        sa.Column("latitude", sa.Float(), nullable=True),
        sa.Column("longitude", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_stops_normalized_name", "stops", ["normalized_name"])

    op.create_table(
        "routes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("bus_id", sa.Integer(), sa.ForeignKey("buses.id", ondelete="CASCADE"), nullable=False),
        sa.Column("route_name", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        "route_stops",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("route_id", sa.Integer(), sa.ForeignKey("routes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("stop_id", sa.Integer(), sa.ForeignKey("stops.id", ondelete="CASCADE"), nullable=False),
        sa.Column("stop_order", sa.Integer(), nullable=False),
        sa.UniqueConstraint("route_id", "stop_order", name="uq_route_stop_order"),
        sa.UniqueConstraint("route_id", "stop_id", name="uq_route_stop_unique"),
    )
    op.create_index("ix_route_stops_route_id", "route_stops", ["route_id"])
    op.create_index("ix_route_stops_stop_id", "route_stops", ["stop_id"])

    op.create_table(
        "bus_reports",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("bus_id", sa.Integer(), sa.ForeignKey("buses.id", ondelete="CASCADE"), nullable=False),
        sa.Column("route_id", sa.Integer(), sa.ForeignKey("routes.id", ondelete="SET NULL"), nullable=True),
        sa.Column("boarding_stop_id", sa.Integer(), sa.ForeignKey("stops.id", ondelete="CASCADE"), nullable=False),
        sa.Column("destination_stop_id", sa.Integer(), sa.ForeignKey("stops.id", ondelete="CASCADE"), nullable=False),
        sa.Column("boarding_time", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reported_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes", sa.String(length=500), nullable=True),
        sa.Column("status", report_status_enum, nullable=False, server_default="ACTIVE"),
        sa.Column("confirm_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("flag_count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_index("ix_bus_reports_user_id", "bus_reports", ["user_id"])
    op.create_index("ix_bus_reports_bus_id", "bus_reports", ["bus_id"])
    op.create_index("ix_bus_reports_route_id", "bus_reports", ["route_id"])
    op.create_index("ix_bus_reports_boarding_stop_id", "bus_reports", ["boarding_stop_id"])
    op.create_index("ix_bus_reports_destination_stop_id", "bus_reports", ["destination_stop_id"])
    op.create_index("ix_bus_reports_boarding_time", "bus_reports", ["boarding_time"])
    op.create_index("ix_bus_reports_reported_at", "bus_reports", ["reported_at"])
    op.create_index("ix_bus_reports_status", "bus_reports", ["status"])


def downgrade():
    op.drop_table("bus_reports")
    op.drop_table("route_stops")
    op.drop_table("routes")
    op.drop_table("stops")
    op.drop_table("buses")
    op.drop_table("users")
    sa.Enum(name="bus_type_enum").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="report_status_enum").drop(op.get_bind(), checkfirst=True)
