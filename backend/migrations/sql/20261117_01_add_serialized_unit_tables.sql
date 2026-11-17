BEGIN;

CREATE TABLE alembic_version (
    version_num VARCHAR(32) NOT NULL, 
    CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num)
);

-- Running upgrade  -> 20261117_01

CREATE TABLE unit_transfer_operations (
    id SERIAL NOT NULL, 
    operation_uid UUID DEFAULT gen_random_uuid() NOT NULL, 
    sender_id INTEGER NOT NULL, 
    recipient_id INTEGER NOT NULL, 
    status VARCHAR(16) DEFAULT 'pending' NOT NULL, 
    location VARCHAR(100) NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    received_at TIMESTAMP WITH TIME ZONE, 
    PRIMARY KEY (id), 
    CONSTRAINT ck_unit_transfer_operations_status CHECK (status IN ('pending', 'received', 'rejected', 'cancelled')), 
    FOREIGN KEY(recipient_id) REFERENCES users (id) ON DELETE RESTRICT, 
    FOREIGN KEY(sender_id) REFERENCES users (id) ON DELETE RESTRICT, 
    CONSTRAINT uq_unit_transfer_operations_operation_uid UNIQUE (operation_uid)
);

CREATE TABLE medicine_units (
    id SERIAL NOT NULL, 
    batch_id INTEGER NOT NULL, 
    unit_uid UUID DEFAULT gen_random_uuid() NOT NULL, 
    serial_number VARCHAR(80) NOT NULL, 
    current_owner_id INTEGER, 
    status VARCHAR(24) DEFAULT 'available' NOT NULL, 
    pending_transfer_id INTEGER, 
    reserved_order_id INTEGER, 
    reserved_until TIMESTAMP WITH TIME ZONE, 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    PRIMARY KEY (id), 
    CONSTRAINT ck_medicine_units_status CHECK (status IN ('available', 'pending_transfer', 'reserved', 'sold', 'quarantined')), 
    CONSTRAINT ck_medicine_units_single_pending_operation CHECK (reserved_order_id IS NULL OR pending_transfer_id IS NULL), 
    FOREIGN KEY(batch_id) REFERENCES medicine_batches (id) ON DELETE RESTRICT, 
    FOREIGN KEY(current_owner_id) REFERENCES users (id) ON DELETE RESTRICT, 
    FOREIGN KEY(reserved_order_id) REFERENCES orders (id) ON DELETE RESTRICT, 
    FOREIGN KEY(pending_transfer_id) REFERENCES unit_transfer_operations (id) ON DELETE RESTRICT, 
    CONSTRAINT uq_medicine_units_serial_number UNIQUE (serial_number), 
    CONSTRAINT uq_medicine_units_unit_uid UNIQUE (unit_uid)
);

CREATE INDEX ix_medicine_units_batch_id ON medicine_units (batch_id);

CREATE INDEX ix_medicine_units_owner_status ON medicine_units (current_owner_id, status);

CREATE INDEX ix_medicine_units_pending_transfer_id ON medicine_units (pending_transfer_id);

CREATE TABLE unit_movement_events (
    id SERIAL NOT NULL, 
    unit_id INTEGER NOT NULL, 
    transfer_operation_id INTEGER, 
    order_id INTEGER, 
    event_type VARCHAR(24) NOT NULL, 
    actor_id INTEGER, 
    from_owner_id INTEGER, 
    to_owner_id INTEGER, 
    location VARCHAR(100), 
    occurred_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    PRIMARY KEY (id), 
    CONSTRAINT ck_unit_movement_events_event_type CHECK (event_type IN ('created', 'transfer_requested', 'received', 'sold', 'scanned', 'flagged', 'quarantined', 'released')), 
    FOREIGN KEY(actor_id) REFERENCES users (id) ON DELETE RESTRICT, 
    FOREIGN KEY(from_owner_id) REFERENCES users (id) ON DELETE RESTRICT, 
    FOREIGN KEY(order_id) REFERENCES orders (id) ON DELETE RESTRICT, 
    FOREIGN KEY(to_owner_id) REFERENCES users (id) ON DELETE RESTRICT, 
    FOREIGN KEY(transfer_operation_id) REFERENCES unit_transfer_operations (id) ON DELETE RESTRICT, 
    FOREIGN KEY(unit_id) REFERENCES medicine_units (id) ON DELETE RESTRICT
);

CREATE INDEX ix_unit_movement_events_unit_id_id ON unit_movement_events (unit_id, id);

CREATE INDEX ix_unit_movement_events_transfer_operation_id ON unit_movement_events (transfer_operation_id);

CREATE INDEX ix_unit_movement_events_order_id ON unit_movement_events (order_id);

INSERT INTO alembic_version (version_num) VALUES ('20261117_01') RETURNING alembic_version.version_num;

COMMIT;

