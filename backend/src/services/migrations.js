import { User, Session, AuditLog } from "../models/index.js";
import { transaction } from "./common.js";
// Existing leader accounts keep their identity and history, with scout permissions.
export async function migrateLeaderAccounts() {
  return transaction(async (session) => {
    const users = await User.find({ role: "LEADER" })
      .select("_id")
      .session(session);
    if (!users.length) return 0;
    const ids = users.map((user) => user._id);
    await User.updateMany(
      { _id: { $in: ids }, role: "LEADER" },
      { $set: { role: "SCOUT" } },
      { session },
    );
    await Session.deleteMany({ user: { $in: ids } }).session(session);
    await AuditLog.create(
      [
        {
          action: "LEADER_ACCOUNTS_MIGRATED",
          entity: "User",
          details: { userIds: ids, role: "SCOUT" },
        },
      ],
      { session },
    );
    return ids.length;
  });
}
