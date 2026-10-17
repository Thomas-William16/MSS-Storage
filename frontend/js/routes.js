import { admin, manager } from "./api.js";

const catalog = () => import("./catalog.js");
const workflows = () => import("./workflows.js");
const reports = () => import("./reports.js");
const view = (module, name) => () => module().then((exports) => exports[name]);

export const routes = {
  "index.html": ["Overview", view(reports, "dashboardView")],
  "dashboard.html": ["Overview", view(reports, "dashboardView")],
  "equipment.html": ["Equipment", view(catalog, "equipmentView")],
  "equipment-details.html": [
    "Equipment details",
    view(catalog, "equipmentDetail"),
  ],
  "equipment-item.html": ["Equipment item", view(catalog, "itemDetail")],
  "borrowings.html": ["Borrowings", view(workflows, "borrowingsView")],
  "requests.html": ["Requests", view(workflows, "requestsView")],
  "maintenance.html": ["Maintenance", view(workflows, "maintenanceView")],
  "users.html": ["Users", view(catalog, "usersView"), admin],
  "reports.html": ["Reports", view(reports, "reportsView"), manager],
  "audit-logs.html": ["Audit trail", view(reports, "auditView"), admin],
  "settings.html": ["Settings", view(reports, "settingsView")],
};

// Warm only the module, never authenticated API data or inventory counts.
export function preloadRoute(page) {
  const route = routes[page];
  if (route && (!route[2] || route[2]())) route[1]().catch(() => {});
}
