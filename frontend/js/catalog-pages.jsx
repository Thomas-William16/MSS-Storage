import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { api, all, manager, admin, download } from "./api.js";
import { API_BASE_URL } from "./config.js";
import {
  Header,
  Panel,
  Button,
  Badge,
  Table,
  Link,
  Actions,
  Availability,
  PagedList,
  Loading,
  ErrorMessage,
  Dialog,
  useUI,
  useResource,
  useReload,
  useRestoreScroll,
  opts,
  fmt,
  short,
} from "./ui.jsx";

const conditions = opts(["NEW", "GOOD", "FAIR", "DAMAGED"]);
const options = (rows) =>
  (rows || []).map((row) => ({ value: row._id, label: row.name }));
export function EquipmentPage() {
  const ui = useUI();
  const [revision, reload] = useReload();
  const reference = useResource("categories", revision, async () => ({
    data: await all("/categories"),
  }));
  const [categories, setCategories] = useState([]);
  useEffect(() => {
    if (reference.data) setCategories(reference.data);
  }, [reference.data]);
  async function addCategory() {
    let created;
    await ui.form({
      title: "New category",
      fields: [
        { name: "name", label: "Name", maxLength: 100 },
        {
          name: "description",
          label: "Description",
          type: "textarea",
          required: false,
        },
      ],
      onSubmit: async (data) => {
        created = (await api("/categories", { method: "POST", body: data }))
          .data;
        setCategories((current) =>
          [...current, created].sort((a, b) => a.name.localeCompare(b.name)),
        );
        return "Category created and ready to use.";
      },
    });
    return created
      ? {
          value: created._id,
          options: options(
            [...categories, created].sort((a, b) =>
              a.name.localeCompare(b.name),
            ),
          ),
        }
      : null;
  }
  async function edit(record = {}) {
    await ui.form({
      title: record._id ? "Edit equipment" : "New equipment",
      fields: [
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
          options: options(categories),
          action: admin() ? { label: "Add category", run: addCategory } : null,
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
          min: record._id ? record.counts.total : 1,
          max: (record.counts?.total || 0) + 500,
          value: record._id ? record.counts.total : 1,
          hint: "Increase to add physical items. Existing items and their history are kept.",
        },
      ],
      onSubmit: async (data) => {
        await api(record._id ? `/equipment/${record._id}` : "/equipment", {
          method: record._id ? "PATCH" : "POST",
          body: data,
        });
        reload();
        return record._id
          ? "Equipment updated."
          : `Equipment created with ${data.totalStock} available items.`;
      },
    });
  }
  return (
    <>
      <Header
        title="Equipment"
        subtitle="Manage equipment types and track each physical item."
      >
        {manager() && (
          <Button
            variant="primary"
            disabled={reference.loading}
            onClick={() => edit()}
          >
            ＋ New equipment
          </Button>
        )}
        {admin() && <Button onClick={addCategory}>＋ Add new category</Button>}
      </Header>
      {reference.error && (
        <ErrorMessage error={reference.error} retry={reload} />
      )}
      <Panel title="Equipment inventory">
        <PagedList
          path="/equipment"
          revision={revision}
          filters={[
            {
              name: "category",
              label: "All categories",
              options: options(categories),
            },
          ]}
          columns={[
            {
              label: "Equipment",
              render: (row) => (
                <div className="equipment-cell">
                  <div>
                    <Link href={`/equipment-details.html?id=${row._id}`}>
                      {row.name}
                    </Link>
                    <small className="subline">{row.description}</small>
                  </div>
                </div>
              ),
            },
            { label: "Category", render: (row) => row.category?.name },
            { label: "Total", render: (row) => row.counts.total },
            {
              label: "Availability",
              render: (row) => <Availability counts={row.counts} />,
            },
            { label: "Borrowed", render: (row) => row.counts.borrowed },
            { label: "Maintenance", render: (row) => row.counts.maintenance },
            {
              label: "Actions",
              render: (row) =>
                manager() ? (
                  <Actions>
                    <Button onClick={() => edit(row)}>Edit</Button>
                    <Button
                      onClick={() =>
                        ui.confirm(
                          "Archive equipment?",
                          `Retire available items, keep the history for ${row.name}, and hide it from the active catalog.`,
                          async () => {
                            await api(`/equipment/${row._id}`, {
                              method: "DELETE",
                            });
                            reload();
                          },
                        )
                      }
                    >
                      Archive
                    </Button>
                  </Actions>
                ) : (
                  <Link href={`/equipment-details.html?id=${row._id}`}>
                    View items
                  </Link>
                ),
            },
          ]}
        />
      </Panel>
    </>
  );
}

export function EquipmentDetailPage({ id }) {
  const ui = useUI();
  const [revision, reload] = useReload();
  const result = useResource(`/equipment/${id}`, revision);
  useRestoreScroll(!result.loading);
  if (!result.data)
    return result.error ? (
      <ErrorMessage error={result.error} retry={reload} />
    ) : (
      <Loading />
    );
  const record = result.data;
  const batch = () =>
    ui.form({
      title: "Add physical items",
      submit: "Review batch",
      fields: [
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
      onSubmit: async (data) => {
        if (data.codes) data.codes = data.codes.split(/\s+/).filter(Boolean);
        else delete data.codes;
        const preview = await api(
          `/equipment/${id}/items/preview?quantity=${data.quantity}`,
        );
        if (
          !(await ui.confirm(
            "Review item batch",
            `${data.quantity} items, ${data.condition}. Codes: ${(data.codes || preview.data.codes).join(", ")}. Automatically generated codes are provisional until creation.`,
          ))
        )
          throw new Error("Batch creation cancelled");
        const created = await api(`/equipment/${id}/items/bulk`, {
          method: "POST",
          body: data,
        });
        reload();
        return `Created ${created.data.length} physical items`;
      },
    });
  return (
    <>
      <Header
        title={record.name}
        subtitle={record.description || "Physical item inventory"}
      >
        {manager() && !record.archivedAt && (
          <Button variant="primary" onClick={batch}>
            ＋ Add items
          </Button>
        )}
        <Button
          onClick={async () => {
            const items = await all(`/equipment/${id}/items`);
            await ui.open(PrintLabels, { ids: items.map((item) => item._id) });
          }}
        >
          Print all QR labels
        </Button>
      </Header>
      <Link back href="/equipment.html">
        ← Equipment
      </Link>
      <div className="stats">
        {Object.entries(record.counts)
          .filter(([key]) => key !== "_id")
          .map(([key, value]) => (
            <article key={key} className="stat compact" data-count={key}>
              <span className="stat-label">{key}</span>
              <strong>{value}</strong>
            </article>
          ))}
      </div>
      <p className="muted">
        Status totals are mutually exclusive. Damaged is a separate condition
        metric and can overlap maintenance or borrowed.
      </p>
      <Panel title="Individual items">
        <PagedList
          path={`/equipment/${id}/items`}
          revision={revision}
          filters={[
            {
              name: "status",
              label: "All statuses",
              options: opts([
                "AVAILABLE",
                "BORROWED",
                "MAINTENANCE",
                "LOST",
                "RETIRED",
              ]),
            },
          ]}
          columns={[
            {
              label: "Item code",
              render: (row) => (
                <Link href={`/equipment-item.html?id=${row._id}`}>
                  {row.itemCode}
                </Link>
              ),
            },
            {
              label: "Condition",
              render: (row) => <Badge value={row.condition} />,
            },
            { label: "Status", render: (row) => <Badge value={row.status} /> },
            { label: "Serial", key: "serialNumber" },
            { label: "Notes", key: "notes" },
          ]}
        />
      </Panel>
    </>
  );
}

export function QR({ id, onLoad }) {
  const [image, setImage] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    let active = true,
      url;
    const controller = new AbortController();
    fetch(`${API_BASE_URL}/api/v1/items/${id}/qr`, {
      credentials: "include",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not generate QR");
        return response.blob();
      })
      .then((blob) => {
        if (active) {
          url = URL.createObjectURL(blob);
          setImage(url);
        }
      })
      .catch((err) => {
        if (active) setError(err);
      });
    return () => {
      active = false;
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [id]);
  return error ? (
    <ErrorMessage error={error} />
  ) : image ? (
    <img
      src={image}
      alt="Item QR code"
      width={160}
      height={160}
      onLoad={onLoad}
    />
  ) : (
    <Loading />
  );
}
function PrintLabels({ ids, close }) {
  const [ready, setReady] = useState(0);
  const result = useResource("print-labels", 0, async () => {
    if (ids.length > 500) throw new Error("Print up to 500 labels at a time");
    const rows = [];
    for (let index = 0; index < ids.length; index += 4)
      rows.push(
        ...(await Promise.all(
          ids
            .slice(index, index + 4)
            .map((id) => api(`/items/${id}`).then((result) => result.data)),
        )),
      );
    return { data: rows };
  });
  return (
    <Dialog title="QR labels" close={close}>
      {result.error ? (
        <ErrorMessage error={result.error} />
      ) : (
        <>
          <p>{`${ready} of ${ids.length} labels ready`}</p>
          <Actions>
            <Button onClick={() => close(null)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={ready !== ids.length || !ids.length}
              onClick={() => window.print()}
            >
              Print labels
            </Button>
          </Actions>
          {result.data &&
            createPortal(
              <section id="print-labels" className="print-labels">
                {result.data.map((item) => (
                  <article key={item._id} className="qr-label">
                    <QR
                      id={item._id}
                      onLoad={() => setReady((value) => value + 1)}
                    />
                    <strong>{item.itemCode}</strong>
                    <span>{item.equipmentId?.name}</span>
                  </article>
                ))}
              </section>,
              document.body,
            )}
        </>
      )}
    </Dialog>
  );
}

export function ItemPage({ id }) {
  const ui = useUI();
  const [revision, reload] = useReload();
  const result = useResource(`/items/${id}`, revision);
  useRestoreScroll(!result.loading);
  if (!result.data)
    return result.error ? (
      <ErrorMessage error={result.error} retry={reload} />
    ) : (
      <Loading />
    );
  const item = result.data;
  const edit = () =>
    ui.form({
      title: "Edit physical item",
      fields: [
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
                options: opts(["AVAILABLE", "LOST", "RETIRED"]),
              },
            ]
          : []),
        { name: "notes", label: "Notes", type: "textarea", value: item.notes },
      ],
      onSubmit: async (data) => {
        await api(`/items/${id}`, { method: "PATCH", body: data });
        reload();
        return "Item updated.";
      },
    });
  return (
    <>
      <Header
        title={item.itemCode}
        subtitle={item.equipmentId?.name || "Physical item"}
      >
        {manager() && (
          <Button variant="primary" onClick={edit}>
            Edit item
          </Button>
        )}
        <Button
          onClick={() =>
            ui.form({
              title: "Report damage",
              fields: [
                {
                  name: "description",
                  label: "Describe the damage",
                  type: "textarea",
                  required: true,
                },
              ],
              onSubmit: async (data) => {
                await api("/maintenance", {
                  method: "POST",
                  body: { ...data, equipmentItem: id },
                });
                reload();
                return "Damage reported; repair tracking started.";
              },
            })
          }
        >
          Report damage
        </Button>
      </Header>
      <Link back href={`/equipment-details.html?id=${item.equipmentId?._id}`}>
        ← Equipment
      </Link>
      <div className="detail-grid">
        <Panel title="Item details">
          <dl>
            <dt>Status</dt>
            <dd>
              <Badge value={item.status} />
            </dd>
            <dt>Condition</dt>
            <dd>
              <Badge value={item.condition} />
            </dd>
            <dt>Serial</dt>
            <dd>{item.serialNumber || "—"}</dd>
            <dt>Notes</dt>
            <dd>{item.notes || "—"}</dd>
          </dl>
        </Panel>
        <Panel title="QR label">
          <QR id={id} />
          <p className="muted">
            Scanning opens this item page. Authentication is still required.
          </p>
          <Button
            onClick={() => download(`/items/${id}/qr`, `${item.itemCode}.svg`)}
          >
            Download QR
          </Button>
        </Panel>
      </div>
      {manager() && (
        <>
          <Panel title="Borrowing history">
            <Table
              rows={item.history}
              columns={[
                {
                  label: "Borrower",
                  render: (row) => row.borrowing?.user?.name,
                },
                {
                  label: "Borrowing",
                  render: (row) => (
                    <Link href={`/borrowings.html?id=${row.borrowing?._id}`}>
                      {short(row.borrowing?._id)}
                    </Link>
                  ),
                },
                { label: "Before", key: "conditionBefore" },
                { label: "After", key: "conditionAfter" },
                { label: "Resolved at", render: (row) => fmt(row.returnedAt) },
              ]}
            />
          </Panel>
          <Panel title="Maintenance history">
            <Table
              rows={item.maintenance}
              columns={[
                { label: "Description", key: "description" },
                {
                  label: "Status",
                  render: (row) => <Badge value={row.status} />,
                },
                { label: "Cost", key: "cost" },
                { label: "Completed", render: (row) => fmt(row.completedAt) },
              ]}
            />
          </Panel>
        </>
      )}
    </>
  );
}

export function UsersPage() {
  const ui = useUI();
  const [revision, reload] = useReload();
  const edit = (record) =>
    ui.form({
      title: record ? "Edit user" : "New user",
      fields: [
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
            : "Password (at least 8 characters)",
          type: "password",
          required: !record,
          autocomplete: "new-password",
          minLength: 8,
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
          options: opts(["SCOUT", "STORAGE_KEEPER", "ADMIN"]),
        },
      ],
      onSubmit: async (data) => {
        await api(record ? `/users/${record._id}` : "/users", {
          method: record ? "PATCH" : "POST",
          body: data,
        });
        reload();
        return record ? "User updated." : "User created.";
      },
    });
  return (
    <>
      <Header
        title="Users"
        subtitle="Manage accounts, permissions, and account access."
      >
        <Button variant="primary" onClick={() => edit()}>
          ＋ New user
        </Button>
      </Header>
      <Panel title="Team members">
        <PagedList
          path="/users"
          revision={revision}
          columns={[
            { label: "Name", key: "name" },
            { label: "Email", key: "email" },
            { label: "Role", render: (row) => <Badge value={row.role} /> },
            {
              label: "Access",
              render: (row) => (
                <Badge value={row.isActive ? "ACTIVE" : "INACTIVE"} />
              ),
            },
            {
              label: "Actions",
              render: (row) => (
                <Actions>
                  <Button onClick={() => edit(row)}>Edit</Button>
                  <Button
                    onClick={() =>
                      ui.confirm(
                        "Change account access?",
                        `Update access for ${row.name}. Existing sessions will be revoked.`,
                        async () => {
                          await api(`/users/${row._id}/status`, {
                            method: "PATCH",
                            body: { isActive: !row.isActive },
                          });
                          reload();
                        },
                      )
                    }
                  >
                    {row.isActive ? "Deactivate" : "Activate"}
                  </Button>
                </Actions>
              ),
            },
          ]}
        />
      </Panel>
    </>
  );
}
