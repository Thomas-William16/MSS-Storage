import {
  User,
  EquipmentItem,
  Borrowing,
  BorrowingItem,
  EquipmentRequest,
  Maintenance,
} from "../models/index.js";
import { transaction, found, audit } from "./common.js";
import { activeEquipment } from "./inventory.js";
import { fail } from "../utils/errors.js";
export async function issue(user, input) {
  return transaction(async (session) => {
    const borrower = await User.findOneAndUpdate(
      { _id: input.user, isActive: true },
      { $inc: { revision: 1 } },
      { new: true, session },
    );
    if (!borrower) fail(409, "Borrower is unavailable or inactive");
    if (input.expectedReturnDate <= new Date())
      fail(400, "Return date must be in the future");
    const items = await EquipmentItem.find({
      _id: { $in: input.itemIds },
    }).session(session);
    if (items.length !== input.itemIds.length)
      fail(404, "One or more items do not exist");
    if (
      items.some((x) => x.status !== "AVAILABLE" || x.condition === "DAMAGED")
    )
      fail(409, "One or more items are unavailable");
    for (const equipmentId of [
      ...new Set(items.map((x) => String(x.equipmentId))),
    ].sort())
      await activeEquipment(equipmentId, session);
    let request;
    if (input.requestId) {
      request = await found(EquipmentRequest, input.requestId, session);
      if (
        request.status !== "APPROVED" ||
        String(request.requestedBy) !== input.user
      )
        fail(409, "Request is not approved for this borrower");
      const actual = new Map();
      for (const item of items)
        actual.set(
          String(item.equipmentId),
          (actual.get(String(item.equipmentId)) || 0) + 1,
        );
      if (
        actual.size !== request.items.length ||
        request.items.some(
          (x) => actual.get(String(x.equipment)) !== x.quantity,
        )
      )
        fail(400, "Issued items must match the approved request");
      request.status = "ISSUED";
      request.history.push({
        status: "ISSUED",
        user: user._id,
        at: new Date(),
      });
      await request.save({ session });
    }
    const result = await EquipmentItem.updateMany(
      {
        _id: { $in: input.itemIds },
        status: "AVAILABLE",
        condition: { $ne: "DAMAGED" },
      },
      { $set: { status: "BORROWED" } },
      { session },
    );
    if (result.modifiedCount !== items.length)
      fail(409, "An item has just become unavailable");
    const [borrowing] = await Borrowing.create(
      [
        {
          user: input.user,
          borrowedBy: user._id,
          expectedReturnDate: input.expectedReturnDate,
          purpose: input.purpose,
          notes: input.notes,
          request: input.requestId,
        },
      ],
      { session },
    );
    await BorrowingItem.create(
      items.map((item) => ({
        borrowing: borrowing._id,
        equipmentItem: item._id,
        conditionBefore: item.condition,
      })),
      { session, ordered: true },
    );
    await audit(
      user,
      "BORROWING_CREATED",
      "Borrowing",
      borrowing._id,
      { items: input.itemIds, requestId: input.requestId },
      session,
    );
    return borrowing;
  });
}
export async function returnItems(user, id, input) {
  return transaction(async (session) => {
    const borrowing = await found(Borrowing, id, session);
    if (!["ACTIVE", "PARTIAL"].includes(borrowing.status))
      fail(409, "Borrowing is already resolved");
    for (const entry of input.items) {
      const line = await BorrowingItem.findOne({
        borrowing: id,
        equipmentItem: entry.itemId,
      }).session(session);
      if (!line) fail(400, "Item does not belong to this borrowing");
      if (line.returnedAt) fail(409, "Item has already been resolved");
      const item = await found(EquipmentItem, entry.itemId, session);
      if (item.status !== "BORROWED") fail(409, "Inconsistent item state");
      const openRepair = await Maintenance.exists({
        equipmentItem: item._id,
        status: { $ne: "COMPLETED" },
      }).session(session);
      item.condition = entry.condition;
      item.status = entry.lost
        ? "LOST"
        : entry.condition === "DAMAGED" || openRepair
          ? "MAINTENANCE"
          : "AVAILABLE";
      line.conditionAfter = entry.condition;
      line.notes = entry.notes;
      line.returnedAt = new Date();
      line.resolution = entry.lost ? "LOST" : "RETURNED";
      await item.save({ session });
      await line.save({ session });
      if (
        item.status === "MAINTENANCE" &&
        !(await Maintenance.exists({
          equipmentItem: item._id,
          status: { $ne: "COMPLETED" },
        }).session(session))
      )
        await Maintenance.create(
          [
            {
              equipmentItem: item._id,
              reportedBy: user._id,
              description: entry.notes || "Damage recorded on return",
            },
          ],
          { session },
        );
    }
    const remaining = await BorrowingItem.countDocuments({
      borrowing: id,
      returnedAt: null,
    }).session(session);
    borrowing.status = remaining ? "PARTIAL" : "RETURNED";
    if (!remaining) borrowing.actualReturnDate = new Date();
    await borrowing.save({ session });
    await audit(
      user,
      "ITEMS_RETURNED",
      "Borrowing",
      borrowing._id,
      input,
      session,
    );
    return borrowing;
  });
}
export async function cancelBorrowing(user, id, notes) {
  return transaction(async (session) => {
    const borrowing = await found(Borrowing, id, session);
    if (borrowing.status !== "ACTIVE")
      fail(409, "Only an unreturned active borrowing can be cancelled");
    const lines = await BorrowingItem.find({ borrowing: id }).session(session);
    // Cancellation is explicitly a correction of an erroneous issuance; physical returns use returnItems.
    for (const line of lines) {
      const item = await found(EquipmentItem, line.equipmentItem, session);
      if (item.status !== "BORROWED" || line.returnedAt)
        fail(409, "Borrowing cannot be cancelled");
      item.status = "AVAILABLE";
      await item.save({ session });
      line.returnedAt = new Date();
      line.resolution = "CANCELLED";
      line.notes = notes;
      await line.save({ session });
    }
    borrowing.status = "CANCELLED";
    borrowing.actualReturnDate = new Date();
    await borrowing.save({ session });
    await audit(
      user,
      "BORROWING_CANCELLED",
      "Borrowing",
      borrowing._id,
      { notes },
      session,
    );
    return borrowing;
  });
}
