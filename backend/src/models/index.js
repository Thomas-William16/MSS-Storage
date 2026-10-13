import mongoose from "mongoose";
const { Schema } = mongoose;
const ref = (model, required = true) => ({
  type: Schema.Types.ObjectId,
  ref: model,
  required,
});
const text = (max = 2000) => ({ type: String, default: "", maxlength: max });
const make = (name, fields, indexes = []) => {
  const schema = new Schema(fields, { timestamps: true, strict: "throw" });
  for (const [keys, options] of indexes) schema.index(keys, options);
  return mongoose.model(name, schema);
};
export const roles = ["ADMIN", "STORAGE_KEEPER", "LEADER", "SCOUT"];
export const conditions = ["NEW", "GOOD", "FAIR", "DAMAGED"];
export const statuses = [
  "AVAILABLE",
  "BORROWED",
  "MAINTENANCE",
  "LOST",
  "RETIRED",
];
export const User = make(
  "User",
  {
    name: { type: String, required: true, maxlength: 100 },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    passwordHash: { type: String, required: true, select: false },
    phone: text(40),
    role: { type: String, enum: roles, default: "SCOUT" },
    isActive: { type: Boolean, default: true },
    revision: { type: Number, default: 0 },
  },
  [[{ email: 1 }, { unique: true }]],
);
export const Category = make(
  "Category",
  {
    name: { type: String, required: true, maxlength: 100 },
    description: text(),
    revision: { type: Number, default: 0 },
  },
  [[{ name: 1 }, { unique: true }]],
);
export const Location = make(
  "Location",
  {
    name: { type: String, required: true, maxlength: 100 },
    description: text(),
    revision: { type: Number, default: 0 },
  },
  [[{ name: 1 }, { unique: true }]],
);
export const Equipment = make(
  "Equipment",
  {
    name: { type: String, required: true, maxlength: 120 },
    description: text(),
    category: ref("Category"),
    minimumStock: { type: Number, min: 0, default: 0 },
    imageUrl: text(2048),
    archivedAt: { type: Date, default: null },
    revision: { type: Number, default: 0 },
  },
  [[{ category: 1, archivedAt: 1 }, {}]],
);
export const EquipmentItem = make(
  "EquipmentItem",
  {
    equipmentId: ref("Equipment"),
    itemCode: { type: String, required: true, maxlength: 80 },
    serialNumber: text(120),
    condition: { type: String, enum: conditions, default: "GOOD" },
    status: { type: String, enum: statuses, default: "AVAILABLE" },
    location: ref("Location", false),
    notes: text(),
  },
  [
    [{ itemCode: 1 }, { unique: true }],
    [{ equipmentId: 1, status: 1 }, {}],
  ],
);
export const Borrowing = make(
  "Borrowing",
  {
    user: ref("User"),
    borrowedBy: ref("User"),
    borrowDate: { type: Date, default: Date.now },
    expectedReturnDate: { type: Date, required: true },
    actualReturnDate: Date,
    status: {
      type: String,
      enum: ["ACTIVE", "PARTIAL", "RETURNED", "CANCELLED"],
      default: "ACTIVE",
    },
    purpose: text(500),
    notes: text(),
    request: ref("EquipmentRequest", false),
  },
  [
    [{ user: 1, createdAt: -1 }, {}],
    [{ status: 1, expectedReturnDate: 1 }, {}],
    [
      { request: 1 },
      {
        unique: true,
        partialFilterExpression: { request: { $type: "objectId" } },
      },
    ],
  ],
);
export const BorrowingItem = make(
  "BorrowingItem",
  {
    borrowing: ref("Borrowing"),
    equipmentItem: ref("EquipmentItem"),
    conditionBefore: { type: String, enum: conditions, required: true },
    conditionAfter: { type: String, enum: conditions },
    returnedAt: Date,
    resolution: { type: String, enum: ["RETURNED", "LOST", "CANCELLED"] },
    notes: text(),
  },
  [
    [{ borrowing: 1, equipmentItem: 1 }, { unique: true }],
    [{ equipmentItem: 1 }, {}],
  ],
);
const requestedItem = new Schema(
  {
    equipment: ref("Equipment"),
    quantity: { type: Number, required: true, min: 1, max: 500 },
  },
  { _id: false },
);
export const EquipmentRequest = make(
  "EquipmentRequest",
  {
    requestedBy: ref("User"),
    items: { type: [requestedItem], required: true },
    requestDate: { type: Date, default: Date.now },
    neededFrom: { type: Date, required: true },
    neededUntil: { type: Date, required: true },
    purpose: text(500),
    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED", "CANCELLED", "ISSUED"],
      default: "PENDING",
    },
    approvedBy: ref("User", false),
    approvedAt: Date,
    notes: text(),
    history: [{ status: String, user: ref("User"), at: Date, notes: String }],
  },
  [
    [{ requestedBy: 1, createdAt: -1 }, {}],
    [{ status: 1 }, {}],
  ],
);
export const Maintenance = make(
  "Maintenance",
  {
    equipmentItem: ref("EquipmentItem"),
    reportedBy: ref("User"),
    description: { type: String, required: true, maxlength: 2000 },
    status: {
      type: String,
      enum: ["OPEN", "IN_PROGRESS", "COMPLETED"],
      default: "OPEN",
    },
    cost: { type: Number, min: 0, default: 0 },
    startedAt: { type: Date, default: Date.now },
    completedAt: Date,
    notes: text(),
  },
  [
    [
      { equipmentItem: 1 },
      {
        unique: true,
        partialFilterExpression: { status: { $in: ["OPEN", "IN_PROGRESS"] } },
      },
    ],
  ],
);
export const AuditLog = make(
  "AuditLog",
  {
    user: ref("User", false),
    action: { type: String, required: true },
    entity: { type: String, required: true },
    entityId: Schema.Types.ObjectId,
    details: Schema.Types.Mixed,
    timestamp: { type: Date, default: Date.now },
  },
  [[{ timestamp: -1 }, {}]],
);
export const Session = make(
  "Session",
  {
    user: ref("User"),
    tokenHash: { type: String, required: true },
    csrf: { type: String, required: true },
    expiresAt: { type: Date, required: true },
  },
  [
    [{ tokenHash: 1 }, { unique: true }],
    [{ expiresAt: 1 }, { expireAfterSeconds: 0 }],
  ],
);
export const Counter = make("Counter", {
  _id: String,
  value: { type: Number, default: 0 },
});
