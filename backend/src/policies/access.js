import { fail } from "../utils/errors.js";
export const permissionMatrix = {
  inventory: ["ADMIN", "STORAGE_KEEPER", "SCOUT"],
  manageInventory: ["ADMIN", "STORAGE_KEEPER"],
  borrow: ["ADMIN", "STORAGE_KEEPER"],
  requests: ["ADMIN", "STORAGE_KEEPER", "SCOUT"],
  reviewRequests: ["ADMIN", "STORAGE_KEEPER"],
  maintenance: ["ADMIN", "STORAGE_KEEPER"],
  reportDamage: ["ADMIN", "STORAGE_KEEPER", "SCOUT"],
  reports: ["ADMIN", "STORAGE_KEEPER"],
  users: ["ADMIN"],
  taxonomy: ["ADMIN"],
  audit: ["ADMIN"],
};
export const operational = (user) =>
  ["ADMIN", "STORAGE_KEEPER"].includes(user.role);
export function own(record, user, field = "user") {
  if (
    !operational(user) &&
    String(record[field]?._id || record[field]) !== String(user._id)
  )
    fail(403, "Permission denied");
}
