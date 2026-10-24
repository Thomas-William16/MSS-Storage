import { admin, manager } from "./api.js";

const catalog = () => import("./catalog-pages.jsx");
const workflows = () => import("./workflow-pages.jsx");
const reports = () => import("./report-pages.jsx");
const view = (module, name) => () => module().then((exports) => exports[name]);

export const routes = {
  "index.html": ["Overview", view(reports, "DashboardPage")],
  "dashboard.html": ["Overview", view(reports, "DashboardPage")],
  "equipment.html": ["Equipment", view(catalog, "EquipmentPage")],
  "equipment-details.html": [
    "Equipment details",
    view(catalog, "EquipmentDetailPage"),
  ],
  "equipment-item.html": ["Equipment item", view(catalog, "ItemPage")],
  "borrowings.html": ["Borrowings", view(workflows, "BorrowingsPage")],
  "requests.html": ["Requests", view(workflows, "RequestsPage")],
  "maintenance.html": ["Maintenance", view(workflows, "MaintenancePage")],
  "users.html": ["Users", view(catalog, "UsersPage"), admin],
  "reports.html": ["Reports", view(reports, "ReportsPage"), manager],
  "audit-logs.html": ["Audit trail", view(reports, "AuditPage"), admin],
  "settings.html": ["Settings", view(reports, "SettingsPage")],
};

// Warm only the module, never authenticated API data or inventory counts.
export function preloadRoute(page) {
  const route = routes[page];
  if (route && (!route[2] || route[2]())) route[1]().catch(() => {});
}
