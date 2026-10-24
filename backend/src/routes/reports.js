import { Router } from "express";
import { AuditLog } from "../models/index.js";
import { permit } from "../middleware/security.js";
import { operational } from "../policies/access.js";
import { pagination, z, parse } from "../middleware/validation.js";
import { list } from "../services/common.js";
import { dashboard, report, csvReport } from "../services/reports.js";
export const reports = Router();
reports.get("/reports/dashboard", permit("inventory"), async (req, res) =>
  res.json({ data: await dashboard(req.user, operational(req.user)) }),
);
reports.get("/reports/:type", permit("reports"), async (req, res) => {
  const type = parse(
      z.enum([
        "inventory",
        "borrowings",
        "overdue",
        "damaged",
        "lost",
        "maintenance",
        "most-borrowed",
      ]),
      req.params.type,
    ),
    paging = pagination(req);
  const result = await report(type, paging);
  if (req.query.format === "csv")
    res
      .type("text/csv")
      .attachment(`${type}-page-${paging.page}.csv`)
      .send(csvReport(type, result.data));
  else res.json(result);
});
reports.get("/audit-logs", permit("audit"), async (req, res) => {
  const paging = pagination(req),
    filter = {};
  if (paging.from || paging.to)
    filter.timestamp = {
      ...(paging.from ? { $gte: paging.from } : {}),
      ...(paging.to ? { $lte: paging.to } : {}),
    };
  res.json(await list(AuditLog, filter, paging, ["user"]));
});
