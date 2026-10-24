import React, { useState } from "react";
import { api, all, manager, currentUser } from "./api.js";
import { navigate } from "./router.js";
import {
  Header,
  Panel,
  Button,
  Badge,
  Table,
  Link,
  Actions,
  PagedList,
  Loading,
  ErrorMessage,
  Dialog,
  Form,
  Field,
  useUI,
  useResource,
  useReload,
  useRestoreScroll,
  opts,
  fmt,
  short,
  inputDate,
  iso,
} from "./ui.jsx";

export const canReturn = (record) =>
  ["ACTIVE", "PARTIAL"].includes(record.status) &&
  (manager() || (record.user?._id || record.user) === currentUser._id);
export function IssueDialog({ request, close, onSaved }) {
  const ui = useUI();
  const [cart, setCart] = useState({});
  const [quantities, setQuantities] = useState({});
  const [search, setSearch] = useState("");
  const result = useResource("issuance", 0, async () => {
    const [users, equipment] = await Promise.all([
      all("/users"),
      request
        ? Promise.resolve(request.items.map((item) => item.equipment))
        : all("/equipment"),
    ]);
    const types = [];
    // Bound concurrent lookups on the free database rather than fan out unbounded.
    for (let index = 0; index < equipment.length; index += 4)
      types.push(
        ...(await Promise.all(
          equipment.slice(index, index + 4).map(async (type) => ({
            ...type,
            availableItems: (
              await all(`/equipment/${type._id}/items?status=AVAILABLE`)
            ).filter((item) => item.condition !== "DAMAGED"),
          })),
        )),
      );
    return {
      data: {
        users: users.filter(
          (user) =>
            user.isActive && (!request || user._id === request.requestedBy._id),
        ),
        types,
      },
    };
  });
  const count = Object.values(cart).reduce((sum, value) => sum + value, 0);
  function add(type, amount) {
    const next = (cart[type._id] || 0) + amount;
    if (
      !Number.isInteger(amount) ||
      next < 0 ||
      next > type.availableItems.length
    )
      throw new Error("Choose a quantity within the available stock");
    if (count + amount > 100)
      throw new Error("Issue up to 100 physical items at a time");
    setCart((current) => {
      const nextCart = { ...current, [type._id]: next };
      if (!next) delete nextCart[type._id];
      return nextCart;
    });
  }
  return (
    <Dialog
      title={request ? "Issue approved request" : "New borrowing"}
      wide
      close={close}
    >
      {result.error ? (
        <ErrorMessage error={result.error} />
      ) : !result.data ? (
        <Loading />
      ) : (
        <Form
          close={close}
          submit="Confirm issuance"
          onSubmit={async (form) => {
            const itemIds = result.data.types.flatMap((type) =>
              type.availableItems
                .slice(0, cart[type._id] || 0)
                .map((item) => item._id),
            );
            if (!itemIds.length)
              throw new Error("Add at least one item to your borrowing cart");
            await api("/borrowings", {
              method: "POST",
              body: {
                user: form.get("user"),
                itemIds,
                expectedReturnDate: iso(form.get("expected")),
                purpose: form.get("purpose"),
                notes: form.get("notes"),
                ...(request ? { requestId: request._id } : {}),
              },
            });
            const message = `${itemIds.length} ${itemIds.length === 1 ? "item" : "items"} issued successfully.`;
            close(true);
            ui.toast(message);
            onSaved?.(message);
          }}
        >
          <div className="issue-fields">
            <Field name="user" label="Borrower">
              <select required defaultValue={result.data.users[0]?._id || ""}>
                {!result.data.users.length && (
                  <option value="">Choose an active borrower</option>
                )}
                {result.data.users.map((user) => (
                  <option key={user._id} value={user._id}>
                    {user.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              name="expected"
              label="Expected return (your local time)"
              type="datetime-local"
              defaultValue={inputDate(
                request?.neededUntil || Date.now() + 7 * 86400000,
              )}
              required
            />
          </div>
          <Field
            name="purpose"
            label="Purpose"
            required
            maxLength={500}
            defaultValue={request?.purpose || ""}
          />
          <Field name="notes" label="Notes">
            <textarea maxLength={2000} />
          </Field>
          <div className="borrow-cart-layout">
            <section>
              <h3>Available equipment</h3>
              <input
                type="search"
                aria-label="Search available equipment"
                placeholder="Find equipment…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <div className="borrow-catalog">
                {!result.data.types.some(
                  (type) => type.availableItems.length,
                ) && (
                  <p className="stock-help">
                    No physical items are available. Set the total stock on an
                    equipment record or add items first.
                    <Link href="/equipment.html">Open equipment →</Link>
                  </p>
                )}
                {result.data.types
                  .filter((type) =>
                    type.name.toLowerCase().includes(search.toLowerCase()),
                  )
                  .map((type) => {
                    const remaining =
                      type.availableItems.length - (cart[type._id] || 0);
                    const disabled = !remaining || count >= 100;
                    const quantity = Math.min(
                      quantities[type._id] ?? 1,
                      Math.max(remaining, 1),
                    );
                    return (
                      <article key={type._id} className="borrow-card">
                        <h3>{type.name}</h3>
                        <div className="availability">{`${type.availableItems.length} available out of ${type.counts?.total || type.availableItems.length}`}</div>
                        <p className="muted">{`${remaining} available to add`}</p>
                        {request && (
                          <p className="muted">{`${request.items.find((item) => item.equipment._id === type._id)?.quantity || 0} requested`}</p>
                        )}
                        <Actions>
                          <input
                            type="number"
                            min={1}
                            max={Math.max(remaining, 1)}
                            value={quantity}
                            disabled={disabled}
                            aria-label={`${type.name} quantity to add`}
                            onChange={(event) =>
                              setQuantities((current) => ({
                                ...current,
                                [type._id]:
                                  event.target.value === ""
                                    ? ""
                                    : Number(event.target.value),
                              }))
                            }
                          />
                          <Button
                            variant="primary"
                            disabled={disabled}
                            onClick={() => add(type, Number(quantity))}
                          >
                            Add to cart
                          </Button>
                        </Actions>
                      </article>
                    );
                  })}
              </div>
            </section>
            <section className="borrow-cart">
              <h3>Borrowing cart</h3>
              <div className="cart-lines">
                {!count && (
                  <div className="empty">
                    <strong>Your borrowing cart is empty</strong>
                    <p>Add equipment from the available stock.</p>
                  </div>
                )}
                {result.data.types
                  .filter((type) => cart[type._id])
                  .map((type) => (
                    <article key={type._id} className="cart-line">
                      <div>
                        <strong>{type.name}</strong>
                        <small className="subline">
                          {type.availableItems
                            .slice(0, cart[type._id])
                            .map((item) => item.itemCode)
                            .join(", ")}
                        </small>
                      </div>
                      <Actions>
                        <Button
                          aria-label={`Decrease ${type.name} quantity`}
                          onClick={() => add(type, -1)}
                        >
                          −
                        </Button>
                        <span
                          className="cart-quantity"
                          aria-label={`${type.name} cart quantity`}
                        >
                          {cart[type._id]}
                        </span>
                        <Button
                          aria-label={`Increase ${type.name} quantity`}
                          disabled={
                            cart[type._id] >= type.availableItems.length ||
                            count >= 100
                          }
                          onClick={() => add(type, 1)}
                        >
                          ＋
                        </Button>
                        <Button
                          onClick={() =>
                            setCart((current) => {
                              const next = { ...current };
                              delete next[type._id];
                              return next;
                            })
                          }
                        >
                          Remove
                        </Button>
                      </Actions>
                    </article>
                  ))}
              </div>
              <p
                className="cart-summary"
                role="status"
              >{`${Object.keys(cart).length} equipment ${Object.keys(cart).length === 1 ? "type" : "types"} · ${count} physical ${count === 1 ? "item" : "items"}`}</p>
            </section>
          </div>
          <p className="muted">
            Each quantity represents individually tracked physical items. All
            items are issued together; availability is checked again when you
            confirm. Maximum 100 items per issue.
          </p>
        </Form>
      )}
    </Dialog>
  );
}

export function ReturnDialog({ id, close, onSaved }) {
  const result = useResource(`/borrowings/${id}`);
  const ui = useUI();
  const [selection, setSelection] = useState({});
  const update = (line, patch) =>
    setSelection((current) => ({
      ...current,
      [line._id]: { ...current[line._id], ...patch },
    }));
  const rows = (result.data?.items || []).filter((line) => !line.returnedAt);
  return (
    <Dialog title="Return or resolve items" wide close={close}>
      {result.error ? (
        <ErrorMessage error={result.error} />
      ) : !result.data ? (
        <Loading />
      ) : (
        <Form
          close={close}
          submit="Record returns"
          onSubmit={async () => {
            if (!canReturn(result.data))
              throw new Error("This borrowing has no items you can return.");
            const items = rows
              .filter((line) => selection[line._id]?.checked)
              .map((line) => ({
                itemId: line.equipmentItem._id,
                condition: selection[line._id]?.condition || "GOOD",
                lost: selection[line._id]?.lost || false,
                notes: selection[line._id]?.notes || "",
              }));
            if (!items.length) throw new Error("Select at least one item");
            await api(`/borrowings/${id}/return`, {
              method: "POST",
              body: { items },
            });
            const updated = await api(`/borrowings/${id}`);
            const lost = items.filter((item) => item.lost).length;
            close(true);
            onSaved?.();
            ui.toast(
              `${items.length - lost} ${items.length - lost === 1 ? "item" : "items"} returned; ${lost} marked lost; ${updated.data.items.filter((line) => !line.returnedAt).length} still outstanding.`,
            );
          }}
        >
          <p className="muted">
            Select only the items being returned now. Damaged items enter
            maintenance; lost items are recorded as lost.
          </p>
          <Actions>
            <Button
              onClick={() =>
                setSelection((current) =>
                  Object.fromEntries(
                    rows.map((line) => [
                      line._id,
                      { ...current[line._id], checked: true },
                    ]),
                  ),
                )
              }
            >
              Select all
            </Button>
            <Button
              onClick={() =>
                setSelection((current) =>
                  Object.fromEntries(
                    rows.map((line) => [
                      line._id,
                      { ...current[line._id], checked: false },
                    ]),
                  ),
                )
              }
            >
              Clear selection
            </Button>
          </Actions>
          <Table
            className="return-table"
            rows={rows}
            columns={[
              {
                label: "Return",
                render: (line) => (
                  <input
                    type="checkbox"
                    aria-label={`Return ${line.equipmentItem.itemCode}`}
                    checked={selection[line._id]?.checked || false}
                    onChange={(event) =>
                      update(line, { checked: event.target.checked })
                    }
                  />
                ),
              },
              { label: "Item", render: (line) => line.equipmentItem.itemCode },
              {
                label: "Condition",
                render: (line) => (
                  <select
                    aria-label="Returned condition"
                    value={selection[line._id]?.condition || "GOOD"}
                    onChange={(event) =>
                      update(line, { condition: event.target.value })
                    }
                  >
                    {opts(["GOOD", "NEW", "FAIR", "DAMAGED"]).map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ),
              },
              {
                label: "Lost",
                render: (line) => (
                  <input
                    type="checkbox"
                    aria-label="Mark lost"
                    checked={selection[line._id]?.lost || false}
                    onChange={(event) =>
                      update(line, { lost: event.target.checked })
                    }
                  />
                ),
              },
              {
                label: "Notes",
                render: (line) => (
                  <input
                    maxLength={2000}
                    aria-label="Return notes"
                    value={selection[line._id]?.notes || ""}
                    onChange={(event) =>
                      update(line, { notes: event.target.value })
                    }
                  />
                ),
              },
            ]}
          />
        </Form>
      )}
    </Dialog>
  );
}

export function BorrowingsPage({ id }) {
  return id ? <BorrowingDetail id={id} /> : <BorrowingList />;
}
function BorrowingList() {
  const ui = useUI();
  const [revision, reload] = useReload();
  return (
    <>
      <Header
        title="Borrowings"
        subtitle="Track issued equipment, due dates, and partial returns."
      >
        {manager() && (
          <Button
            variant="primary"
            onClick={() => ui.open(IssueDialog, { onSaved: reload })}
          >
            ＋ Issue equipment
          </Button>
        )}
      </Header>
      <Panel title={manager() ? "Borrowing register" : "My borrowing history"}>
        <PagedList
          path="/borrowings"
          revision={revision}
          search={false}
          filters={[
            {
              name: "status",
              label: "All statuses",
              options: opts(["ACTIVE", "PARTIAL", "RETURNED", "CANCELLED"]),
            },
          ]}
          columns={[
            {
              label: "Reference",
              render: (row) => (
                <Link
                  href={`/borrowings.html?id=${row._id}`}
                >{`BR-${short(row._id)}`}</Link>
              ),
            },
            { label: "Borrower", render: (row) => row.user?.name },
            { label: "Purpose", key: "purpose" },
            { label: "Due", render: (row) => fmt(row.expectedReturnDate) },
            {
              label: "Actions",
              render: (row) =>
                canReturn(row) ? (
                  <Button
                    variant="primary"
                    onClick={() =>
                      ui.open(ReturnDialog, { id: row._id, onSaved: reload })
                    }
                  >
                    Return items
                  </Button>
                ) : (
                  "—"
                ),
            },
            {
              label: "Status",
              render: (row) => (
                <Actions>
                  <Badge value={row.status} />
                  {row.overdue && <Badge value="OVERDUE" />}
                </Actions>
              ),
            },
          ]}
        />
      </Panel>
    </>
  );
}
function BorrowingDetail({ id }) {
  const ui = useUI();
  const [revision, reload] = useReload();
  const result = useResource(`/borrowings/${id}`, revision);
  useRestoreScroll(!result.loading);
  if (!result.data)
    return result.error ? (
      <ErrorMessage error={result.error} retry={reload} />
    ) : (
      <Loading />
    );
  const record = result.data;
  return (
    <>
      <Header
        title={`Borrowing BR-${short(id)}`}
        subtitle={`${record.user?.name} · ${record.purpose}`}
      >
        {canReturn(record) && (
          <Button
            variant="primary"
            onClick={() => ui.open(ReturnDialog, { id, onSaved: reload })}
          >
            Record returns
          </Button>
        )}
        {manager() && record.status === "ACTIVE" && (
          <Button
            onClick={() =>
              ui.form({
                title: "Cancel erroneous issuance",
                fields: [
                  {
                    name: "notes",
                    label: "Reason",
                    type: "textarea",
                    required: true,
                  },
                ],
                onSubmit: async (data) => {
                  if (
                    !(await ui.confirm(
                      "Confirm correction",
                      "Confirm that this issuance was entered in error and all physical items remain in storage. Use returns for actual loans.",
                    ))
                  )
                    throw new Error("Cancelled");
                  await api(`/borrowings/${id}/cancel`, {
                    method: "POST",
                    body: data,
                  });
                  reload();
                  return "Erroneous issuance cancelled; items restored to stock.";
                },
              })
            }
          >
            Cancel erroneous issuance
          </Button>
        )}
      </Header>
      <Link back href="/borrowings.html">
        ← Borrowings
      </Link>
      <Panel title="Borrowing details">
        <div className="detail-line">
          <Badge value={record.status} />
          {record.overdue && <Badge value="OVERDUE" />}
          <span>{`Issued ${fmt(record.borrowDate)} · Due ${fmt(record.expectedReturnDate)} · Keeper ${record.borrowedBy?.name}`}</span>
        </div>
        <p>{record.notes}</p>
      </Panel>
      <Panel title="Issued items">
        <Table
          rows={record.items}
          columns={[
            {
              label: "Item",
              render: (line) => (
                <Link
                  href={`/equipment-item.html?id=${line.equipmentItem._id}`}
                >
                  {line.equipmentItem.itemCode}
                </Link>
              ),
            },
            {
              label: "Equipment",
              render: (line) => line.equipmentItem.equipmentId?.name,
            },
            {
              label: "Before",
              render: (line) => <Badge value={line.conditionBefore} />,
            },
            {
              label: "After",
              render: (line) =>
                line.conditionAfter ? (
                  <Badge value={line.conditionAfter} />
                ) : (
                  "Outstanding"
                ),
            },
            { label: "Resolved", render: (line) => fmt(line.returnedAt) },
            { label: "Resolution", key: "resolution" },
            { label: "Notes", key: "notes" },
          ]}
        />
      </Panel>
    </>
  );
}

export function RequestDialog({ close, onSaved }) {
  const result = useResource("request-equipment", 0, async () => ({
    data: await all("/equipment"),
  }));
  const ui = useUI();
  const [quantities, setQuantities] = useState({});
  return (
    <Dialog title="Request equipment" wide close={close}>
      {result.error ? (
        <ErrorMessage error={result.error} />
      ) : !result.data ? (
        <Loading />
      ) : (
        <Form
          close={close}
          submit="Submit request"
          onSubmit={async (form) => {
            const items = result.data
              .filter((type) => Number(quantities[type._id]) > 0)
              .map((type) => ({
                equipment: type._id,
                quantity: Number(quantities[type._id]),
              }));
            if (!items.length)
              throw new Error("Choose at least one equipment type");
            const neededFrom = iso(form.get("neededFrom")),
              neededUntil = iso(form.get("neededUntil"));
            if (neededUntil <= neededFrom)
              throw Object.assign(
                new Error("The end date must be after the start date"),
                {
                  fields: {
                    neededUntil: "The end date must be after the start date",
                  },
                },
              );
            await api("/requests", {
              method: "POST",
              body: {
                items,
                neededFrom,
                neededUntil,
                purpose: form.get("purpose"),
              },
            });
            close(true);
            onSaved?.();
            ui.toast("Request submitted for approval.");
          }}
        >
          <Field
            name="neededFrom"
            label="Needed from (local time)"
            type="datetime-local"
            defaultValue={inputDate()}
            required
          />
          <Field
            name="neededUntil"
            label="Needed until (local time)"
            type="datetime-local"
            defaultValue={inputDate(Date.now() + 7 * 86400000)}
            required
          />
          <Field name="purpose" label="Purpose">
            <textarea required maxLength={500} />
          </Field>
          <p className="muted">
            Set a quantity for each equipment type you need. Requests do not
            reserve stock.
          </p>
          <div className="request-picker">
            {result.data.map((type) => (
              <section
                key={type._id}
                className={`request-choice${type.counts.available ? "" : " unavailable"}`}
              >
                <Field
                  name={`quantity-${type._id}`}
                  label={`${type.name} · ${type.counts.available} currently available out of ${type.counts.total}`}
                  type="number"
                  min={0}
                  max={500}
                  value={quantities[type._id] || 0}
                  onChange={(event) =>
                    setQuantities((current) => ({
                      ...current,
                      [type._id]: event.target.value,
                    }))
                  }
                />
                {!type.counts.available && (
                  <p className="stock-warning">
                    Currently unavailable. You can request for a future date;
                    approval depends on stock.
                  </p>
                )}
                {Number(quantities[type._id]) > type.counts.available && (
                  <p className="stock-warning" role="status">
                    Requested quantity exceeds current availability. Approval
                    depends on stock.
                  </p>
                )}
              </section>
            ))}
          </div>
        </Form>
      )}
    </Dialog>
  );
}

export function RequestsPage({ id }) {
  return id ? <RequestDetail id={id} /> : <RequestList />;
}
function RequestList() {
  const ui = useUI();
  const [revision, reload] = useReload();
  return (
    <>
      <Header
        title="Equipment requests"
        subtitle="Plan upcoming activities and track approvals."
      >
        <Button
          variant="primary"
          onClick={() => ui.open(RequestDialog, { onSaved: reload })}
        >
          ＋ New request
        </Button>
      </Header>
      <Panel title={manager() ? "Request queue" : "My requests"}>
        <PagedList
          path="/requests"
          revision={revision}
          search={false}
          filters={[
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
          ]}
          columns={[
            {
              label: "Request",
              render: (row) => (
                <Link
                  href={`/requests.html?id=${row._id}`}
                >{`RQ-${short(row._id)}`}</Link>
              ),
            },
            { label: "Requested by", render: (row) => row.requestedBy?.name },
            { label: "Purpose", key: "purpose" },
            {
              label: "Equipment",
              render: (row) =>
                row.items
                  .map((item) => `${item.equipment?.name} × ${item.quantity}`)
                  .join(", "),
            },
            { label: "Needed from", render: (row) => fmt(row.neededFrom) },
            { label: "Status", render: (row) => <Badge value={row.status} /> },
          ]}
        />
      </Panel>
    </>
  );
}
function RequestDetail({ id }) {
  const ui = useUI();
  const [revision, reload] = useReload();
  const result = useResource(`/requests/${id}`, revision);
  useRestoreScroll(!result.loading);
  if (!result.data)
    return result.error ? (
      <ErrorMessage error={result.error} retry={reload} />
    ) : (
      <Loading />
    );
  const record = result.data;
  const action = (name) =>
    ui.form({
      title: `${name[0].toUpperCase() + name.slice(1)} request`,
      fields: [
        {
          name: "notes",
          label: "Decision notes",
          type: "textarea",
          required: true,
        },
      ],
      onSubmit: async (data) => {
        await api(`/requests/${id}/${name}`, { method: "POST", body: data });
        reload();
        return {
          approve: "Request approved.",
          reject: "Request rejected.",
          cancel: "Request cancelled.",
        }[name];
      },
    });
  return (
    <>
      <Header
        title={`Request RQ-${short(id)}`}
        subtitle={`${record.requestedBy?.name} · ${record.purpose}`}
      >
        {manager() && record.status === "PENDING" && (
          <>
            <Button variant="primary" onClick={() => action("approve")}>
              Approve
            </Button>
            <Button onClick={() => action("reject")}>Reject</Button>
          </>
        )}
        {["PENDING", "APPROVED"].includes(record.status) && (
          <Button onClick={() => action("cancel")}>Cancel request</Button>
        )}
        {manager() && record.status === "APPROVED" && (
          <Button
            variant="primary"
            onClick={() =>
              ui.open(IssueDialog, {
                request: record,
                onSaved: () => navigate("/borrowings.html"),
              })
            }
          >
            Issue equipment
          </Button>
        )}
      </Header>
      <Link back href="/requests.html">
        ← Requests
      </Link>
      <Panel title="Request details">
        <div className="detail-line">
          <Badge value={record.status} />
          <span>{`From ${fmt(record.neededFrom)} to ${fmt(record.neededUntil)}`}</span>
        </div>
        <p>{record.notes}</p>
        <Table
          rows={record.items}
          columns={[
            {
              label: "Equipment",
              render: (line) => (
                <Link
                  href={`/equipment-details.html?id=${line.equipment?._id}`}
                >
                  {line.equipment?.name}
                </Link>
              ),
            },
            { label: "Quantity", key: "quantity" },
          ]}
        />
      </Panel>
      <Panel title="Status history">
        <Table
          rows={record.history}
          columns={[
            { label: "Status", render: (row) => <Badge value={row.status} /> },
            { label: "By", render: (row) => row.user?.name },
            { label: "At", render: (row) => fmt(row.at) },
            { label: "Notes", key: "notes" },
          ]}
        />
      </Panel>
    </>
  );
}

export function MaintenancePage() {
  const ui = useUI();
  const [revision, reload] = useReload();
  const report = () =>
    ui.form({
      title: "Report damaged equipment",
      fields: [
        {
          name: "equipmentItem",
          label: "Item ID",
          maxLength: 24,
          hint: "Open an item from the equipment catalog to report damage directly.",
        },
        {
          name: "description",
          label: "Damage description",
          type: "textarea",
          required: true,
        },
      ],
      onSubmit: async (data) => {
        await api("/maintenance", { method: "POST", body: data });
        reload();
        return "Damage reported; repair tracking started.";
      },
    });
  const update = (record, complete = false) =>
    ui.form({
      title: complete ? "Complete repair" : "Update maintenance",
      fields: [
        ...(complete
          ? [
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
            ]
          : [
              {
                name: "status",
                label: "Repair status",
                type: "select",
                options: opts(["OPEN", "IN_PROGRESS"]),
                value: record.status,
              },
            ]),
        {
          name: "cost",
          label: complete ? "Final cost" : "Cost (organization currency)",
          type: "number",
          min: 0,
          max: 10000000,
          step: 0.01,
          value: record.cost,
        },
        {
          name: "notes",
          label: complete ? "Completion notes" : "Notes",
          type: "textarea",
          value: record.notes,
        },
      ],
      onSubmit: async (data) => {
        if (complete) data.restore = data.restore === "yes";
        await api(`/maintenance/${record._id}${complete ? "/complete" : ""}`, {
          method: complete ? "POST" : "PATCH",
          body: data,
        });
        reload();
        return complete
          ? data.restore
            ? "Repair completed; item returned to available stock."
            : "Repair completed; item retired."
          : "Maintenance updated.";
      },
    });
  return (
    <>
      <Header
        title="Maintenance"
        subtitle="Record damage, track repairs, and return equipment to service."
      >
        <Button variant="primary" onClick={report}>
          Report damage
        </Button>
      </Header>
      <Panel title={manager() ? "Repair register" : "My damage reports"}>
        <PagedList
          path="/maintenance"
          search={false}
          revision={revision}
          filters={[
            {
              name: "status",
              label: "All statuses",
              options: opts(["OPEN", "IN_PROGRESS", "COMPLETED"]),
            },
          ]}
          columns={[
            {
              label: "Item",
              render: (row) => (
                <Link
                  href={`/equipment-item.html?id=${row.equipmentItem?._id}`}
                >
                  {row.equipmentItem?.itemCode}
                </Link>
              ),
            },
            { label: "Description", key: "description" },
            { label: "Status", render: (row) => <Badge value={row.status} /> },
            { label: "Cost", key: "cost" },
            { label: "Notes", key: "notes" },
            {
              label: "Actions",
              render: (row) =>
                manager() && row.status !== "COMPLETED" ? (
                  <Actions>
                    <Button onClick={() => update(row)}>Update</Button>
                    <Button onClick={() => update(row, true)}>Complete</Button>
                  </Actions>
                ) : (
                  fmt(row.completedAt)
                ),
            },
          ]}
        />
      </Panel>
    </>
  );
}
