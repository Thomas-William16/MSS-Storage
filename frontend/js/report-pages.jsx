import React, { useState } from "react";
import { all, download, manager, admin, currentUser } from "./api.js";
import { IssueDialog, RequestDialog } from "./workflow-pages.jsx";
import {
  Header,
  Panel,
  Button,
  Badge,
  Table,
  Link,
  Actions,
  PagedList,
  Pager,
  Loading,
  ErrorMessage,
  Field,
  useUI,
  useResource,
  useReload,
  useRestoreScroll,
  useListState,
  fmt,
  short,
} from "./ui.jsx";

const borrowingColumns = [
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
  { label: "Status", render: (row) => <Badge value={row.status} /> },
];
export function DashboardPage() {
  const ui = useUI();
  const [revision, reload] = useReload();
  const result = useResource("/reports/dashboard", revision);
  useRestoreScroll(!result.loading);
  if (!result.data)
    return result.error ? (
      <ErrorMessage error={result.error} retry={reload} />
    ) : (
      <Loading />
    );
  const data = result.data;
  const hour = new Date().getHours();
  const stats = [
    [
      "Physical items",
      data.physicalItems,
      `${data.equipmentTypes} equipment types`,
    ],
    ["Available", data.counts.AVAILABLE || 0, "Ready for the next adventure"],
    ["Borrowed", data.counts.BORROWED || 0, "Currently out with the group"],
    [
      "Maintenance",
      data.counts.MAINTENANCE || 0,
      "Awaiting repair or inspection",
    ],
  ];
  return (
    <>
      <Header
        title="Storage overview"
        subtitle={`Good ${hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening"}, ${currentUser.name}. Here’s the latest from your storage.`}
      />
      <Panel title="Quick actions">
        <div className="quick-actions">
          {manager() ? (
            <>
              <Button
                variant="primary"
                onClick={() => ui.open(IssueDialog, { onSaved: reload })}
              >
                Issue equipment
              </Button>
              <a className="button secondary" href="/borrowings.html">
                Record returns
              </a>
            </>
          ) : (
            <>
              <Button
                variant="primary"
                onClick={() => ui.open(RequestDialog, { onSaved: reload })}
              >
                Request equipment
              </Button>
              <a className="button secondary" href="/borrowings.html">
                My borrowings
              </a>
            </>
          )}
          <a className="button secondary" href="/equipment.html">
            Browse equipment
          </a>
        </div>
      </Panel>
      <div className="stats">
        {stats.map(([label, value, detail]) => (
          <article className="stat" key={label}>
            <span className="stat-label">{label}</span>
            <strong>{value}</strong>
            <small>{detail}</small>
          </article>
        ))}
      </div>
      <div className="dashboard-grid">
        <Panel title="Attention needed">
          <div className="attention-row">
            <div>
              <strong>{data.overdue}</strong>
              <p>
                {manager() ? "Overdue borrowings" : "My overdue borrowings"}
              </p>
            </div>
            <Link href="/borrowings.html">Review borrowings →</Link>
          </div>
          <div className="attention-row">
            <div>
              <strong>{data.pendingRequests}</strong>
              <p>{manager() ? "Pending requests" : "My pending requests"}</p>
            </div>
            <Link href="/requests.html">View requests →</Link>
          </div>
          <div className="attention-row">
            <div>
              <strong>{data.counts.LOST || 0}</strong>
              <p>Lost items</p>
            </div>
            {manager() && (
              <Link href="/reports.html?type=lost">View lost report →</Link>
            )}
          </div>
        </Panel>
        <Panel title="Low-stock equipment">
          <Table
            rows={data.lowStock}
            columns={[
              {
                label: "Equipment",
                render: (row) => (
                  <Link href={`/equipment-details.html?id=${row._id}`}>
                    {row.name}
                  </Link>
                ),
              },
              {
                label: "Available",
                render: (row) => <Badge value={row.counts.available} />,
              },
              { label: "Minimum", key: "minimumStock" },
            ]}
          />
        </Panel>
      </div>
      <Panel title={manager() ? "Recent borrowings" : "My recent borrowings"}>
        <Table columns={borrowingColumns} rows={data.recentBorrowings} />
      </Panel>
      {manager() && (
        <Panel title="Recent activity">
          <div className="activity-feed">
            {data.recentActivity.map((row) => (
              <div key={row._id} className="activity">
                <span className="activity-dot" />
                <div>
                  <strong>{row.action.replaceAll("_", " ")}</strong>
                  <small className="subline">{`${row.user?.name || "System"} · ${fmt(row.timestamp)}`}</small>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </>
  );
}

const types = [
  "inventory",
  "borrowings",
  "overdue",
  "damaged",
  "lost",
  "maintenance",
  "most-borrowed",
];
export function ReportsPage() {
  const [state, change] = useListState("reports", {
    type: "inventory",
    category: "",
    from: "",
    to: "",
  });
  const [draft, setDraft] = useState(state);
  const [filterError, setFilterError] = useState("");
  const references = useResource("report-categories", 0, async () => ({
    data: await all("/categories"),
  }));
  const type = types.includes(state.type) ? state.type : "inventory";
  const query = new URLSearchParams({ page: state.page, limit: 25 });
  if (state.category) query.set("category", state.category);
  if (state.from)
    query.set("from", new Date(`${state.from}T00:00:00`).toISOString());
  if (state.to)
    query.set("to", new Date(`${state.to}T23:59:59.999`).toISOString());
  const result = useResource(`/reports/${type}?${query}`);
  useRestoreScroll(!result.loading);
  const columns =
    type === "inventory"
      ? [
          { label: "Equipment", key: "name" },
          { label: "Category", render: (row) => row.category?.name },
          ...[
            "total",
            "available",
            "borrowed",
            "maintenance",
            "lost",
            "retired",
            "damaged",
          ].map((key) => ({ label: key, render: (row) => row.counts[key] })),
        ]
      : type === "most-borrowed"
        ? [
            { label: "Equipment", render: (row) => row.equipment.name },
            { label: "Times borrowed", key: "borrowCount" },
          ]
        : ["borrowings", "overdue"].includes(type)
          ? borrowingColumns
          : type === "maintenance"
            ? [
                { label: "Item", render: (row) => row.equipmentItem?.itemCode },
                { label: "Description", key: "description" },
                {
                  label: "Status",
                  render: (row) => <Badge value={row.status} />,
                },
                { label: "Cost", key: "cost" },
              ]
            : [
                {
                  label: "Item",
                  render: (row) => (
                    <Link href={`/equipment-item.html?id=${row._id}`}>
                      {row.itemCode}
                    </Link>
                  ),
                },
                { label: "Equipment", render: (row) => row.equipmentId?.name },
                {
                  label: "Condition",
                  render: (row) => <Badge value={row.condition} />,
                },
                {
                  label: "Status",
                  render: (row) => <Badge value={row.status} />,
                },
              ];
  return (
    <>
      <Header
        title="Reports"
        subtitle="Review operational data and export the current page as a safe CSV."
      >
        <Button
          disabled={result.loading || !!result.error}
          onClick={() =>
            download(
              `/reports/${type}?${query}&format=csv`,
              `${type}-page-${state.page}.csv`,
            )
          }
        >
          Export current page
        </Button>
      </Header>
      <Panel title="Report explorer">
        <form
          className="toolbar report-filters"
          onSubmit={(event) => {
            event.preventDefault();
            if (draft.from && draft.to && draft.to < draft.from) {
              setFilterError("The end date must be after the start date");
              return;
            }
            setFilterError("");
            change({ ...draft, page: 1 });
          }}
        >
          <select
            aria-label="Report type"
            value={draft.type}
            onChange={(event) =>
              setDraft((current) => ({ ...current, type: event.target.value }))
            }
          >
            {types.map((value) => (
              <option key={value} value={value}>
                {value.replaceAll("-", " ").toUpperCase()}
              </option>
            ))}
          </select>
          <select
            aria-label="Category"
            value={draft.category}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                category: event.target.value,
              }))
            }
          >
            <option value="">All categories</option>
            {(references.data || []).map((row) => (
              <option key={row._id} value={row._id}>
                {row.name}
              </option>
            ))}
          </select>
          <Field
            label="From"
            name="from"
            type="date"
            value={draft.from}
            onChange={(event) =>
              setDraft((current) => ({ ...current, from: event.target.value }))
            }
          />
          <Field
            label="Through"
            name="to"
            type="date"
            value={draft.to}
            onChange={(event) =>
              setDraft((current) => ({ ...current, to: event.target.value }))
            }
          />
          <button type="submit" className="button primary">
            Apply filters
          </button>
        </form>
        {filterError && <ErrorMessage error={filterError} />}
        {references.error && <ErrorMessage error={references.error} />}
        <div aria-busy={result.loading}>
          {result.loading && <Loading />}
          {result.error ? (
            <ErrorMessage error={result.error} />
          ) : (
            result.data && <Table rows={result.data} columns={columns} />
          )}
        </div>
        <Pager
          meta={result.meta}
          page={state.page}
          onChange={(page) => change({ page })}
        />
      </Panel>
    </>
  );
}

export function AuditPage() {
  return (
    <>
      <Header
        title="Audit trail"
        subtitle="A record of account access and important inventory changes."
      />
      <Panel title="Activity log">
        <PagedList
          path="/audit-logs"
          search={false}
          columns={[
            { label: "Time", render: (row) => fmt(row.timestamp) },
            { label: "User", render: (row) => row.user?.name || "System" },
            { label: "Action", render: (row) => <Badge value={row.action} /> },
            { label: "Entity", key: "entity" },
            { label: "Reference", render: (row) => short(row.entityId) },
            {
              label: "Details",
              render: (row) => <code>{JSON.stringify(row.details || {})}</code>,
            },
          ]}
        />
      </Panel>
    </>
  );
}
export function SettingsPage() {
  return (
    <>
      <Header
        title="Account & system"
        subtitle="Your account information and deployment configuration."
      />
      <Panel title="My account">
        <dl>
          <dt>Name</dt>
          <dd>{currentUser.name}</dd>
          <dt>Email</dt>
          <dd>{currentUser.email}</dd>
          <dt>Role</dt>
          <dd>
            <Badge value={currentUser.role} />
          </dd>
        </dl>
        <p className="muted">
          Contact an administrator to change your account or password.
        </p>
      </Panel>
      {admin() && (
        <Panel title="System configuration">
          <p>
            Database access, public URLs, CORS origins and cookie policy are
            configured through backend environment variables. Follow the
            deployment guide in the repository README.
          </p>
          <Link href="/users.html">Manage user accounts</Link>
        </Panel>
      )}
    </>
  );
}
