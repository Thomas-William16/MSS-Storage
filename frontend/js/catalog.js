import { api, all, manager, admin, download } from "./api.js";
import {
  el,
  button,
  badge,
  fmt,
  short,
  table,
  actions,
  link,
  header,
  panel,
  formModal,
  confirmAction,
  toast,
} from "./dom.js";
import { pagedList } from "./lists.js";
const conditions = ["NEW", "GOOD", "FAIR", "DAMAGED"].map((value) => ({
  value,
  label: value,
}));
const optionRows = (rows) => rows.map((x) => ({ value: x._id, label: x.name }));
export async function equipmentView(root) {
  const categories = await all("/categories");
  let reload;
  async function edit(record = {}) {
    formModal(
      record._id ? "Edit equipment" : "New equipment",
      [
        {
          name: "name",
          label: "Equipment name",
          value: record.name,
          maxLength: 120,
        },
        {
          name: "category",
          label: "Category",
          type: "select",
          value: record.category?._id,
          options: optionRows(categories),
        },
        {
          name: "description",
          label: "Description",
          type: "textarea",
          value: record.description,
        },
        {
          name: "totalStock",
          label: "Total stock",
          type: "number",
          min: record._id ? record.counts?.total || 0 : 1,
          max: (record.counts?.total || 0) + 500,
          value: record._id ? record.counts?.total || 0 : 1,
          hint: record._id
            ? "Increase to add physical items. Existing items and their history are kept."
            : "Creates this many individually coded items, immediately available to borrow.",
        },
      ],
      async (data) => {
        await api(record._id ? `/equipment/${record._id}` : "/equipment", {
          method: record._id ? "PATCH" : "POST",
          body: data,
        });
        await reload();
      },
    );
  }
  root.append(
    header(
      "Equipment",
      "Manage equipment types and track each physical item.",
      ...(manager()
        ? [button("＋ New equipment", () => edit(), "primary")]
        : []),
    ),
  );
  const container = panel("Equipment inventory");
  root.append(container);
  reload = pagedList(container, {
    path: "/equipment",
    filters: [
      {
        name: "category",
        label: "All categories",
        options: optionRows(categories),
      },
    ],
    columns: [
      {
        label: "Equipment",
        render: (x) =>
          el(
            "div",
            { class: "equipment-cell" },
            el(
              "div",
              {},
              link(x.name, `/equipment-details.html?id=${x._id}`),
              el("small", { class: "subline" }, x.description),
            ),
          ),
      },
      { label: "Category", render: (x) => x.category?.name },
      { label: "Total", render: (x) => x.counts.total },
      { label: "Available", render: (x) => badge(x.counts.available) },
      { label: "Borrowed", render: (x) => x.counts.borrowed },
      { label: "Maintenance", render: (x) => x.counts.maintenance },
      {
        label: "Actions",
        render: (x) =>
          manager()
            ? actions(
                button("Edit", () => edit(x)),
                button("Archive", () =>
                  confirmAction(
                    "Archive equipment?",
                    `Retire available items, keep the history for ${x.name}, and hide it from the active catalog.`,
                    async () => {
                      await api(`/equipment/${x._id}`, { method: "DELETE" });
                      await reload();
                    },
                  ),
                ),
              )
            : link("View items", `/equipment-details.html?id=${x._id}`),
      },
    ],
  });
}
export async function equipmentDetail(root, id) {
  const { data: record } = await api(`/equipment/${id}`);
  let reload;
  async function batch() {
    formModal(
      "Add physical items",
      [
        {
          name: "quantity",
          label: "Quantity",
          type: "number",
          min: 1,
          max: 500,
          value: 1,
        },
        {
          name: "condition",
          label: "Initial condition",
          type: "select",
          options: conditions,
          value: "GOOD",
        },
        { name: "notes", label: "Notes", type: "textarea" },
        {
          name: "codes",
          label: "Optional custom codes (one per line)",
          type: "textarea",
          hint: "Uppercase letters, digits and hyphens. Leave empty to generate codes.",
        },
      ],
      async (data) => {
        if (data.codes) data.codes = data.codes.split(/\s+/).filter(Boolean);
        else delete data.codes;
        const preview = await api(
          `/equipment/${id}/items/preview?quantity=${data.quantity}`,
        );
        const review = data.codes || preview.data.codes;
        if (
          !(await confirmAction(
            "Review item batch",
            `${data.quantity} items, ${data.condition}. Codes: ${review.join(", ")}. Automatically generated codes are provisional until creation.`,
            async () => {},
          ))
        )
          throw new Error("Batch creation cancelled");
        const result = await api(`/equipment/${id}/items/bulk`, {
          method: "POST",
          body: data,
        });
        toast(`Created ${result.data.length} physical items`);
        await reload();
      },
      { submit: "Review batch" },
    );
  }
  root.append(
    header(
      record.name,
      record.description || "Physical item inventory",
      ...(manager() && !record.archivedAt
        ? [button("＋ Add items", batch, "primary")]
        : []),
      button("Print all QR labels", async () =>
        printLabels((await all(`/equipment/${id}/items`)).map((x) => x._id)),
      ),
    ),
  );
  const stats = el("div", { class: "stats" });
  function showCounts(counts) {
    stats.replaceChildren(
      ...Object.entries(counts)
        .filter(([key]) => key !== "_id")
        .map(([key, value]) =>
          el(
            "article",
            { class: "stat compact", "data-count": key },
            el("span", { class: "stat-label" }, key),
            el("strong", {}, value),
          ),
        ),
    );
  }
  showCounts(record.counts);
  root.append(stats);
  root.append(
    el(
      "p",
      { class: "muted" },
      "Status totals are mutually exclusive. Damaged is a separate condition metric and can overlap maintenance or borrowed.",
    ),
  );
  const container = panel("Individual items");
  root.append(container);
  const reloadItems = pagedList(container, {
    path: `/equipment/${id}/items`,
    filters: [
      {
        name: "status",
        label: "All statuses",
        options: [
          "AVAILABLE",
          "BORROWED",
          "MAINTENANCE",
          "LOST",
          "RETIRED",
        ].map((value) => ({ value, label: value })),
      },
    ],
    columns: [
      {
        label: "Item code",
        render: (x) => link(x.itemCode, `/equipment-item.html?id=${x._id}`),
      },
      { label: "Condition", render: (x) => badge(x.condition) },
      { label: "Status", render: (x) => badge(x.status) },
      { label: "Serial", key: "serialNumber" },
      { label: "Notes", key: "notes" },
    ],
  });
  reload = async () => {
    await reloadItems();
    const { data: fresh } = await api(`/equipment/${id}`);
    showCounts(fresh.counts);
  };
}
export async function printLabels(ids) {
  if (ids.length > 500) throw new Error("Print up to 500 labels at a time");
  const existing = document.getElementById("print-labels");
  existing?.remove();
  const area = el("section", { id: "print-labels", class: "print-labels" });
  try {
    for (const id of ids) {
      const { data: item } = await api(`/items/${id}`);
      const image = await qrImage(id);
      area.append(
        el(
          "article",
          { class: "qr-label" },
          image,
          el("strong", {}, item.itemCode),
          el("span", {}, item.equipmentId?.name),
        ),
      );
    }
    document.body.append(area);
    window.print();
  } catch (error) {
    area.remove();
    throw error;
  }
}
async function qrImage(id) {
  const { API_BASE_URL } = await import("./config.js");
  const response = await fetch(`${API_BASE_URL}/api/v1/items/${id}/qr`, {
    credentials: "include",
  });
  if (!response.ok) throw new Error("Could not generate QR");
  const url = URL.createObjectURL(await response.blob());
  const image = el("img", { alt: "Item QR code", width: 160, height: 160 });
  try {
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error("Could not display QR image"));
      image.src = url;
    });
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function itemDetail(root, id) {
  const { data: item } = await api(`/items/${id}`);
  async function edit() {
    formModal(
      "Edit physical item",
      [
        {
          name: "serialNumber",
          label: "Serial number",
          value: item.serialNumber,
          required: false,
          maxLength: 120,
        },
        ...(!["BORROWED", "MAINTENANCE"].includes(item.status)
          ? [
              {
                name: "condition",
                label: "Condition",
                type: "select",
                value: item.condition,
                options: conditions,
              },
              {
                name: "status",
                label: "Status",
                type: "select",
                value: item.status,
                options: ["AVAILABLE", "LOST", "RETIRED"].map((value) => ({
                  value,
                  label: value,
                })),
              },
            ]
          : []),
        { name: "notes", label: "Notes", type: "textarea", value: item.notes },
      ],
      async (data) => {
        await api(`/items/${id}`, { method: "PATCH", body: data });
        location.reload();
      },
    );
  }
  root.append(
    header(
      item.itemCode,
      item.equipmentId?.name || "Physical item",
      ...(manager() ? [button("Edit item", edit, "primary")] : []),
      button("Report damage", () =>
        formModal(
          "Report damage",
          [
            {
              name: "description",
              label: "Describe the damage",
              type: "textarea",
              required: true,
            },
          ],
          async (data) => {
            await api("/maintenance", {
              method: "POST",
              body: { ...data, equipmentItem: id },
            });
            location.reload();
          },
        ),
      ),
      button("Print label", () => printLabels([id])),
    ),
  );
  const image = await qrImage(id);
  root.append(
    el(
      "div",
      { class: "detail-grid" },
      panel(
        "Item details",
        el(
          "dl",
          {},
          el("dt", {}, "Status"),
          el("dd", {}, badge(item.status)),
          el("dt", {}, "Condition"),
          el("dd", {}, badge(item.condition)),
          el("dt", {}, "Serial"),
          el("dd", {}, item.serialNumber || "—"),
          el("dt", {}, "Notes"),
          el("dd", {}, item.notes || "—"),
        ),
      ),
      panel(
        "QR label",
        image,
        el(
          "p",
          { class: "muted" },
          "Scanning opens this item page. Authentication is still required.",
        ),
        button("Download QR", () =>
          download(`/items/${id}/qr`, `${item.itemCode}.svg`),
        ),
      ),
    ),
  );
  if (manager())
    root.append(
      panel(
        "Borrowing history",
        table(
          [
            { label: "Borrower", render: (x) => x.borrowing?.user?.name },
            {
              label: "Borrowing",
              render: (x) =>
                link(
                  short(x.borrowing?._id),
                  `/borrowings.html?id=${x.borrowing?._id}`,
                ),
            },
            { label: "Before", key: "conditionBefore" },
            { label: "After", key: "conditionAfter" },
            { label: "Resolved at", render: (x) => fmt(x.returnedAt) },
          ],
          item.history,
        ),
      ),
      panel(
        "Maintenance history",
        table(
          [
            { label: "Description", key: "description" },
            { label: "Status", render: (x) => badge(x.status) },
            { label: "Cost", key: "cost" },
            { label: "Completed", render: (x) => fmt(x.completedAt) },
          ],
          item.maintenance,
        ),
      ),
    );
}
export async function taxonomyView(root, path) {
  let reload;
  const title = "Categories";
  const edit = (record) =>
    formModal(
      record ? "Edit record" : "New category",
      [
        { name: "name", label: "Name", value: record?.name, maxLength: 100 },
        {
          name: "description",
          label: "Description",
          type: "textarea",
          value: record?.description,
        },
      ],
      async (data) => {
        await api(record ? `/${path}/${record._id}` : `/${path}`, {
          method: record ? "PATCH" : "POST",
          body: data,
        });
        await reload();
      },
    );
  root.append(
    header(
      title,
      `Organize the equipment catalog by ${path}.`,
      ...(admin() ? [button("＋ Add new", () => edit(), "primary")] : []),
    ),
  );
  const container = panel(title);
  root.append(container);
  reload = pagedList(container, {
    path: `/${path}`,
    columns: [
      { label: "Name", key: "name" },
      { label: "Description", key: "description" },
      ...(admin()
        ? [
            {
              label: "Actions",
              render: (x) =>
                actions(
                  button("Edit", () => edit(x)),
                  button("Delete", () =>
                    confirmAction(
                      "Delete record?",
                      `${x.name} can be deleted only if it is unused.`,
                      async () => {
                        await api(`/${path}/${x._id}`, { method: "DELETE" });
                        await reload();
                      },
                    ),
                  ),
                ),
            },
          ]
        : []),
    ],
  });
}
export async function usersView(root) {
  let reload;
  const edit = (record) =>
    formModal(
      record ? "Edit user" : "New user",
      [
        {
          name: "name",
          label: "Full name",
          value: record?.name,
          maxLength: 100,
        },
        { name: "email", label: "Email", type: "email", value: record?.email },
        {
          name: "password",
          label: record
            ? "New password (optional)"
            : "Password (at least 12 characters)",
          type: "password",
          required: !record,
          autocomplete: "new-password",
          minLength: 12,
          maxLength: 72,
        },
        {
          name: "phone",
          label: "Phone",
          required: false,
          value: record?.phone,
          maxLength: 40,
        },
        {
          name: "role",
          label: "Role",
          type: "select",
          value: record?.role || "SCOUT",
          options: ["SCOUT", "STORAGE_KEEPER", "ADMIN"].map((value) => ({
            value,
            label: value.replaceAll("_", " "),
          })),
        },
      ],
      async (data) => {
        await api(record ? `/users/${record._id}` : "/users", {
          method: record ? "PATCH" : "POST",
          body: data,
        });
        await reload();
      },
    );
  root.append(
    header(
      "Users",
      "Manage accounts, permissions, and account access.",
      button("＋ New user", () => edit(), "primary"),
    ),
  );
  const container = panel("Team members");
  root.append(container);
  reload = pagedList(container, {
    path: "/users",
    columns: [
      { label: "Name", key: "name" },
      { label: "Email", key: "email" },
      { label: "Role", render: (x) => badge(x.role) },
      {
        label: "Access",
        render: (x) => badge(x.isActive ? "ACTIVE" : "INACTIVE"),
      },
      {
        label: "Actions",
        render: (x) =>
          actions(
            button("Edit", () => edit(x)),
            button(x.isActive ? "Deactivate" : "Activate", () =>
              confirmAction(
                "Change account access?",
                `Update access for ${x.name}. Existing sessions will be revoked.`,
                async () => {
                  await api(`/users/${x._id}/status`, {
                    method: "PATCH",
                    body: { isActive: !x.isActive },
                  });
                  await reload();
                },
              ),
            ),
          ),
      },
    ],
  });
}
