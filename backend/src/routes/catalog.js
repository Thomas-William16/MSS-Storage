import { Router } from "express";
import QRCode from "qrcode";
import {
  User,
  Category,
  Location,
  Equipment,
  EquipmentItem,
  BorrowingItem,
  Maintenance,
  EquipmentRequest,
  roles,
  conditions,
} from "../models/index.js";
import {
  z,
  id,
  str,
  password,
  body,
  pagination,
  pathId,
  parse,
} from "../middleware/validation.js";
import { permit, operational } from "../middleware/security.js";
import {
  transaction,
  found,
  list,
  audit,
  searchRegex,
  reference,
} from "../services/common.js";
import {
  createItems,
  createItemsInSession,
  inventoryStats,
  updateItem,
} from "../services/inventory.js";
import { fail } from "../utils/errors.js";
import { config } from "../config/env.js";
import bcrypt from "bcryptjs";
import { preparePhoto } from "../services/photos.js";
export const catalog = Router();
const respond = (res, data, status = 200) => res.status(status).json({ data });
const userSchema = z.strictObject({
  name: str(100).min(1),
  email: z
    .email()
    .max(254)
    .transform((x) => x.toLowerCase()),
  password,
  phone: str(40).optional(),
  role: z.enum(roles),
});
const taxonomySchema = z.strictObject({
  name: str(100).min(1),
  description: str().optional(),
});
const equipmentSchema = z.strictObject({
  name: str(120).min(1),
  description: str().optional(),
  category: id,
  minimumStock: z.number().int().min(0).max(100000).optional(),
  totalStock: z.number().int().min(0).max(100000).optional(),
  photo: z
    .strictObject({ data: z.string().min(1).max(6990508) })
    .nullable()
    .optional(),
  imageUrl: z
    .union([
      z.literal(""),
      z
        .url()
        .max(2048)
        .refine((x) => x.startsWith("https://"), "Use an HTTPS image URL"),
    ])
    .optional(),
});
const itemSchema = z.strictObject({
  itemCode: str(80)
    .regex(/^[A-Z0-9][A-Z0-9-]*$/)
    .optional(),
  serialNumber: str(120).optional(),
  condition: z.enum(conditions).optional(),
  location: id.optional(),
  notes: str().optional(),
});
catalog.get("/users", permit("borrow"), async (req, res) => {
  const paging = pagination(req);
  res.json(
    await list(
      User,
      paging.search ? { name: searchRegex(paging.search) } : {},
      paging,
    ),
  );
});
catalog.get("/users/:id", pathId, permit("users"), async (req, res) =>
  respond(res, await found(User, req.params.id)),
);
catalog.post("/users", permit("users"), body(userSchema), async (req, res) => {
  const { password: plain, ...data } = req.input;
  const passwordHash = await bcrypt.hash(plain, 12);
  const user = await transaction(async (session) => {
    const [user] = await User.create([{ ...data, passwordHash }], { session });
    await audit(
      req.user,
      "USER_CREATED",
      "User",
      user._id,
      { role: user.role },
      session,
    );
    return user;
  });
  const safe = user.toObject();
  delete safe.passwordHash;
  respond(res, safe, 201);
});
catalog.patch(
  "/users/:id",
  pathId,
  permit("users"),
  body(userSchema.partial()),
  async (req, res) => {
    const input = { ...req.input };
    if (input.password) {
      input.passwordHash = await bcrypt.hash(input.password, 12);
      delete input.password;
    }
    const user = await transaction(async (session) => {
      const user = await found(User, req.params.id, session);
      if (
        String(user._id) === String(req.user._id) &&
        input.role &&
        input.role !== "ADMIN"
      )
        fail(409, "You cannot demote your own account");
      Object.assign(user, input);
      await user.save({ session });
      if (input.passwordHash || input.role)
        await import("../models/index.js").then(({ Session }) =>
          Session.deleteMany({ user: user._id }).session(session),
        );
      await audit(
        req.user,
        "USER_UPDATED",
        "User",
        user._id,
        { fields: Object.keys(req.input) },
        session,
      );
      return user;
    });
    const safe = user.toObject();
    delete safe.passwordHash;
    respond(res, safe);
  },
);
catalog.patch(
  "/users/:id/status",
  pathId,
  permit("users"),
  body(z.strictObject({ isActive: z.boolean() })),
  async (req, res) => {
    respond(
      res,
      await transaction(async (session) => {
        const user = await found(User, req.params.id, session);
        if (String(user._id) === String(req.user._id) && !req.input.isActive)
          fail(409, "You cannot deactivate yourself");
        user.isActive = req.input.isActive;
        await user.save({ session });
        const { Session } = await import("../models/index.js");
        await Session.deleteMany({ user: user._id }).session(session);
        await audit(
          req.user,
          "USER_STATUS_CHANGED",
          "User",
          user._id,
          req.input,
          session,
        );
        return user;
      }),
    );
  },
);
for (const [path, model, dependent, field] of [
  ["categories", Category, Equipment, "category"],
  ["locations", Location, EquipmentItem, "location"],
]) {
  catalog.get(`/${path}`, permit("inventory"), async (req, res) => {
    const paging = pagination(req);
    res.json(
      await list(
        model,
        paging.search ? { name: searchRegex(paging.search) } : {},
        paging,
      ),
    );
  });
  catalog.post(
    `/${path}`,
    permit("taxonomy"),
    body(taxonomySchema),
    async (req, res) =>
      respond(
        res,
        await transaction(async (session) => {
          const [record] = await model.create([req.input], { session });
          await audit(
            req.user,
            "CREATED",
            model.modelName,
            record._id,
            {},
            session,
          );
          return record;
        }),
        201,
      ),
  );
  catalog.patch(
    `/${path}/:id`,
    pathId,
    permit("taxonomy"),
    body(taxonomySchema.partial()),
    async (req, res) =>
      respond(
        res,
        await transaction(async (session) => {
          const record = await found(model, req.params.id, session);
          Object.assign(record, req.input);
          await record.save({ session });
          await audit(
            req.user,
            "UPDATED",
            model.modelName,
            record._id,
            req.input,
            session,
          );
          return record;
        }),
      ),
  );
  catalog.delete(
    `/${path}/:id`,
    pathId,
    permit("taxonomy"),
    async (req, res) => {
      await transaction(async (session) => {
        const record = await found(model, req.params.id, session);
        if (await dependent.exists({ [field]: record._id }).session(session))
          fail(409, "Record is in use");
        await record.deleteOne({ session });
        await audit(
          req.user,
          "DELETED",
          model.modelName,
          record._id,
          {},
          session,
        );
      });
      respond(res, { message: "Deleted" });
    },
  );
}
catalog.get("/equipment", permit("inventory"), async (req, res) => {
  const paging = pagination(req),
    filter = { archivedAt: null };
  if (paging.search) filter.name = searchRegex(paging.search);
  if (paging.category) filter.category = paging.category;
  const rows = await inventoryStats(filter);
  rows.sort((a, b) => a.name.localeCompare(b.name));
  res.json({
    data: rows.slice(
      (paging.page - 1) * paging.limit,
      paging.page * paging.limit,
    ),
    meta: {
      page: paging.page,
      limit: paging.limit,
      total: rows.length,
      pages: Math.ceil(rows.length / paging.limit),
    },
  });
});
catalog.get("/equipment/:id", pathId, permit("inventory"), async (req, res) => {
  const rows = await inventoryStats({ _id: req.params.id });
  if (!rows.length) fail(404, "Equipment not found");
  respond(res, rows[0]);
});
function equipmentResponse(record) {
  const data = record.toObject();
  delete data.photo;
  return data;
}
async function applyStock(user, record, totalStock, session) {
  if (totalStock === undefined) return;
  const existing = await EquipmentItem.countDocuments({
    equipmentId: record._id,
  }).session(session);
  if (totalStock < existing)
    fail(
      409,
      "Total stock cannot be reduced by deleting physical history. Retire individual items instead",
    );
  const quantity = totalStock - existing;
  if (quantity > 500) fail(400, "Add at most 500 physical items per operation");
  if (quantity)
    await createItemsInSession(user, record._id, { quantity }, session);
}
catalog.post(
  "/equipment",
  permit("manageInventory"),
  body(equipmentSchema),
  async (req, res) => {
    const { totalStock, photo, ...fields } = req.input;
    const prepared = await preparePhoto(photo);
    const result = await transaction(async (session) => {
      await reference(Category, fields.category, session);
      const [record] = await Equipment.create(
        [
          {
            ...fields,
            ...(prepared !== undefined
              ? { photo: prepared, hasPhoto: !!prepared }
              : {}),
          },
        ],
        { session },
      );
      await applyStock(req.user, record, totalStock, session);
      await audit(
        req.user,
        "EQUIPMENT_CREATED",
        "Equipment",
        record._id,
        { totalStock: totalStock || 0, hasPhoto: !!prepared },
        session,
      );
      return equipmentResponse(record);
    });
    respond(res, result, 201);
  },
);
catalog.patch(
  "/equipment/:id",
  pathId,
  permit("manageInventory"),
  body(equipmentSchema.partial()),
  async (req, res) => {
    const { totalStock, photo, ...fields } = req.input;
    const prepared = await preparePhoto(photo);
    const result = await transaction(async (session) => {
      const record = await found(Equipment, req.params.id, session);
      if (record.archivedAt) fail(409, "Archived equipment is read-only");
      if (fields.category) await reference(Category, fields.category, session);
      Object.assign(record, fields);
      record.revision += 1;
      if (prepared !== undefined) {
        record.photo = prepared;
        record.hasPhoto = !!prepared;
      }
      await record.save({ session });
      await applyStock(req.user, record, totalStock, session);
      await audit(
        req.user,
        "EQUIPMENT_UPDATED",
        "Equipment",
        record._id,
        { fields: Object.keys(req.input), totalStock },
        session,
      );
      return equipmentResponse(record);
    });
    respond(res, result);
  },
);
catalog.get(
  "/equipment/:id/photo",
  pathId,
  permit("inventory"),
  async (req, res) => {
    const record = await Equipment.findById(req.params.id).select("+photo");
    if (!record?.photo?.data) fail(404, "Equipment photo not found");
    res
      .set("Content-Type", record.photo.contentType)
      .set("Cache-Control", "private, no-cache")
      .send(record.photo.data);
  },
);
catalog.delete(
  "/equipment/:id",
  pathId,
  permit("manageInventory"),
  async (req, res) =>
    respond(
      res,
      await transaction(async (session) => {
        const record = await found(Equipment, req.params.id, session);
        if (
          await EquipmentItem.exists({
            equipmentId: record._id,
            status: { $in: ["BORROWED", "MAINTENANCE"] },
          }).session(session)
        )
          fail(409, "Resolve outstanding borrowing or maintenance first");
        if (
          await EquipmentRequest.exists({
            "items.equipment": record._id,
            status: { $in: ["PENDING", "APPROVED"] },
          }).session(session)
        )
          fail(409, "Resolve open requests before archiving");
        const itemIds = (
          await EquipmentItem.find({ equipmentId: record._id })
            .select("_id")
            .session(session)
        ).map((x) => x._id);
        if (
          await Maintenance.exists({
            equipmentItem: { $in: itemIds },
            status: { $ne: "COMPLETED" },
          }).session(session)
        )
          fail(409, "Resolve open maintenance records before archiving");
        const retired = await EquipmentItem.updateMany(
          { equipmentId: record._id, status: "AVAILABLE" },
          { $set: { status: "RETIRED" } },
          { session },
        );
        record.archivedAt = new Date();
        record.revision += 1;
        await record.save({ session });
        await audit(
          req.user,
          "EQUIPMENT_ARCHIVED",
          "Equipment",
          record._id,
          { retiredItems: retired.modifiedCount },
          session,
        );
        return record;
      }),
    ),
);
catalog.get(
  "/equipment/:equipmentId/items",
  pathId,
  permit("inventory"),
  async (req, res) => {
    await found(Equipment, req.params.equipmentId);
    const paging = pagination(req),
      filter = { equipmentId: req.params.equipmentId };
    if (paging.search) filter.itemCode = searchRegex(paging.search);
    if (paging.status)
      filter.status = parse(
        z.enum(["AVAILABLE", "BORROWED", "MAINTENANCE", "LOST", "RETIRED"]),
        paging.status,
      );
    res.json(await list(EquipmentItem, filter, paging, ["location"]));
  },
);
catalog.post(
  "/equipment/:equipmentId/items",
  pathId,
  permit("manageInventory"),
  body(itemSchema),
  async (req, res) =>
    respond(
      res,
      (await createItems(req.user, req.params.equipmentId, req.input))[0],
      201,
    ),
);
catalog.post(
  "/equipment/:equipmentId/items/bulk",
  pathId,
  permit("manageInventory"),
  body(
    itemSchema
      .omit({ itemCode: true, serialNumber: true })
      .extend({
        quantity: z.number().int().min(1).max(500),
        codes: z
          .array(str(80).regex(/^[A-Z0-9][A-Z0-9-]*$/))
          .max(500)
          .optional(),
      })
      .refine(
        (x) =>
          !x.codes ||
          (x.codes.length === x.quantity &&
            new Set(x.codes).size === x.codes.length),
        "Codes must be unique and match quantity",
      ),
  ),
  async (req, res) =>
    respond(
      res,
      await createItems(req.user, req.params.equipmentId, req.input),
      201,
    ),
);
catalog.get(
  "/equipment/:equipmentId/items/preview",
  pathId,
  permit("manageInventory"),
  async (req, res) => {
    const { Counter } = await import("../models/index.js");
    const record = await found(Equipment, req.params.equipmentId);
    const quantity = parse(
      z.coerce.number().int().min(1).max(500),
      req.query.quantity,
    );
    const counter = await Counter.findById(record._id);
    const prefix =
      record.name
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 20) || "ITEM";
    respond(res, {
      provisional: true,
      codes: Array.from(
        { length: quantity },
        (_, i) =>
          `${prefix}-${String(record._id).slice(-6).toUpperCase()}-${String((counter?.value || 0) + i + 1).padStart(3, "0")}`,
      ),
    });
  },
);
catalog.get("/items/:id", pathId, permit("inventory"), async (req, res) => {
  const item = await EquipmentItem.findById(req.params.id).populate(
    "equipmentId location",
  );
  if (!item) fail(404, "Item not found");
  const history = operational(req.user)
    ? await BorrowingItem.find({ equipmentItem: item._id })
        .populate({
          path: "borrowing",
          populate: { path: "user", select: "name" },
        })
        .sort({ createdAt: -1 })
        .limit(100)
    : [];
  const maintenance = operational(req.user)
    ? await Maintenance.find({ equipmentItem: item._id })
        .sort({ createdAt: -1 })
        .limit(100)
    : [];
  respond(res, { ...item.toObject(), history, maintenance });
});
catalog.patch(
  "/items/:id",
  pathId,
  permit("manageInventory"),
  body(
    itemSchema
      .omit({ itemCode: true })
      .extend({ status: z.enum(["AVAILABLE", "LOST", "RETIRED"]).optional() }),
  ),
  async (req, res) =>
    respond(res, await updateItem(req.user, req.params.id, req.input)),
);
catalog.get("/items/:id/qr", pathId, permit("inventory"), async (req, res) => {
  const item = await found(EquipmentItem, req.params.id);
  const url = new URL(`/equipment-item.html?id=${item._id}`, config.publicUrl)
    .href;
  res
    .set("Content-Type", "image/svg+xml")
    .set("Cache-Control", "private, max-age=3600")
    .send(
      await QRCode.toString(url, {
        type: "svg",
        errorCorrectionLevel: "M",
        margin: 2,
      }),
    );
});
