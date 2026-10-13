import {
  Equipment,
  EquipmentItem,
  Counter,
  Category,
  BorrowingItem,
  Maintenance,
} from "../models/index.js";
import { transaction, found, audit, reference } from "./common.js";
import { fail } from "../utils/errors.js";
export async function activeEquipment(id, session) {
  // Writing a revision serializes archive, issuance, and batch creation against the same equipment.
  const equipment = await Equipment.findOneAndUpdate(
    { _id: id, archivedAt: null },
    { $inc: { revision: 1 } },
    { new: true, session },
  );
  if (!equipment) fail(409, "Equipment is archived or unavailable");
  return equipment;
}
export async function createItems(user, equipmentId, input) {
  return transaction((session) =>
    createItemsInSession(user, equipmentId, input, session),
  );
}
export async function createItemsInSession(user, equipmentId, input, session) {
  const equipment = await activeEquipment(equipmentId, session);
  const quantity = input.quantity || 1;
  const counter = await Counter.findOneAndUpdate(
    { _id: String(equipmentId) },
    { $inc: { value: quantity } },
    { new: true, upsert: true, session },
  );
  const prefix =
    equipment.name
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 20) || "ITEM";
  const items = Array.from({ length: quantity }, (_, i) => ({
    equipmentId,
    itemCode:
      input.codes?.[i] ||
      input.itemCode ||
      `${prefix}-${String(equipmentId).slice(-6).toUpperCase()}-${String(counter.value - quantity + i + 1).padStart(3, "0")}`,
    condition: input.condition || "GOOD",
    status: input.condition === "DAMAGED" ? "MAINTENANCE" : "AVAILABLE",
    notes: input.notes || "",
    serialNumber: input.serialNumber || "",
  }));
  const created = await EquipmentItem.create(items, {
    session,
    ordered: true,
  });
  if (input.condition === "DAMAGED")
    await Maintenance.create(
      created.map((item) => ({
        equipmentItem: item._id,
        reportedBy: user._id,
        description: "Initial damaged condition",
      })),
      { session, ordered: true },
    );
  await audit(
    user,
    "ITEMS_CREATED",
    "Equipment",
    equipmentId,
    { quantity, codes: created.map((x) => x.itemCode) },
    session,
  );
  return created;
}
export async function inventoryStats(filter = {}) {
  const rows = await Equipment.find(filter).populate("category").lean();
  const ids = rows.map((x) => x._id);
  const counts = await EquipmentItem.aggregate([
    { $match: { equipmentId: { $in: ids } } },
    {
      $group: {
        _id: "$equipmentId",
        total: { $sum: 1 },
        available: {
          $sum: { $cond: [{ $eq: ["$status", "AVAILABLE"] }, 1, 0] },
        },
        borrowed: { $sum: { $cond: [{ $eq: ["$status", "BORROWED"] }, 1, 0] } },
        maintenance: {
          $sum: { $cond: [{ $eq: ["$status", "MAINTENANCE"] }, 1, 0] },
        },
        lost: { $sum: { $cond: [{ $eq: ["$status", "LOST"] }, 1, 0] } },
        retired: { $sum: { $cond: [{ $eq: ["$status", "RETIRED"] }, 1, 0] } },
        damaged: {
          $sum: { $cond: [{ $eq: ["$condition", "DAMAGED"] }, 1, 0] },
        },
      },
    },
  ]);
  const map = new Map(counts.map((x) => [String(x._id), x]));
  return rows.map((x) => ({
    ...x,
    counts: map.get(String(x._id)) || {
      total: 0,
      available: 0,
      borrowed: 0,
      maintenance: 0,
      lost: 0,
      retired: 0,
      damaged: 0,
    },
  }));
}
export async function updateItem(user, id, input) {
  return transaction(async (session) => {
    const item = await found(EquipmentItem, id, session);
    if (input.condition && ["BORROWED", "MAINTENANCE"].includes(item.status))
      fail(409, "Record condition through return or maintenance");
    if (input.status && !["AVAILABLE", "LOST", "RETIRED"].includes(item.status))
      fail(409, "Use borrowing or maintenance workflow");
    if (
      input.status === "AVAILABLE" &&
      item.condition === "DAMAGED" &&
      input.condition !== "GOOD" &&
      input.condition !== "FAIR" &&
      input.condition !== "NEW"
    )
      fail(409, "Damaged items require repair");
    if (input.status || input.condition)
      await activeEquipment(item.equipmentId, session);
    if (input.status === "AVAILABLE") {
      if (
        await Maintenance.exists({
          equipmentItem: item._id,
          status: { $ne: "COMPLETED" },
        }).session(session)
      )
        fail(409, "Resolve maintenance before restoring stock");
    }
    Object.assign(item, input);
    if (input.condition === "DAMAGED" && item.status === "AVAILABLE") {
      item.status = "MAINTENANCE";
      await Maintenance.create(
        [
          {
            equipmentItem: item._id,
            reportedBy: user._id,
            description: "Condition marked damaged",
          },
        ],
        { session },
      );
    }
    await item.save({ session });
    await audit(
      user,
      "ITEM_UPDATED",
      "EquipmentItem",
      item._id,
      input,
      session,
    );
    return item;
  });
}
