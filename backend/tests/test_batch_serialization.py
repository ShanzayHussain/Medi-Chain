import os
import unittest
from datetime import date
from datetime import datetime, timedelta, timezone
from fastapi import HTTPException

# This test must never inherit a developer's or production database URL.
os.environ["DATABASE_URL"] = "sqlite://"

from sqlalchemy.orm import Session

from app.database import Base, engine
from app.models import batch, custody_ledger, flag, order, temperature, transaction, user
from app.models import medicine_unit, unit_movement, unit_transfer
from app.models.batch import MedicineBatch
from app.models.flag import Flag
from app.models.medicine_unit import MedicineUnit
from app.models.order import Order
from app.models.transaction import Transaction
from app.models.unit_movement import UnitMovementEvent
from app.models.unit_transfer import UnitTransferOperation
from app.models.user import User
from app.routes.batch_routes import create_batch, get_unit_labels
from app.routes.custody_routes import verify_batch
from app.routes.custody_routes import transfer_custody
from app.routes.unit_routes import create_unit_transfer, receive_unit_transfer, record_unit_scan, verify_unit
from app.routes.dashboard_routes import admin_dashboard, distributor_dashboard, manufacturer_dashboard
from app.routes.payment_routes import OrderCreate, SandboxPay, create_order as create_payment_order, market, pay_sandbox, settle
from app.routes.transaction_routes import create_transaction
from app.schemas import BatchCreate, CustodyTransfer, SaleCreate, UnitTransferCreate
from app.utils.ledger import append_custody_event, verify_chain
from app.utils.inventory import batch_inventories, owner_inventory
from app.utils.forecast import forecast_demand


class BatchSerializationTests(unittest.TestCase):
    def setUp(self):
        Base.metadata.create_all(engine)
        self.db = Session(engine)
        self.manufacturer = User(
            name="Test Manufacturer",
            email="manufacturer@example.test",
            password_hash="unused",
            role="manufacturer",
            organization_name="Test Organization",
        )
        self.distributor = User(
            name="Test Distributor", email="distributor@example.test", password_hash="unused",
            role="distributor", organization_name="Private Distributor Co",
        )
        self.pharmacy = User(
            name="Test Pharmacy", email="pharmacy@example.test", password_hash="unused",
            role="pharmacy", organization_name="Private Pharmacy Co",
        )
        self.customer = User(
            name="Test Customer", email="customer@example.test", password_hash="unused",
            role="customer",
        )
        self.db.add_all([self.manufacturer, self.distributor, self.pharmacy, self.customer])
        self.db.commit()
        self.db.refresh(self.manufacturer)

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(engine)

    def test_create_batch_serializes_units_and_keeps_batch_qr(self):
        quantity = 500
        result = create_batch(
            BatchCreate(
                drug_name="Amoxicillin 500mg",
                quantity=quantity,
                manufacture_date=date(2026, 1, 1),
                expiry_date=date(2027, 1, 1),
            ),
            self.db,
            {"user_id": self.manufacturer.id, "role": "manufacturer"},
        )

        units = self.db.query(MedicineUnit).filter_by(batch_id=result["batch_id"]).all()
        events = (
            self.db.query(UnitMovementEvent)
            .join(MedicineUnit, UnitMovementEvent.unit_id == MedicineUnit.id)
            .filter(MedicineUnit.batch_id == result["batch_id"])
            .all()
        )
        self.assertEqual(result["unit_count"], quantity)
        self.assertEqual(len(units), quantity)
        self.assertEqual(len({unit.unit_uid for unit in units}), quantity)
        self.assertTrue(all(unit.unit_uid.version == 4 for unit in units))
        self.assertEqual(len({unit.serial_number for unit in units}), quantity)
        self.assertTrue(all(unit.current_owner_id == self.manufacturer.id for unit in units))
        self.assertEqual(len(events), quantity)
        self.assertTrue(all(event.event_type == "created" for event in events))
        self.assertTrue(result["qr_code_base64"])
        self.assertTrue(verify_chain(self.db, result["batch_id"])["valid"])

    def test_existing_ledger_helper_still_commits_by_default(self):
        result = create_batch(
            BatchCreate(
                drug_name="Test medicine",
                quantity=1,
                manufacture_date=date(2026, 1, 1),
                expiry_date=date(2027, 1, 1),
            ),
            self.db,
            {"user_id": self.manufacturer.id, "role": "manufacturer"},
        )
        entry = append_custody_event(
            self.db,
            result["batch_id"],
            "TRANSFERRED",
            self.manufacturer.id,
            "manufacturer",
            "test",
        )
        self.assertIsNotNone(entry.id)
        self.assertEqual(verify_chain(self.db, result["batch_id"])["entries"], 2)

    def test_unit_label_api_is_paginated_and_returns_unique_qrs(self):
        result = create_batch(
            BatchCreate(
                drug_name="Label medicine", quantity=3,
                manufacture_date=date(2026, 1, 1), expiry_date=date(2027, 1, 1),
            ),
            self.db,
            {"user_id": self.manufacturer.id, "role": "manufacturer"},
        )
        labels = get_unit_labels(
            result["batch_uid"], 2, 0, self.db,
            {"user_id": self.manufacturer.id, "role": "manufacturer"},
        )
        self.assertEqual(labels["total"], 3)
        self.assertEqual(len(labels["items"]), 2)
        self.assertEqual(len({item["unit_uid"] for item in labels["items"]}), 2)
        self.assertTrue(all(item["qr_code_base64"] for item in labels["items"]))

    def create_one_unit(self):
        result = create_batch(
            BatchCreate(
                drug_name="Test medicine",
                quantity=1,
                manufacture_date=date(2026, 1, 1),
                expiry_date=date(2027, 1, 1),
            ),
            self.db,
            {"user_id": self.manufacturer.id, "role": "manufacturer"},
        )
        return result, self.db.query(MedicineUnit).filter_by(batch_id=result["batch_id"]).one()

    def test_unit_verification_hides_private_identity_and_records_reuse(self):
        _, unit = self.create_one_unit()
        response = verify_unit(str(unit.unit_uid), self.db)
        self.assertEqual(response["current_owner_role"], "manufacturer")
        self.assertFalse(response["supply_chain_complete"])
        self.assertEqual(response["risk_level"], "high")
        self.assertNotIn("current_owner_id", response)
        self.assertNotIn("manufacturer_id", response)
        self.assertNotIn("Private Distributor Co", str(response))
        self.assertNotIn("manufacturer@example.test", str(response))
        batch_response = verify_batch(response["batch_uid"], self.db)
        self.assertFalse(batch_response["supply_chain_complete"])

        unit.status = "sold"
        unit.current_owner_id = None
        self.db.add(UnitMovementEvent(
            unit_id=unit.id, event_type="sold", actor_id=self.pharmacy.id,
            from_owner_id=self.manufacturer.id,
        ))
        self.db.commit()
        first = record_unit_scan(str(unit.unit_uid), self.db, None)
        second = record_unit_scan(str(unit.unit_uid), self.db, None)
        self.assertFalse(first["duplicate_scan"])
        self.assertTrue(second["duplicate_scan"])
        self.assertTrue(any(event.event_type == "flagged" for event in
                            self.db.query(UnitMovementEvent).filter_by(unit_id=unit.id).all()))
        self.assertTrue(self.db.query(Flag).filter_by(batch_id=unit.batch_id).one().reason.startswith(
            "Serialized unit reuse suspected:"
        ))

    def test_individual_transfer_requires_each_confirmed_handoff(self):
        _, unit = self.create_one_unit()
        request = UnitTransferCreate(
            unit_uids=[str(unit.unit_uid)], recipient_id=self.distributor.id, location="Hub",
        )
        created = create_unit_transfer(
            request, self.db,
            {"user_id": self.manufacturer.id, "role": "manufacturer"},
        )
        self.assertEqual(unit.status, "pending_transfer")
        self.assertEqual(unit.current_owner_id, self.manufacturer.id)

        received = receive_unit_transfer(
            created["operation_uid"], self.db,
            {"user_id": self.distributor.id, "role": "distributor"},
        )
        self.assertEqual(received["status"], "received")
        self.assertEqual(unit.current_owner_id, self.distributor.id)
        self.assertEqual(unit.status, "available")

        second_request = UnitTransferCreate(
            unit_uids=[str(unit.unit_uid)], recipient_id=self.pharmacy.id, location="Store",
        )
        second = create_unit_transfer(
            second_request, self.db,
            {"user_id": self.distributor.id, "role": "distributor"},
        )
        receive_unit_transfer(
            second["operation_uid"], self.db,
            {"user_id": self.pharmacy.id, "role": "pharmacy"},
        )
        verification = verify_unit(str(unit.unit_uid), self.db)
        self.assertTrue(verification["supply_chain_complete"])
        self.assertEqual(verification["current_owner_role"], "pharmacy")
        batch_verification = verify_batch(verification["batch_uid"], self.db)
        self.assertTrue(batch_verification["supply_chain_complete"])
        self.assertEqual(batch_verification["serialized_inventory"]["complete_units"], 1)
        self.assertEqual(
            self.db.query(UnitTransferOperation).count(), 2,
        )

    def test_inventory_uses_units_or_legacy_quantity_without_double_counting(self):
        result = create_batch(
            BatchCreate(
                drug_name="Shared product",
                quantity=3,
                manufacture_date=date(2026, 1, 1),
                expiry_date=date(2027, 1, 1),
            ),
            self.db,
            {"user_id": self.manufacturer.id, "role": "manufacturer"},
        )
        serialized_batch = self.db.get(MedicineBatch, result["batch_id"])
        serialized_units = self.db.query(MedicineUnit).filter_by(batch_id=serialized_batch.id).all()
        serialized_units[0].status = "sold"
        serialized_units[1].current_owner_id = self.distributor.id
        serialized_units[2].status = "pending_transfer"
        serialized_units[2].current_owner_id = self.distributor.id
        # A stale aggregate must not override the serialized source of truth.
        serialized_batch.quantity_sold = 2

        legacy_batch = MedicineBatch(
            drug_name="Shared product",
            manufacturer_id=self.manufacturer.id,
            quantity=4,
            quantity_sold=1,
            manufacture_date=date(2026, 1, 1),
            expiry_date=date(2027, 1, 1),
        )
        self.db.add(legacy_batch)
        self.db.commit()

        inventories = batch_inventories(self.db, [serialized_batch, legacy_batch])
        self.assertEqual(inventories[serialized_batch.id]["remaining"], 2)
        self.assertEqual(inventories[serialized_batch.id]["forecast_stock"], 2)
        self.assertEqual(inventories[legacy_batch.id]["remaining"], 3)
        self.assertFalse(inventories[legacy_batch.id]["serialized"])
        distributor_holding = owner_inventory(self.db, self.distributor.id)
        self.assertEqual(distributor_holding[0]["held"], 2)
        self.assertEqual(distributor_holding[0]["pending_transfer"], 1)

        manufacturer_report = manufacturer_dashboard(
            self.db, {"user_id": self.manufacturer.id, "role": "manufacturer"},
        )
        distributor_report = distributor_dashboard(
            self.db, {"user_id": self.distributor.id, "role": "distributor"},
        )
        admin_report = admin_dashboard(self.db, {"user_id": 0, "role": "admin"})
        self.assertEqual(manufacturer_report["summary"]["Units produced"], 7)
        self.assertEqual(manufacturer_report["summary"]["Units sold"], 2)
        self.assertEqual(distributor_report["summary"]["Serialized units held"], 2)
        self.assertEqual(len(admin_report["sections"][-1]["items"]), 2)
        self.assertEqual(forecast_demand(self.db)[0]["stock"], 5)

    def test_serialized_order_reserves_exact_units_and_settles_atomically(self):
        result = create_batch(
            BatchCreate(
                drug_name="Payment medicine",
                quantity=5,
                manufacture_date=date(2026, 1, 1),
                expiry_date=date(2027, 1, 1),
                price_pkr=25,
            ),
            self.db,
            {"user_id": self.manufacturer.id, "role": "manufacturer"},
        )
        units = self.db.query(MedicineUnit).filter_by(batch_id=result["batch_id"]).all()
        first = create_unit_transfer(
            UnitTransferCreate(unit_uids=[str(u.unit_uid) for u in units],
                               recipient_id=self.distributor.id, location="Hub"),
            self.db,
            {"user_id": self.manufacturer.id, "role": "manufacturer"},
        )
        receive_unit_transfer(first["operation_uid"], self.db,
                              {"user_id": self.distributor.id, "role": "distributor"})
        second = create_unit_transfer(
            UnitTransferCreate(unit_uids=[str(u.unit_uid) for u in units],
                               recipient_id=self.pharmacy.id, location="Store"),
            self.db,
            {"user_id": self.distributor.id, "role": "distributor"},
        )
        receive_unit_transfer(second["operation_uid"], self.db,
                              {"user_id": self.pharmacy.id, "role": "pharmacy"})

        listings = market(self.db, {"user_id": self.customer.id, "role": "customer"})["items"]
        self.assertEqual(len(listings), 1)
        self.assertEqual(listings[0]["seller_id"], self.pharmacy.id)
        self.assertEqual(listings[0]["remaining"], 5)

        order_result = create_payment_order(
            OrderCreate(batch_uid=result["batch_uid"], quantity=3, seller_id=self.pharmacy.id),
            self.db,
            {"user_id": self.customer.id, "role": "customer"},
        )
        order = self.db.get(Order, order_result["order_id"])
        self.assertEqual(order.status, "pending")
        self.assertEqual(self.db.query(MedicineUnit).filter_by(reserved_order_id=order.id).count(), 3)
        self.assertEqual(self.db.query(MedicineUnit).filter_by(status="available").count(), 2)
        order_count = self.db.query(Order).count()
        with self.assertRaises(HTTPException):
            create_payment_order(
                OrderCreate(batch_uid=result["batch_uid"], quantity=3, seller_id=self.pharmacy.id),
                self.db,
                {"user_id": self.customer.id, "role": "customer"},
            )
        self.assertEqual(self.db.query(Order).count(), order_count)
        self.assertEqual(self.db.query(MedicineUnit).filter_by(reserved_order_id=order.id).count(), 3)

        receipt = settle(self.db, order.id, self.customer.id, "card", ref="TEST")
        self.assertTrue(receipt["paid"])
        self.assertEqual(order.status, "paid")
        self.assertEqual(self.db.query(MedicineUnit).filter_by(status="sold").count(), 3)
        self.assertEqual(self.db.query(MedicineUnit).filter_by(current_owner_id=self.customer.id).count(), 3)
        self.assertEqual(self.db.query(UnitMovementEvent).filter_by(order_id=order.id, event_type="sold").count(), 3)
        self.assertEqual(self.db.query(Transaction).filter_by(batch_id=result["batch_id"]).one().quantity, 3)

        with self.assertRaises(HTTPException):
            settle(self.db, order.id, self.customer.id, "card", ref="RETRY")

    def test_legacy_batch_checkout_and_declined_payment_remain_supported(self):
        batch_row = MedicineBatch(
            drug_name="Legacy medicine", manufacturer_id=self.manufacturer.id,
            quantity=4, quantity_sold=0, manufacture_date=date(2026, 1, 1),
            expiry_date=date(2027, 1, 1), price_pkr=10,
        )
        self.db.add(batch_row)
        self.db.commit()
        append_custody_event(self.db, batch_row.id, "CREATED", self.manufacturer.id,
                             "manufacturer", "Manufacturer")
        append_custody_event(self.db, batch_row.id, "TRANSFERRED", self.pharmacy.id,
                             "pharmacy", "Store")
        order_result = create_payment_order(
            OrderCreate(batch_uid=str(batch_row.batch_uid), quantity=2),
            self.db,
            {"user_id": self.customer.id, "role": "customer"},
        )
        order = self.db.get(Order, order_result["order_id"])
        self.assertEqual(order.status, "pending")
        self.assertEqual(self.db.query(MedicineUnit).filter_by(batch_id=batch_row.id).count(), 0)
        receipt = settle(self.db, order.id, self.customer.id, "card", ref="LEGACY")
        self.assertTrue(receipt["paid"])
        self.assertEqual(batch_row.quantity_sold, 2)

        declined_result = create_payment_order(
            OrderCreate(batch_uid=str(batch_row.batch_uid), quantity=1),
            self.db,
            {"user_id": self.customer.id, "role": "customer"},
        )
        declined_order = self.db.get(Order, declined_result["order_id"])
        with self.assertRaises(HTTPException) as raised:
            pay_sandbox(
                declined_order.id, SandboxPay(method="card", reference="0002"), self.db,
                {"user_id": self.customer.id, "role": "customer"},
            )
        self.assertEqual(raised.exception.status_code, 402)
        self.assertEqual(declined_order.status, "failed")

    def test_expired_unit_reservations_are_released(self):
        result = create_batch(
            BatchCreate(
                drug_name="Expiry medicine", quantity=1,
                manufacture_date=date(2026, 1, 1), expiry_date=date(2027, 1, 1), price_pkr=10,
            ),
            self.db,
            {"user_id": self.manufacturer.id, "role": "manufacturer"},
        )
        unit = self.db.query(MedicineUnit).filter_by(batch_id=result["batch_id"]).one()
        first = create_unit_transfer(
            UnitTransferCreate(unit_uids=[str(unit.unit_uid)], recipient_id=self.distributor.id,
                               location="Hub"),
            self.db, {"user_id": self.manufacturer.id, "role": "manufacturer"},
        )
        receive_unit_transfer(first["operation_uid"], self.db,
                              {"user_id": self.distributor.id, "role": "distributor"})
        second = create_unit_transfer(
            UnitTransferCreate(unit_uids=[str(unit.unit_uid)], recipient_id=self.pharmacy.id,
                               location="Store"),
            self.db, {"user_id": self.distributor.id, "role": "distributor"},
        )
        receive_unit_transfer(second["operation_uid"], self.db,
                              {"user_id": self.pharmacy.id, "role": "pharmacy"})
        order_result = create_payment_order(
            OrderCreate(batch_uid=result["batch_uid"], quantity=1, seller_id=self.pharmacy.id),
            self.db, {"user_id": self.customer.id, "role": "customer"},
        )
        order = self.db.get(Order, order_result["order_id"])
        unit.reserved_until = datetime.now(timezone.utc) - timedelta(seconds=1)
        self.db.commit()
        with self.assertRaises(HTTPException) as raised:
            settle(self.db, order.id, self.customer.id, "card", ref="TOO-LATE")
        self.assertEqual(raised.exception.status_code, 409)
        self.assertEqual(order.status, "expired")
        self.assertEqual(unit.status, "available")
        self.assertIsNone(unit.reserved_order_id)

    def test_pharmacy_counter_sale_updates_unit_identity(self):
        result, units = self.create_one_unit()
        unit = units
        first = create_unit_transfer(
            UnitTransferCreate(unit_uids=[str(unit.unit_uid)], recipient_id=self.distributor.id,
                               location="Hub"),
            self.db, {"user_id": self.manufacturer.id, "role": "manufacturer"},
        )
        receive_unit_transfer(first["operation_uid"], self.db,
                              {"user_id": self.distributor.id, "role": "distributor"})
        second = create_unit_transfer(
            UnitTransferCreate(unit_uids=[str(unit.unit_uid)], recipient_id=self.pharmacy.id,
                               location="Store"),
            self.db, {"user_id": self.distributor.id, "role": "distributor"},
        )
        receive_unit_transfer(second["operation_uid"], self.db,
                              {"user_id": self.pharmacy.id, "role": "pharmacy"})

        sale = create_transaction(
            SaleCreate(batch_uid=result["batch_uid"], quantity=1, location="Counter"),
            self.db, {"user_id": self.pharmacy.id, "role": "pharmacy"},
        )
        self.assertEqual(sale["units_sold"], 1)
        self.assertEqual(unit.status, "sold")
        self.assertIsNone(unit.current_owner_id)
        self.assertEqual(
            self.db.query(UnitMovementEvent).filter_by(unit_id=unit.id, event_type="sold").count(), 1,
        )

    def test_legacy_transfer_and_counter_sale_workflow_is_preserved(self):
        batch_row = MedicineBatch(
            drug_name="Legacy wholesale medicine", manufacturer_id=self.manufacturer.id,
            quantity=5, quantity_sold=0, manufacture_date=date(2026, 1, 1),
            expiry_date=date(2027, 1, 1), price_pkr=10,
        )
        self.db.add(batch_row)
        self.db.commit()
        append_custody_event(self.db, batch_row.id, "CREATED", self.manufacturer.id,
                             "manufacturer", "Manufacturer")
        transfer = CustodyTransfer(batch_uid=str(batch_row.batch_uid), location="Hub")
        with self.assertRaises(HTTPException):
            transfer_custody(transfer, self.db,
                             {"user_id": self.pharmacy.id, "role": "pharmacy"})
        transfer_custody(transfer, self.db,
                         {"user_id": self.distributor.id, "role": "distributor"})
        transfer_custody(CustodyTransfer(batch_uid=str(batch_row.batch_uid), location="Store"),
                         self.db, {"user_id": self.pharmacy.id, "role": "pharmacy"})

        sale = create_transaction(
            SaleCreate(batch_uid=str(batch_row.batch_uid), quantity=2, location="Counter"),
            self.db,
            {"user_id": self.pharmacy.id, "role": "pharmacy"},
        )
        self.assertEqual(sale["units_sold"], 2)
        self.assertEqual(batch_row.quantity_sold, 2)
        self.assertEqual(self.db.query(MedicineUnit).filter_by(batch_id=batch_row.id).count(), 0)
        self.assertTrue(verify_chain(self.db, batch_row.id)["valid"])


if __name__ == "__main__":
    unittest.main()
