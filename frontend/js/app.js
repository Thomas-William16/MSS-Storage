import "./preferences.js";
import { session, logout, manager, admin, currentUser } from "./api.js";
import { el, button, toast } from "./dom.js";
import {
  equipmentView,
  equipmentDetail,
  itemDetail,
  taxonomyView,
  usersView,
} from "./catalog.js";
import { borrowingsView, requestsView, maintenanceView } from "./workflows.js";
import {
  dashboardView,
  reportsView,
  auditView,
  settingsView,
} from "./reports.js";
const page = location.pathname.split("/").pop() || "index.html";
const nav = [
  ["dashboard.html", "Overview", "◈"],
  ["equipment.html", "Equipment", "▦"],
  ["borrowings.html", "Borrowings", "⇄"],
  ["requests.html", "Requests", "☷"],
  ["maintenance.html", "Maintenance", "⚒"],
  ["categories.html", "Categories", "⊞"],
];
const root = document.getElementById("content");
try {
  await session();
  if (manager()) nav.push(["reports.html", "Reports", "▥"]);
  if (admin())
    nav.push(
      ["users.html", "Users", "♧"],
      ["audit-logs.html", "Audit trail", "≡"],
    );
  nav.push(["settings.html", "Settings", "⚙"]);
  document.getElementById("navigation").replaceChildren(
    ...nav.map(([href, label, icon]) =>
      el(
        "a",
        {
          href,
          class:
            page === href ||
            (page === "index.html" && href === "dashboard.html")
              ? "nav-link active"
              : "nav-link",
        },
        el("span", { "aria-hidden": "true" }, icon),
        label,
      ),
    ),
  );
  const initials = currentUser.name
    .split(" ")
    .map((x) => x[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  document
    .getElementById("account")
    .replaceChildren(
      el("span", { class: "avatar" }, initials),
      el(
        "span",
        { class: "account-name" },
        currentUser.name,
        el("small", {}, currentUser.role.replaceAll("_", " ")),
      ),
      button("Sign out", logout),
    );
  document.getElementById("menu-toggle").addEventListener("click", (event) => {
    const expanded = document.body.classList.toggle("menu-open");
    event.currentTarget.setAttribute("aria-expanded", String(expanded));
  });
  const id = new URLSearchParams(location.search).get("id");
  root.replaceChildren();
  if (["index.html", "dashboard.html"].includes(page))
    await dashboardView(root);
  else if (page === "equipment.html") await equipmentView(root);
  else if (page === "equipment-details.html") await equipmentDetail(root, id);
  else if (page === "equipment-item.html") await itemDetail(root, id);
  else if (page === "borrowings.html") await borrowingsView(root, id);
  else if (page === "requests.html") await requestsView(root, id);
  else if (page === "maintenance.html") await maintenanceView(root);
  else if (page === "categories.html")
    await taxonomyView(root, page.split(".")[0]);
  else if (page === "users.html") {
    if (!admin()) throw new Error("Administrator access required");
    await usersView(root);
  } else if (page === "reports.html") {
    if (!manager()) throw new Error("Operational access required");
    await reportsView(root);
  } else if (page === "audit-logs.html") {
    if (!admin()) throw new Error("Administrator access required");
    await auditView(root);
  } else if (page === "settings.html") await settingsView(root);
} catch (error) {
  if (
    error.message.includes("Authentication") ||
    error.message.includes("Session expired") ||
    error.message.includes("Account unavailable")
  )
    location.replace("/login.html");
  else
    root.replaceChildren(
      el("div", { class: "panel form-error", role: "alert" }, error.message),
    );
}
