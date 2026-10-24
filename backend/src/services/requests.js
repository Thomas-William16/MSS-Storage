import { EquipmentRequest, EquipmentItem } from "../models/index.js";
import { transaction, found, audit } from "./common.js";
import { activeEquipment } from "./inventory.js";
import { own, operational } from "../policies/access.js";
import { fail } from "../utils/errors.js";
export async function createRequest(user, input) {
  if (input.neededUntil <= input.neededFrom || input.neededUntil <= new Date())
    fail(400, "Invalid required date range");
  return transaction(async (session) => {
    for (const entry of [...input.items].sort((a, b) =>
      a.equipment.localeCompare(b.equipment),
    ))
      await activeEquipment(entry.equipment, session);
    const [record] = await EquipmentRequest.create(
      [
        {
          ...input,
          requestedBy: user._id,
          history: [{ status: "PENDING", user: user._id, at: new Date() }],
        },
      ],
      { session },
    );
    await audit(
      user,
      "REQUEST_CREATED",
      "EquipmentRequest",
      record._id,
      { items: input.items },
      session,
    );
    return record;
  });
}
export async function changeRequest(user, id, status, notes) {
  return transaction(async (session) => {
    const record = await found(EquipmentRequest, id, session);
    if (status === "CANCELLED") {
      own(record, user, "requestedBy");
      if (!["PENDING", "APPROVED"].includes(record.status))
        fail(409, "Request cannot be cancelled");
    } else if (record.status !== "PENDING")
      fail(409, "Request has already been reviewed");
    if (status === "APPROVED") {
      if (record.neededUntil <= new Date())
        fail(409, "Request dates have expired");
      for (const entry of [...record.items].sort((a, b) =>
        String(a.equipment).localeCompare(String(b.equipment)),
      )) {
        await activeEquipment(entry.equipment, session);
        const count = await EquipmentItem.countDocuments({
          equipmentId: entry.equipment,
          status: "AVAILABLE",
          condition: { $ne: "DAMAGED" },
        }).session(session);
        if (count < entry.quantity) fail(409, "Insufficient available items");
      }
      record.approvedBy = user._id;
      record.approvedAt = new Date();
    }
    record.status = status;
    record.notes = notes;
    record.history.push({ status, user: user._id, at: new Date(), notes });
    await record.save({ session });
    await audit(
      user,
      `REQUEST_${status}`,
      "EquipmentRequest",
      record._id,
      { notes },
      session,
    );
    return record;
  });
}
