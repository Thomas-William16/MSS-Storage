import { Router } from "express";
import {
  Borrowing,
  BorrowingItem,
  EquipmentRequest,
  Maintenance,
  conditions,
} from "../models/index.js";
import {
  z,
  id,
  str,
  date,
  body,
  pagination,
  pathId,
  uniqueIds,
  parse,
} from "../middleware/validation.js";
import { permit, own, operational } from "../middleware/security.js";
import { found, list } from "../services/common.js";
import { issue, returnItems, cancelBorrowing } from "../services/borrowing.js";
import { createRequest, changeRequest } from "../services/requests.js";
import { reportDamage, editMaintenance } from "../services/maintenance.js";
export const workflows = Router();
const respond = (res, data, status = 200) => res.status(status).json({ data });
const note = z.strictObject({ notes: str().min(1) });
workflows.get("/borrowings", permit("requests"), async (req, res) => {
  const paging = pagination(req),
    filter = operational(req.user) ? {} : { user: req.user._id };
  if (paging.status)
    filter.status = parse(
      z.enum(["ACTIVE", "PARTIAL", "RETURNED", "CANCELLED"]),
      paging.status,
    );
  if (paging.from || paging.to)
    filter.borrowDate = {
      ...(paging.from ? { $gte: paging.from } : {}),
      ...(paging.to ? { $lte: paging.to } : {}),
    };
  const result = await list(Borrowing, filter, paging, ["user", "borrowedBy"]);
  result.data = result.data.map((x) => ({
    ...x,
    overdue:
      ["ACTIVE", "PARTIAL"].includes(x.status) &&
      x.expectedReturnDate < new Date(),
  }));
  res.json(result);
});
workflows.get(
  "/borrowings/:id",
  pathId,
  permit("requests"),
  async (req, res) => {
    const record = await found(Borrowing, req.params.id);
    own(record, req.user);
    await record.populate(
      ["user", "borrowedBy"].map((path) => ({ path, select: "name role" })),
    );
    const items = await BorrowingItem.find({ borrowing: record._id }).populate({
      path: "equipmentItem",
      populate: { path: "equipmentId location" },
    });
    respond(res, {
      ...record.toObject(),
      items,
      overdue:
        items.some((x) => !x.returnedAt) &&
        record.expectedReturnDate < new Date(),
    });
  },
);
workflows.post(
  "/borrowings",
  permit("borrow"),
  body(
    z.strictObject({
      user: id,
      itemIds: uniqueIds,
      expectedReturnDate: date,
      purpose: str(500).min(1),
      notes: str().optional(),
      requestId: id.optional(),
    }),
  ),
  async (req, res) => respond(res, await issue(req.user, req.input), 201),
);
workflows.post(
  "/borrowings/:id/return",
  pathId,
  permit("borrow"),
  body(
    z.strictObject({
      items: z
        .array(
          z.strictObject({
            itemId: id,
            condition: z.enum(conditions),
            lost: z.boolean().default(false),
            notes: str().optional(),
          }),
        )
        .min(1)
        .max(100)
        .refine(
          (x) => new Set(x.map((y) => y.itemId)).size === x.length,
          "Duplicate items",
        ),
    }),
  ),
  async (req, res) =>
    respond(res, await returnItems(req.user, req.params.id, req.input)),
);
workflows.post(
  "/borrowings/:id/cancel",
  pathId,
  permit("borrow"),
  body(note),
  async (req, res) =>
    respond(
      res,
      await cancelBorrowing(req.user, req.params.id, req.input.notes),
    ),
);
workflows.get("/requests", permit("requests"), async (req, res) => {
  const paging = pagination(req),
    filter = operational(req.user) ? {} : { requestedBy: req.user._id };
  if (paging.status)
    filter.status = parse(
      z.enum(["PENDING", "APPROVED", "REJECTED", "CANCELLED", "ISSUED"]),
      paging.status,
    );
  res.json(
    await list(EquipmentRequest, filter, paging, [
      "requestedBy",
      "items.equipment",
    ]),
  );
});
workflows.get("/requests/:id", pathId, permit("requests"), async (req, res) => {
  const record = await found(EquipmentRequest, req.params.id);
  own(record, req.user, "requestedBy");
  await record.populate([
    { path: "items.equipment" },
    ...["requestedBy", "approvedBy", "history.user"].map((path) => ({
      path,
      select: "name role",
    })),
  ]);
  respond(res, record);
});
workflows.post(
  "/requests",
  permit("requests"),
  body(
    z.strictObject({
      items: z
        .array(
          z.strictObject({
            equipment: id,
            quantity: z.number().int().min(1).max(500),
          }),
        )
        .min(1)
        .max(50)
        .refine(
          (x) => new Set(x.map((y) => y.equipment)).size === x.length,
          "Duplicate equipment types",
        ),
      neededFrom: date,
      neededUntil: date,
      purpose: str(500).min(1),
    }),
  ),
  async (req, res) =>
    respond(res, await createRequest(req.user, req.input), 201),
);
for (const [action, status] of [
  ["approve", "APPROVED"],
  ["reject", "REJECTED"],
  ["cancel", "CANCELLED"],
])
  workflows.post(
    `/requests/:id/${action}`,
    pathId,
    permit(action === "cancel" ? "requests" : "reviewRequests"),
    body(note),
    async (req, res) =>
      respond(
        res,
        await changeRequest(req.user, req.params.id, status, req.input.notes),
      ),
  );
workflows.get("/maintenance", permit("requests"), async (req, res) => {
  const paging = pagination(req),
    filter = operational(req.user) ? {} : { reportedBy: req.user._id };
  if (paging.status)
    filter.status = parse(
      z.enum(["OPEN", "IN_PROGRESS", "COMPLETED"]),
      paging.status,
    );
  res.json(
    await list(Maintenance, filter, paging, [
      { path: "equipmentItem", populate: { path: "equipmentId" } },
      "reportedBy",
    ]),
  );
});
workflows.post(
  "/maintenance",
  permit("reportDamage"),
  body(z.strictObject({ equipmentItem: id, description: str().min(1) })),
  async (req, res) =>
    respond(res, await reportDamage(req.user, req.input), 201),
);
workflows.patch(
  "/maintenance/:id",
  pathId,
  permit("maintenance"),
  body(
    z.strictObject({
      status: z.enum(["OPEN", "IN_PROGRESS"]).optional(),
      cost: z.number().min(0).max(10000000).optional(),
      notes: str().optional(),
    }),
  ),
  async (req, res) =>
    respond(res, await editMaintenance(req.user, req.params.id, req.input)),
);
workflows.post(
  "/maintenance/:id/complete",
  pathId,
  permit("maintenance"),
  body(
    z.strictObject({
      condition: z.enum(["NEW", "GOOD", "FAIR"]),
      restore: z.boolean(),
      cost: z.number().min(0).max(10000000).optional(),
      notes: str().optional(),
    }),
  ),
  async (req, res) =>
    respond(
      res,
      await editMaintenance(req.user, req.params.id, req.input, true),
    ),
);
