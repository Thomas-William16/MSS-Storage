import { Maintenance, EquipmentItem } from "../models/index.js";
import { transaction, found, audit } from "./common.js";
import { operational } from "../policies/access.js";
import { fail } from "../utils/errors.js";
import { activeEquipment } from "./inventory.js";
export async function reportDamage(user, input) {
  return transaction(async (session) => {
    const item = await found(EquipmentItem, input.equipmentItem, session);
    if (!operational(user)) {
      const { Borrowing, BorrowingItem } = await import("../models/index.js");
      const ownLoans = await Borrowing.find({
        user: user._id,
        status: { $in: ["ACTIVE", "PARTIAL"] },
      })
        .select("_id")
        .session(session);
      const line = await BorrowingItem.exists({
        borrowing: { $in: ownLoans.map((x) => x._id) },
        equipmentItem: item._id,
        returnedAt: null,
      }).session(session);
      if (!line)
        fail(
          403,
          "You may report damage only for an item currently borrowed by you",
        );
    }
    if (["LOST", "RETIRED"].includes(item.status))
      fail(409, "Item cannot enter maintenance");
    await activeEquipment(item.equipmentId, session);
    item.condition = "DAMAGED";
    if (item.status !== "BORROWED") item.status = "MAINTENANCE";
    await item.save({ session });
    const existing = await Maintenance.findOne({
      equipmentItem: item._id,
      status: { $ne: "COMPLETED" },
    }).session(session);
    if (existing) fail(409, "An open maintenance record already exists");
    const [record] = await Maintenance.create(
      [
        {
          equipmentItem: item._id,
          reportedBy: user._id,
          description: input.description,
        },
      ],
      { session },
    );
    await audit(
      user,
      "DAMAGE_REPORTED",
      "Maintenance",
      record._id,
      { equipmentItem: item._id },
      session,
    );
    return record;
  });
}
export async function editMaintenance(user, id, input, complete = false) {
  return transaction(async (session) => {
    const record = await found(Maintenance, id, session);
    if (record.status === "COMPLETED") fail(409, "Maintenance is complete");
    if (complete) {
      const item = await found(EquipmentItem, record.equipmentItem, session);
      if (
        item.status !== "MAINTENANCE" &&
        !(!input.restore && ["LOST", "RETIRED"].includes(item.status))
      )
        fail(
          409,
          "Return the item before completing maintenance; lost items cannot be restored by a repair",
        );
      if (item.status === "MAINTENANCE") {
        item.condition = input.condition;
        item.status = input.restore ? "AVAILABLE" : "RETIRED";
      }
      await item.save({ session });
      record.status = "COMPLETED";
      record.completedAt = new Date();
    } else if (input.status) record.status = input.status;
    if (input.cost !== undefined) record.cost = input.cost;
    if (input.notes !== undefined) record.notes = input.notes;
    await record.save({ session });
    await audit(
      user,
      complete ? "MAINTENANCE_COMPLETED" : "MAINTENANCE_UPDATED",
      "Maintenance",
      record._id,
      input,
      session,
    );
    return record;
  });
}
