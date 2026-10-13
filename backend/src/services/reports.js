import mongoose from "mongoose";
import {
  Equipment,
  EquipmentItem,
  Borrowing,
  BorrowingItem,
  EquipmentRequest,
  Maintenance,
  AuditLog,
} from "../models/index.js";
import { inventoryStats } from "./inventory.js";
import { list } from "./common.js";
export async function dashboard(user, operations) {
  const rows = await inventoryStats({ archivedAt: null });
  const total = await EquipmentItem.aggregate([
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);
  const counts = Object.fromEntries(total.map((x) => [x._id, x.count]));
  const scope = operations ? {} : { user: user._id };
  const [overdue, recentBorrowings, pendingRequests, recentActivity] =
    await Promise.all([
      Borrowing.countDocuments({
        ...scope,
        status: { $in: ["ACTIVE", "PARTIAL"] },
        expectedReturnDate: { $lt: new Date() },
      }),
      Borrowing.find(scope)
        .populate("user", "name role")
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
      EquipmentRequest.countDocuments({
        ...(operations ? {} : { requestedBy: user._id }),
        status: "PENDING",
      }),
      operations
        ? AuditLog.find({})
            .populate("user", "name")
            .sort({ timestamp: -1 })
            .limit(8)
            .lean()
        : Promise.resolve([]),
    ]);
  return {
    equipmentTypes: rows.length,
    physicalItems: Object.values(counts).reduce((a, b) => a + b, 0),
    counts,
    overdue,
    pendingRequests,
    lowStock: rows.filter((x) => x.counts.available < x.minimumStock),
    recentBorrowings,
    recentActivity,
  };
}
export async function report(type, paging) {
  const dates =
    paging.from || paging.to
      ? {
          createdAt: {
            ...(paging.from ? { $gte: paging.from } : {}),
            ...(paging.to ? { $lte: paging.to } : {}),
          },
        }
      : {};
  let equipmentIds;
  if (paging.category)
    equipmentIds = (
      await Equipment.find({ category: paging.category }).select("_id")
    ).map((x) => x._id);
  if (type === "inventory") {
    const rows = await inventoryStats({
      ...dates,
      ...(paging.category ? { category: paging.category } : {}),
    });
    return {
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
    };
  }
  if (["lost", "damaged"].includes(type))
    return list(
      EquipmentItem,
      {
        ...dates,
        ...(equipmentIds ? { equipmentId: { $in: equipmentIds } } : {}),
        ...(type === "lost" ? { status: "LOST" } : { condition: "DAMAGED" }),
      },
      paging,
      ["equipmentId"],
    );
  if (type === "maintenance") {
    const itemIds = equipmentIds
      ? (
          await EquipmentItem.find({
            equipmentId: { $in: equipmentIds },
          }).select("_id")
        ).map((x) => x._id)
      : null;
    return list(
      Maintenance,
      { ...dates, ...(itemIds ? { equipmentItem: { $in: itemIds } } : {}) },
      paging,
      [{ path: "equipmentItem", populate: { path: "equipmentId" } }],
    );
  }
  if (type === "most-borrowed") {
    const pipeline = [
      { $match: dates },
      {
        $lookup: {
          from: "equipmentitems",
          localField: "equipmentItem",
          foreignField: "_id",
          as: "item",
        },
      },
      { $unwind: "$item" },
      ...(equipmentIds
        ? [{ $match: { "item.equipmentId": { $in: equipmentIds } } }]
        : []),
      { $group: { _id: "$item.equipmentId", borrowCount: { $sum: 1 } } },
      {
        $lookup: {
          from: "equipments",
          localField: "_id",
          foreignField: "_id",
          as: "equipment",
        },
      },
      { $unwind: "$equipment" },
      { $sort: { borrowCount: -1, _id: 1 } },
    ];
    const rows = await BorrowingItem.aggregate(pipeline);
    return {
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
    };
  }
  let borrowingIds;
  if (equipmentIds) {
    const itemIds = (
      await EquipmentItem.find({ equipmentId: { $in: equipmentIds } }).select(
        "_id",
      )
    ).map((x) => x._id);
    borrowingIds = await BorrowingItem.distinct("borrowing", {
      equipmentItem: { $in: itemIds },
    });
  }
  return list(
    Borrowing,
    {
      ...dates,
      ...(borrowingIds ? { _id: { $in: borrowingIds } } : {}),
      ...(type === "overdue"
        ? {
            status: { $in: ["ACTIVE", "PARTIAL"] },
            expectedReturnDate: { $lt: new Date() },
          }
        : {}),
    },
    paging,
    ["user", "borrowedBy"],
  );
}
export function csvCell(value) {
  let text = String(value ?? "");
  if (/^[\s]*[=+@\-\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
export function csvReport(type, rows) {
  const columns =
    type === "inventory"
      ? [
          "name",
          "category",
          "total",
          "available",
          "borrowed",
          "maintenance",
          "lost",
          "retired",
          "damaged",
        ]
      : type === "most-borrowed"
        ? ["equipment", "borrowCount"]
        : [
            "id",
            "name",
            "status",
            "condition",
            "user",
            "date",
            "cost",
            "notes",
          ];
  const normalized = rows.map((x) =>
    type === "inventory"
      ? { name: x.name, category: x.category?.name, ...x.counts }
      : type === "most-borrowed"
        ? { equipment: x.equipment.name, borrowCount: x.borrowCount }
        : {
            id: x._id,
            name: x.itemCode || x.equipmentItem?.itemCode || "",
            status: x.status,
            condition: x.condition || "",
            user: x.user?.name || "",
            date: x.createdAt?.toISOString?.() || x.createdAt,
            cost: x.cost ?? "",
            notes: x.notes || x.description || x.purpose || "",
          },
  );
  return [
    columns.map(csvCell).join(","),
    ...normalized.map((x) => columns.map((c) => csvCell(x[c])).join(",")),
  ].join("\r\n");
}
