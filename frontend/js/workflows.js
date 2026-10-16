import { api, all, manager, currentUser } from "./api.js";
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
  inputDate,
  iso,
} from "./dom.js";
import { pagedList } from "./lists.js";
const opts = (values) =>
  values.map((value) => ({ value, label: value.replaceAll("_", " ") }));
function workflowDialog(title, content, submit, action) {
  const dialog = el("dialog", { class: "modal wide" }),
    error = el("p", { class: "form-error", role: "alert" }),
    save = el("button", { class: "button primary", type: "submit" }, submit),
    form = el("form");
  form.append(
    el("h2", {}, title),
    ...content,
    error,
    actions(
      button("Cancel", () => dialog.close()),
      save,
    ),
  );
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    save.disabled = true;
    error.textContent = "";
    try {
      await action();
      dialog.close();
      toast("Saved successfully");
    } catch (err) {
      error.textContent = err.message;
    } finally {
      save.disabled = false;
    }
  });
  dialog.addEventListener("close", () => dialog.remove());
  dialog.append(form);
  document.body.append(dialog);
  dialog.showModal();
  return dialog;
}
function field(label, input) {
  input.id ||= `input-${crypto.randomUUID()}`;
  return el(
    "div",
    { class: "field" },
    el("label", { htmlFor: input.id }, label),
    input,
  );
}
export async function issueDialog(refresh, request) {
  const users = await all("/users");
  const equipment = request
    ? request.items.map((x) => x.equipment)
    : await all("/equipment");
  const user = el(
    "select",
    { required: true },
    users
      .filter(
        (x) => x.isActive && (!request || x._id === request.requestedBy._id),
      )
      .map((x) => el("option", { value: x._id }, x.name)),
  );
  const expected = el("input", {
      type: "datetime-local",
      required: true,
      value: inputDate(request?.neededUntil || Date.now() + 7 * 86400000),
    }),
    purpose = el("input", {
      required: true,
      maxLength: 500,
      value: request?.purpose || "",
    }),
    notes = el("textarea", { maxLength: 2000 });
  const catalog = el("div", { class: "borrow-catalog" }),
    cartBody = el("div", { class: "cart-lines" }),
    summary = el("p", { class: "cart-summary", role: "status" }),
    cart = new Map(),
    catalogCards = [];
  const total = () =>
    [...cart.values()].reduce((sum, row) => sum + row.ids.length, 0);
  function renderCart() {
    cartBody.replaceChildren();
    if (!cart.size)
      cartBody.append(
        el(
          "div",
          { class: "empty" },
          el("strong", {}, "Your borrowing cart is empty"),
          el("p", {}, "Add equipment from the available stock."),
        ),
      );
    for (const [id, row] of cart) {
      const change = (delta) => {
        if (delta > 0) {
          if (total() >= 100)
            throw new Error("Issue up to 100 physical items at a time");
          if (row.ids.length >= row.items.length)
            throw new Error("All available items are already in your cart");
          row.ids.push(row.items[row.ids.length]._id);
        } else {
          row.ids.pop();
          if (!row.ids.length) cart.delete(id);
        }
        renderCart();
      };
      cartBody.append(
        el(
          "article",
          { class: "cart-line" },
          el(
            "div",
            {},
            el("strong", {}, row.type.name),
            el(
              "small",
              { class: "subline" },
              row.items
                .filter((x) => row.ids.includes(x._id))
                .map((x) => x.itemCode)
                .join(", "),
            ),
          ),
          actions(
            button("−", () => change(-1)),
            el(
              "span",
              {
                class: "cart-quantity",
                "aria-label": `${row.type.name} cart quantity`,
              },
              row.ids.length,
            ),
            button("＋", () => change(1)),
            button("Remove", () => {
              cart.delete(id);
              renderCart();
            }),
          ),
        ),
      );
    }
    summary.textContent = `${cart.size} equipment ${cart.size === 1 ? "type" : "types"} · ${total()} physical ${total() === 1 ? "item" : "items"}`;
    for (const entry of catalogCards) {
      const remaining =
        entry.items.length - (cart.get(entry.type._id)?.ids.length || 0);
      entry.available.textContent = `${remaining} available to add`;
      entry.add.dataset.keepDisabled = String(
        remaining === 0 || total() >= 100,
      );
      entry.add.disabled = remaining === 0 || total() >= 100;
      entry.quantity.max = Math.max(remaining, 1);
      entry.quantity.disabled = remaining === 0 || total() >= 100;
      entry.quantity.value = Math.min(
        Math.max(Number(entry.quantity.value) || 1, 1),
        Math.max(remaining, 1),
      );
    }
  }
  const available = await Promise.all(
    equipment.map((type) =>
      all(`/equipment/${type._id}/items?status=AVAILABLE`),
    ),
  );
  for (let i = 0; i < equipment.length; i++) {
    const type = equipment[i],
      items = available[i].filter((x) => x.condition !== "DAMAGED"),
      required = request?.items.find(
        (x) => x.equipment._id === type._id,
      )?.quantity;
    const quantity = el("input", {
        type: "number",
        min: 1,
        max: items.length,
        value: 1,
        "aria-label": `${type.name} quantity to add`,
      }),
      stock = el("p", { class: "muted" });
    const add = button(
      "Add to cart",
      () => {
        const count = Number(quantity.value);
        const row = cart.get(type._id) || { type, items, ids: [] };
        if (
          !Number.isInteger(count) ||
          count < 1 ||
          count > items.length - row.ids.length
        )
          throw new Error("Choose a quantity within the available stock");
        if (total() + count > 100)
          throw new Error("Issue up to 100 physical items at a time");
        row.ids.push(
          ...items
            .slice(row.ids.length, row.ids.length + count)
            .map((x) => x._id),
        );
        cart.set(type._id, row);
        renderCart();
      },
      "primary",
    );
    const card = el(
      "article",
      { class: "borrow-card" },
      el("h3", {}, type.name),
      stock,
      required ? el("p", { class: "muted" }, `${required} requested`) : null,
      actions(quantity, add),
    );
    catalogCards.push({ type, items, available: stock, add, quantity, card });
    catalog.append(card);
  }
  if (!available.some((items) => items.length))
    catalog.prepend(
      el(
        "p",
        { class: "stock-help" },
        "No physical items are available. Set the total stock on an equipment record or add items first.",
        link("Open equipment →", "/equipment.html"),
      ),
    );
  const search = el("input", {
    type: "search",
    placeholder: "Find equipment…",
    "aria-label": "Search available equipment",
    onInput: (event) => {
      const term = event.target.value.toLowerCase();
      for (const entry of catalogCards)
        entry.card.hidden = !entry.type.name.toLowerCase().includes(term);
    },
  });
  renderCart();
  workflowDialog(
    request ? "Issue approved request" : "New borrowing",
    [
      el(
        "div",
        { class: "issue-fields" },
        field("Borrower", user),
        field("Expected return (your local time)", expected),
      ),
      field("Purpose", purpose),
      field("Notes", notes),
      el(
        "div",
        { class: "borrow-cart-layout" },
        el("section", {}, el("h3", {}, "Available equipment"), search, catalog),
        el(
          "section",
          { class: "borrow-cart" },
          el("h3", {}, "Borrowing cart"),
          cartBody,
          summary,
        ),
      ),
      el(
        "p",
        { class: "muted" },
        "Each quantity represents individually tracked physical items. All items are issued together; availability is checked again when you confirm. Maximum 100 items per issue.",
      ),
    ],
    "Confirm issuance",
    async () => {
      const itemIds = [...cart.values()].flatMap((x) => x.ids);
      if (!itemIds.length)
        throw new Error("Add at least one item to your borrowing cart");
      if (!user.value) throw new Error("Choose an active borrower");
      await api("/borrowings", {
        method: "POST",
        body: {
          user: user.value,
          itemIds,
          expectedReturnDate: iso(expected.value),
          purpose: purpose.value,
          notes: notes.value,
          ...(request ? { requestId: request._id } : {}),
        },
      });
      await refresh();
    },
  );
}
export async function borrowingsView(root, id) {
  if (id) return borrowingDetail(root, id);
  let reload;
  root.append(
    header(
      "Borrowings",
      "Track issued equipment, due dates, and partial returns.",
      ...(manager()
        ? [button("＋ Issue equipment", () => issueDialog(reload), "primary")]
        : []),
    ),
  );
  const container = panel(
    manager() ? "Borrowing register" : "My borrowing history",
  );
  root.append(container);
  reload = pagedList(container, {
    path: "/borrowings",
    search: false,
    filters: [
      {
        name: "status",
        label: "All statuses",
        options: opts(["ACTIVE", "PARTIAL", "RETURNED", "CANCELLED"]),
      },
    ],
    columns: [
      {
        label: "Reference",
        render: (x) =>
          link(`BR-${short(x._id)}`, `/borrowings.html?id=${x._id}`),
      },
      { label: "Borrower", render: (x) => x.user?.name },
      { label: "Purpose", key: "purpose" },
      { label: "Due", render: (x) => fmt(x.expectedReturnDate) },
      {
        label: "Status",
        render: (x) =>
          actions(badge(x.status), x.overdue ? badge("OVERDUE") : null),
      },
    ],
  });
}
export async function borrowingDetail(root, id) {
  const { data: record } = await api(`/borrowings/${id}`);
  async function returns() {
    const outstanding = record.items.filter((x) => !x.returnedAt),
      entries = [];
    const rows = outstanding.map((line) => {
      const check = el("input", {
          type: "checkbox",
          "aria-label": `Return ${line.equipmentItem.itemCode}`,
        }),
        condition = el(
          "select",
          { "aria-label": "Returned condition" },
          opts(["GOOD", "NEW", "FAIR", "DAMAGED"]).map((x) =>
            el("option", { value: x.value }, x.label),
          ),
        ),
        lost = el("input", { type: "checkbox", "aria-label": "Mark lost" }),
        notes = el("input", { maxLength: 2000, "aria-label": "Return notes" });
      entries.push({ line, check, condition, lost, notes });
      return {
        code: line.equipmentItem.itemCode,
        check,
        condition,
        lost,
        notes,
      };
    });
    workflowDialog(
      "Return or resolve items",
      [
        el(
          "p",
          { class: "muted" },
          "Select only the items being returned now. Damaged items enter maintenance; lost items are recorded as lost.",
        ),
        actions(
          button("Select all", () => {
            for (const entry of entries) entry.check.checked = true;
          }),
          button("Clear selection", () => {
            for (const entry of entries) entry.check.checked = false;
          }),
        ),
        table(
          [
            { label: "Return", render: (x) => x.check },
            { label: "Item", key: "code" },
            { label: "Condition", render: (x) => x.condition },
            { label: "Lost", render: (x) => x.lost },
            { label: "Notes", render: (x) => x.notes },
          ],
          rows,
        ),
      ],
      "Record returns",
      async () => {
        const items = entries
          .filter((x) => x.check.checked)
          .map((x) => ({
            itemId: x.line.equipmentItem._id,
            condition: x.condition.value,
            lost: x.lost.checked,
            notes: x.notes.value,
          }));
        if (!items.length) throw new Error("Select at least one item");
        await api(`/borrowings/${id}/return`, {
          method: "POST",
          body: { items },
        });
        location.reload();
      },
    );
  }
  root.append(
    header(
      `Borrowing BR-${short(id)}`,
      `${record.user?.name} · ${record.purpose}`,
      ...((manager() || record.user?._id === currentUser._id) &&
      ["ACTIVE", "PARTIAL"].includes(record.status)
        ? [button("Record returns", returns, "primary")]
        : []),
      ...(manager() && record.status === "ACTIVE"
        ? [
            button("Cancel erroneous issuance", () =>
              formModal(
                "Cancel erroneous issuance",
                [
                  {
                    name: "notes",
                    label: "Reason",
                    type: "textarea",
                    required: true,
                  },
                ],
                async (data) => {
                  if (
                    !(await confirmAction(
                      "Confirm correction",
                      "Confirm that this issuance was entered in error and all physical items remain in storage. Use returns for actual loans.",
                      async () => {},
                    ))
                  )
                    throw new Error("Cancelled");
                  await api(`/borrowings/${id}/cancel`, {
                    method: "POST",
                    body: data,
                  });
                  location.reload();
                },
              ),
            ),
          ]
        : []),
    ),
  );
  root.append(
    panel(
      "Borrowing details",
      el(
        "div",
        { class: "detail-line" },
        badge(record.status),
        record.overdue ? badge("OVERDUE") : null,
        el(
          "span",
          {},
          `Issued ${fmt(record.borrowDate)} · Due ${fmt(record.expectedReturnDate)} · Keeper ${record.borrowedBy?.name}`,
        ),
      ),
      el("p", {}, record.notes),
    ),
    panel(
      "Issued items",
      table(
        [
          {
            label: "Item",
            render: (x) =>
              link(
                x.equipmentItem.itemCode,
                `/equipment-item.html?id=${x.equipmentItem._id}`,
              ),
          },
          {
            label: "Equipment",
            render: (x) => x.equipmentItem.equipmentId?.name,
          },
          { label: "Before", render: (x) => badge(x.conditionBefore) },
          {
            label: "After",
            render: (x) =>
              x.conditionAfter ? badge(x.conditionAfter) : "Outstanding",
          },
          { label: "Resolved", render: (x) => fmt(x.returnedAt) },
          { label: "Resolution", key: "resolution" },
          { label: "Notes", key: "notes" },
        ],
        record.items,
      ),
    ),
  );
}
export async function requestDialog(refresh) {
  const equipment = await all("/equipment"),
    rows = [];
  const from = el("input", {
      type: "datetime-local",
      required: true,
      value: inputDate(),
    }),
    until = el("input", {
      type: "datetime-local",
      required: true,
      value: inputDate(Date.now() + 7 * 86400000),
    }),
    purpose = el("textarea", { required: true, maxLength: 500 }),
    choices = el("div", { class: "request-picker" });
  for (const type of equipment) {
    const quantity = el("input", {
      type: "number",
      min: 0,
      max: 500,
      value: 0,
    });
    rows.push({ type, quantity });
    choices.append(
      field(
        `${type.name} · ${type.counts.available} currently available`,
        quantity,
      ),
    );
  }
  workflowDialog(
    "Request equipment",
    [
      field("Needed from (local time)", from),
      field("Needed until (local time)", until),
      field("Purpose", purpose),
      el(
        "p",
        { class: "muted" },
        "Set a quantity for each equipment type you need. Requests do not reserve stock.",
      ),
      choices,
    ],
    "Submit request",
    async () => {
      const items = rows
        .filter((x) => Number(x.quantity.value) > 0)
        .map((x) => ({
          equipment: x.type._id,
          quantity: Number(x.quantity.value),
        }));
      if (!items.length) throw new Error("Choose at least one equipment type");
      await api("/requests", {
        method: "POST",
        body: {
          items,
          neededFrom: iso(from.value),
          neededUntil: iso(until.value),
          purpose: purpose.value,
        },
      });
      await refresh();
    },
  );
}
export async function requestsView(root, id) {
  if (id) return requestDetail(root, id);
  let reload;
  root.append(
    header(
      "Equipment requests",
      "Plan upcoming activities and track approvals.",
      button("＋ New request", () => requestDialog(reload), "primary"),
    ),
  );
  const container = panel(manager() ? "Request queue" : "My requests");
  root.append(container);
  reload = pagedList(container, {
    path: "/requests",
    search: false,
    filters: [
      {
        name: "status",
        label: "All statuses",
        options: opts([
          "PENDING",
          "APPROVED",
          "REJECTED",
          "CANCELLED",
          "ISSUED",
        ]),
      },
    ],
    columns: [
      {
        label: "Request",
        render: (x) => link(`RQ-${short(x._id)}`, `/requests.html?id=${x._id}`),
      },
      { label: "Requested by", render: (x) => x.requestedBy?.name },
      { label: "Purpose", key: "purpose" },
      {
        label: "Equipment",
        render: (x) =>
          x.items.map((y) => `${y.equipment?.name} × ${y.quantity}`).join(", "),
      },
      { label: "Needed from", render: (x) => fmt(x.neededFrom) },
      { label: "Status", render: (x) => badge(x.status) },
    ],
  });
}
export async function requestDetail(root, id) {
  const { data: record } = await api(`/requests/${id}`),
    buttons = [];
  const action = (name) =>
    formModal(
      `${name[0].toUpperCase() + name.slice(1)} request`,
      [
        {
          name: "notes",
          label: "Decision notes",
          type: "textarea",
          required: true,
        },
      ],
      async (data) => {
        await api(`/requests/${id}/${name}`, { method: "POST", body: data });
        location.reload();
      },
    );
  if (manager() && record.status === "PENDING")
    buttons.push(
      button("Approve", () => action("approve"), "primary"),
      button("Reject", () => action("reject")),
    );
  if (["PENDING", "APPROVED"].includes(record.status))
    buttons.push(button("Cancel request", () => action("cancel")));
  if (manager() && record.status === "APPROVED")
    buttons.push(
      button(
        "Issue equipment",
        () => issueDialog(() => location.assign("/borrowings.html"), record),
        "primary",
      ),
    );
  root.append(
    header(
      `Request RQ-${short(id)}`,
      `${record.requestedBy?.name} · ${record.purpose}`,
      ...buttons,
    ),
  );
  root.append(
    panel(
      "Request details",
      el(
        "div",
        { class: "detail-line" },
        badge(record.status),
        `From ${fmt(record.neededFrom)} to ${fmt(record.neededUntil)}`,
      ),
      el("p", {}, record.notes),
      table(
        [
          {
            label: "Equipment",
            render: (x) =>
              link(
                x.equipment?.name,
                `/equipment-details.html?id=${x.equipment?._id}`,
              ),
          },
          { label: "Quantity", key: "quantity" },
        ],
        record.items,
      ),
    ),
    panel(
      "Status history",
      table(
        [
          { label: "Status", render: (x) => badge(x.status) },
          { label: "By", render: (x) => x.user?.name },
          { label: "At", render: (x) => fmt(x.at) },
          { label: "Notes", key: "notes" },
        ],
        record.history,
      ),
    ),
  );
}
export async function maintenanceView(root) {
  let reload;
  const report = () =>
    formModal(
      "Report damaged equipment",
      [
        {
          name: "equipmentItem",
          label: "Item ID",
          hint: "Open an item from the equipment catalog to report damage directly.",
          maxLength: 24,
        },
        {
          name: "description",
          label: "Damage description",
          type: "textarea",
          required: true,
        },
      ],
      async (data) => {
        await api("/maintenance", { method: "POST", body: data });
        await reload();
      },
    );
  const update = (record) =>
    formModal(
      "Update maintenance",
      [
        {
          name: "status",
          label: "Repair status",
          type: "select",
          options: opts(["OPEN", "IN_PROGRESS"]),
          value: record.status,
        },
        {
          name: "cost",
          label: "Cost (organization currency)",
          type: "number",
          min: 0,
          max: 10000000,
          step: 0.01,
          value: record.cost,
        },
        {
          name: "notes",
          label: "Notes",
          type: "textarea",
          value: record.notes,
        },
      ],
      async (data) => {
        await api(`/maintenance/${record._id}`, {
          method: "PATCH",
          body: data,
        });
        await reload();
      },
    );
  const complete = (record) =>
    formModal(
      "Complete repair",
      [
        {
          name: "condition",
          label: "Condition after repair",
          type: "select",
          options: opts(["GOOD", "NEW", "FAIR"]),
        },
        {
          name: "restore",
          label: "Authorized disposition",
          type: "select",
          options: [
            { value: "yes", label: "Confirm return to available stock" },
            { value: "no", label: "Retire item" },
          ],
        },
        {
          name: "cost",
          label: "Final cost",
          type: "number",
          min: 0,
          max: 10000000,
          step: 0.01,
          value: record.cost,
        },
        {
          name: "notes",
          label: "Completion notes",
          type: "textarea",
          value: record.notes,
        },
      ],
      async (data) => {
        data.restore = data.restore === "yes";
        await api(`/maintenance/${record._id}/complete`, {
          method: "POST",
          body: data,
        });
        await reload();
      },
    );
  root.append(
    header(
      "Maintenance",
      "Record damage, track repairs, and return equipment to service.",
      button("Report damage", report, "primary"),
    ),
  );
  const container = panel(manager() ? "Repair register" : "My damage reports");
  root.append(container);
  reload = pagedList(container, {
    path: "/maintenance",
    search: false,
    filters: [
      {
        name: "status",
        label: "All statuses",
        options: opts(["OPEN", "IN_PROGRESS", "COMPLETED"]),
      },
    ],
    columns: [
      {
        label: "Item",
        render: (x) =>
          link(
            x.equipmentItem?.itemCode,
            `/equipment-item.html?id=${x.equipmentItem?._id}`,
          ),
      },
      { label: "Description", key: "description" },
      { label: "Status", render: (x) => badge(x.status) },
      { label: "Cost", key: "cost" },
      { label: "Notes", key: "notes" },
      {
        label: "Actions",
        render: (x) =>
          manager() && x.status !== "COMPLETED"
            ? actions(
                button("Update", () => update(x)),
                button("Complete", () => complete(x)),
              )
            : fmt(x.completedAt),
      },
    ],
  });
}
