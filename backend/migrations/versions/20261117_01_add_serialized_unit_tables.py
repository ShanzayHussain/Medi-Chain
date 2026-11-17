"""Add tables for serialized medicine units and unit movement.

Revision ID: 20261117_01
Revises:
Create Date: 2026-11-17
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "20261117_01"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "unit_transfer_operations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "operation_uid", postgresql.UUID(as_uuid=True), nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("sender_id", sa.Integer(), nullable=False),
        sa.Column("recipient_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=16), server_default="pending", nullable=False),
        sa.Column("location", sa.String(length=100), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "status IN ('pending', 'received', 'rejected', 'cancelled')",
            name="ck_unit_transfer_operations_status",
        ),
        sa.ForeignKeyConstraint(["recipient_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["sender_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("operation_uid", name="uq_unit_transfer_operations_operation_uid"),
    )

    op.create_table(
        "medicine_units",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("batch_id", sa.Integer(), nullable=False),
        sa.Column(
            "unit_uid", postgresql.UUID(as_uuid=True), nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("serial_number", sa.String(length=80), nullable=False),
        sa.Column("current_owner_id", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=24), server_default="available", nullable=False),
        sa.Column("pending_transfer_id", sa.Integer(), nullable=True),
        sa.Column("reserved_order_id", sa.Integer(), nullable=True),
        sa.Column("reserved_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(
            "status IN ('available', 'pending_transfer', 'reserved', 'sold', 'quarantined')",
            name="ck_medicine_units_status",
        ),
        sa.CheckConstraint(
            "reserved_order_id IS NULL OR pending_transfer_id IS NULL",
            name="ck_medicine_units_single_pending_operation",
        ),
        sa.ForeignKeyConstraint(["batch_id"], ["medicine_batches.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["current_owner_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["reserved_order_id"], ["orders.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["pending_transfer_id"], ["unit_transfer_operations.id"], ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("serial_number", name="uq_medicine_units_serial_number"),
        sa.UniqueConstraint("unit_uid", name="uq_medicine_units_unit_uid"),
    )
    op.create_index("ix_medicine_units_batch_id", "medicine_units", ["batch_id"])
    op.create_index(
        "ix_medicine_units_owner_status", "medicine_units", ["current_owner_id", "status"],
    )
    op.create_index("ix_medicine_units_pending_transfer_id", "medicine_units", ["pending_transfer_id"])

    op.create_table(
        "unit_movement_events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("unit_id", sa.Integer(), nullable=False),
        sa.Column("transfer_operation_id", sa.Integer(), nullable=True),
        sa.Column("order_id", sa.Integer(), nullable=True),
        sa.Column("event_type", sa.String(length=24), nullable=False),
        sa.Column("actor_id", sa.Integer(), nullable=True),
        sa.Column("from_owner_id", sa.Integer(), nullable=True),
        sa.Column("to_owner_id", sa.Integer(), nullable=True),
        sa.Column("location", sa.String(length=100), nullable=True),
        sa.Column("occurred_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(
            "event_type IN ('created', 'transfer_requested', 'received', 'sold', 'scanned', "
            "'flagged', 'quarantined', 'released')",
            name="ck_unit_movement_events_event_type",
        ),
        sa.ForeignKeyConstraint(["actor_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["from_owner_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["to_owner_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["transfer_operation_id"], ["unit_transfer_operations.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["unit_id"], ["medicine_units.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_unit_movement_events_unit_id_id", "unit_movement_events", ["unit_id", "id"])
    op.create_index(
        "ix_unit_movement_events_transfer_operation_id",
        "unit_movement_events", ["transfer_operation_id"],
    )
    op.create_index("ix_unit_movement_events_order_id", "unit_movement_events", ["order_id"])


def downgrade() -> None:
    op.drop_index("ix_unit_movement_events_order_id", table_name="unit_movement_events")
    op.drop_index("ix_unit_movement_events_transfer_operation_id", table_name="unit_movement_events")
    op.drop_index("ix_unit_movement_events_unit_id_id", table_name="unit_movement_events")
    op.drop_table("unit_movement_events")
    op.drop_index("ix_medicine_units_pending_transfer_id", table_name="medicine_units")
    op.drop_index("ix_medicine_units_owner_status", table_name="medicine_units")
    op.drop_index("ix_medicine_units_batch_id", table_name="medicine_units")
    op.drop_table("medicine_units")
    op.drop_table("unit_transfer_operations")
