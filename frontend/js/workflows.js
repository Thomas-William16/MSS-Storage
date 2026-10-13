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
  const users = await all("/users"),
    equipment = request
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
  const itemArea = el("div", { class: "item-picker" }),
    checks = [];
  for (const type of equipment) {
    const items = await all(`/equipment/${type._id}/items?status=AVAILABLE`);
    if (!items.length) continue;
    const required = request?.items.find(
      (x) => x.equipment._id === type._id,
    )?.quantity;
    const group = el(
      "fieldset",
      {},
      el(
        "legend",
        {},
        type.name + (required ? ` · ${required} requested` : ""),
      ),
    );
    for (const item of items) {
      const check = el("input", { type: "checkbox", value: item._id });
      checks.push(check);
      group.append(
        el(
          "label",
          { class: "check-row" },
          check,
          el("span", {}, `${item.itemCode} · ${item.condition}`),
        ),
      );
    }
    itemArea.append(group);
  }
  workflowDialog(
    request ? "Issue approved request" : "New borrowing",
    [
      field("Borrower", user),
      field("Expected return (your local time)", expected),
      field("Purpose", purpose),
      field("Notes", notes),
      el(
        "p",
        { class: "muted" },
        "Select the individual items to issue. Availability is verified again atomically when saved.",
      ),
      itemArea,
    ],
    "Confirm issuance",
    async () => {
      const itemIds = checks.filter((x) => x.checked).map((x) => x.value);
      if (!itemIds.length) throw new Error("Select at least one item");
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
      ...(manager() && ["ACTIVE", "PARTIAL"].includes(record.status)
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
