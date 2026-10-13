import { api, all, download, manager, admin, currentUser } from "./api.js";
import {
  el,
  button,
  badge,
  fmt,
  short,
  table,
  link,
  header,
  panel,
  stat,
  toast,
} from "./dom.js";
import { pagedList } from "./lists.js";
export async function dashboardView(root) {
  const { data } = await api("/reports/dashboard");
  const hour = new Date().getHours();
  root.append(
    header(
      "Storage overview",
      `Good ${hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening"}, ${currentUser.name}. Here’s the latest from your storage.`,
    ),
  );
  root.append(
    el(
      "div",
      { class: "stats" },
      stat(
        "Physical items",
        data.physicalItems,
        `${data.equipmentTypes} equipment types`,
      ),
      stat(
        "Available",
        data.counts.AVAILABLE || 0,
        "Ready for the next adventure",
      ),
      stat(
        "Borrowed",
        data.counts.BORROWED || 0,
        "Currently out with the group",
      ),
      stat(
        "Maintenance",
        data.counts.MAINTENANCE || 0,
        "Awaiting repair or inspection",
      ),
    ),
  );
  root.append(
    el(
      "div",
      { class: "dashboard-grid" },
      panel(
        "Attention needed",
        el(
          "div",
          { class: "attention-row" },
          el(
            "div",
            {},
            el("strong", {}, data.overdue),
            el(
              "p",
              {},
              manager() ? "Overdue borrowings" : "My overdue borrowings",
            ),
          ),
          link("Review borrowings →", "/borrowings.html"),
        ),
        el(
          "div",
          { class: "attention-row" },
          el(
            "div",
            {},
            el("strong", {}, data.pendingRequests),
            el("p", {}, manager() ? "Pending requests" : "My pending requests"),
          ),
          link("View requests →", "/requests.html"),
        ),
        el(
          "div",
          { class: "attention-row" },
          el(
            "div",
            {},
            el("strong", {}, data.counts.LOST || 0),
            el("p", {}, "Lost items"),
          ),
          manager()
            ? link("View lost report →", "/reports.html?type=lost")
            : null,
        ),
      ),
      panel(
        "Low-stock equipment",
        table(
          [
            {
              label: "Equipment",
              render: (x) =>
                link(x.name, `/equipment-details.html?id=${x._id}`),
            },
            { label: "Available", render: (x) => badge(x.counts.available) },
            { label: "Minimum", key: "minimumStock" },
          ],
          data.lowStock,
        ),
      ),
    ),
  );
  root.append(
    panel(
      manager() ? "Recent borrowings" : "My recent borrowings",
      table(
        [
          {
            label: "Reference",
            render: (x) =>
              link(`BR-${short(x._id)}`, `/borrowings.html?id=${x._id}`),
          },
          { label: "Borrower", render: (x) => x.user?.name },
          { label: "Purpose", key: "purpose" },
          { label: "Due", render: (x) => fmt(x.expectedReturnDate) },
          { label: "Status", render: (x) => badge(x.status) },
        ],
        data.recentBorrowings,
      ),
    ),
  );
  if (manager())
    root.append(
      panel(
        "Recent activity",
        el(
          "div",
          { class: "activity-feed" },
          data.recentActivity.map((x) =>
            el(
              "div",
              { class: "activity" },
              el("span", { class: "activity-dot" }),
              el(
                "div",
                {},
                el("strong", {}, x.action.replaceAll("_", " ")),
                el(
                  "small",
                  { class: "subline" },
                  `${x.user?.name || "System"} · ${fmt(x.timestamp)}`,
                ),
              ),
            ),
          ),
        ),
      ),
    );
}
export async function reportsView(root) {
  const categories = await all("/categories");
  let page = 1;
  const type = el(
    "select",
    { "aria-label": "Report type" },
    [
      "inventory",
      "borrowings",
      "overdue",
      "damaged",
      "lost",
      "maintenance",
      "most-borrowed",
    ].map((value) =>
      el("option", { value }, value.replaceAll("-", " ").toUpperCase()),
    ),
  );
  type.value = new URLSearchParams(location.search).get("type") || "inventory";
  const category = el(
      "select",
      { "aria-label": "Category" },
      el("option", { value: "" }, "All categories"),
      categories.map((x) => el("option", { value: x._id }, x.name)),
    ),
    from = el("input", { type: "date", "aria-label": "From date" }),
    to = el("input", { type: "date", "aria-label": "Through date" }),
    body = el("div"),
    pager = el("div", { class: "pagination" });
  function query() {
    const q = new URLSearchParams({ page, limit: 25 });
    if (category.value) q.set("category", category.value);
    if (from.value)
      q.set("from", new Date(`${from.value}T00:00:00`).toISOString());
    if (to.value)
      q.set("to", new Date(`${to.value}T23:59:59.999`).toISOString());
    return q;
  }
  async function load() {
    body.replaceChildren(el("p", { role: "status" }, "Loading report…"));
    try {
      const result = await api(`/reports/${type.value}?${query()}`);
      const columns =
        type.value === "inventory"
          ? [
              { label: "Equipment", key: "name" },
              { label: "Category", render: (x) => x.category?.name },
              ...[
                "total",
                "available",
                "borrowed",
                "maintenance",
                "lost",
                "retired",
                "damaged",
              ].map((key) => ({ label: key, render: (x) => x.counts[key] })),
            ]
          : type.value === "most-borrowed"
            ? [
                { label: "Equipment", render: (x) => x.equipment.name },
                { label: "Times borrowed", key: "borrowCount" },
              ]
            : ["borrowings", "overdue"].includes(type.value)
              ? [
                  {
                    label: "Reference",
                    render: (x) =>
                      link(short(x._id), `/borrowings.html?id=${x._id}`),
                  },
                  { label: "Borrower", render: (x) => x.user?.name },
                  { label: "Due", render: (x) => fmt(x.expectedReturnDate) },
                  { label: "Status", render: (x) => badge(x.status) },
                  { label: "Purpose", key: "purpose" },
                ]
              : type.value === "maintenance"
                ? [
                    { label: "Item", render: (x) => x.equipmentItem?.itemCode },
                    { label: "Description", key: "description" },
                    { label: "Status", render: (x) => badge(x.status) },
                    { label: "Cost", key: "cost" },
                  ]
                : [
                    {
                      label: "Item",
                      render: (x) =>
                        link(x.itemCode, `/equipment-item.html?id=${x._id}`),
                    },
                    { label: "Equipment", render: (x) => x.equipmentId?.name },
                    { label: "Condition", render: (x) => badge(x.condition) },
                    { label: "Status", render: (x) => badge(x.status) },
                  ];
      body.replaceChildren(table(columns, result.data));
      pager.replaceChildren(
        el(
          "span",
          { class: "muted" },
          `${result.meta.total} records · Page ${page} of ${result.meta.pages || 1}`,
        ),
      );
      if (page > 1)
        pager.append(
          button("Previous", () => {
            page--;
            return load();
          }),
        );
      if (page < result.meta.pages)
        pager.append(
          button("Next", () => {
            page++;
            return load();
          }),
        );
    } catch (error) {
      body.replaceChildren(
        el("p", { class: "form-error", role: "alert" }, error.message),
      );
    }
  }
  const controls = el(
    "form",
    {
      class: "toolbar",
      onSubmit: (event) => {
        event.preventDefault();
        page = 1;
        load();
      },
    },
    type,
    category,
    field("From", from),
    field("Through", to),
    el("button", { class: "button primary", type: "submit" }, "Apply filters"),
  );
  root.append(
    header(
      "Reports",
      "Review operational data and export the current page as a safe CSV.",
      button("Export current page", () =>
        download(
          `/reports/${type.value}?${query()}&format=csv`,
          `${type.value}-page-${page}.csv`,
        ),
      ),
    ),
    panel("Report explorer", controls, body, pager),
  );
  await load();
}
function field(label, input) {
  return el("label", { class: "inline-field" }, el("span", {}, label), input);
}
export async function auditView(root) {
  root.append(
    header(
      "Audit trail",
      "A record of account access and important inventory changes.",
    ),
  );
  const container = panel("Activity log");
  root.append(container);
  pagedList(container, {
    path: "/audit-logs",
    search: false,
    columns: [
      { label: "Time", render: (x) => fmt(x.timestamp) },
      { label: "User", render: (x) => x.user?.name || "System" },
      { label: "Action", render: (x) => badge(x.action) },
      { label: "Entity", key: "entity" },
      { label: "Reference", render: (x) => short(x.entityId) },
      {
        label: "Details",
        render: (x) => el("code", {}, JSON.stringify(x.details || {})),
      },
    ],
  });
}
export async function settingsView(root) {
  root.append(
    header(
      "Account & system",
      "Your account information and deployment configuration.",
    ),
    panel(
      "My account",
      el(
        "dl",
        {},
        el("dt", {}, "Name"),
        el("dd", {}, currentUser.name),
        el("dt", {}, "Email"),
        el("dd", {}, currentUser.email),
        el("dt", {}, "Role"),
        el("dd", {}, badge(currentUser.role)),
      ),
      el(
        "p",
        { class: "muted" },
        "Contact an administrator to change your account or password.",
      ),
    ),
  );
  if (admin())
    root.append(
      panel(
        "System configuration",
        el(
          "p",
          {},
          "Database access, public URLs, CORS origins and cookie policy are configured through backend environment variables. Follow the deployment guide in the repository README.",
        ),
        link("Manage user accounts", "/users.html"),
      ),
    );
}
