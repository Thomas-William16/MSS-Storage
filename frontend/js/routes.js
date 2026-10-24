import { admin, manager } from "./api.js";

const catalog = () => import("./catalog-pages.jsx");
const workflows = () => import("./workflow-pages.jsx");
const reports = () => import("./report-pages.jsx");
const view = (module, name) => () => module().then((exports) => exports[name]);

export const routes = {
  "index.html": { title: "Overview", load: view(reports, "DashboardPage") },
  "dashboard.html": { title: "Overview", load: view(reports, "DashboardPage") },
  "equipment.html": {
    title: "Equipment",
    load: view(catalog, "EquipmentPage"),
  },
  "equipment-details.html": {
    title: "Equipment details",
    load: view(catalog, "EquipmentDetailPage"),
  },
  "equipment-item.html": {
    title: "Equipment item",
    load: view(catalog, "ItemPage"),
  },
  "borrowings.html": {
    title: "Borrowings",
    load: view(workflows, "BorrowingsPage"),
  },
  "requests.html": { title: "Requests", load: view(workflows, "RequestsPage") },
  "maintenance.html": {
    title: "Maintenance",
    load: view(workflows, "MaintenancePage"),
  },
  "users.html": {
    title: "Users",
    load: view(catalog, "UsersPage"),
    canAccess: admin,
  },
  "reports.html": {
    title: "Reports",
    load: view(reports, "ReportsPage"),
    canAccess: manager,
  },
  "audit-logs.html": {
    title: "Audit trail",
    load: view(reports, "AuditPage"),
    canAccess: admin,
  },
  "settings.html": { title: "Settings", load: view(reports, "SettingsPage") },
};

// Warm only the module, never authenticated API data or inventory counts.
export function preloadRoute(page) {
  const route = routes[page];
  if (route && (!route.canAccess || route.canAccess()))
    route.load().catch(() => {});
}
