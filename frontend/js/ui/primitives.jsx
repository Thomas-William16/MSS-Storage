import React from "react";
import { Button } from "./Button.jsx";
export function Badge({ value }) {
  return (
    <span className={`badge ${String(value).toLowerCase()}`}>
      {String(value).replaceAll("_", " ")}
    </span>
  );
}
export function Link({ children, href, back = false }) {
  return (
    <a
      className="text-link"
      href={href}
      onClick={(event) => {
        if (
          !back ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          !history.state?.from
        )
          return;
        const previous = new URL(history.state.from, location.origin);
        const target = new URL(href, location.origin);
        if (
          previous.pathname === target.pathname &&
          previous.searchParams.get("id") === target.searchParams.get("id")
        ) {
          event.preventDefault();
          history.back();
        }
      }}
    >
      {children}
    </a>
  );
}
export function Actions({ children }) {
  return <div className="actions">{children}</div>;
}
export function Header({ title, subtitle, children }) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">SCOUT STORAGE</p>
        <h1>{title}</h1>
        <p className="muted">{subtitle}</p>
      </div>
      <Actions>{children}</Actions>
    </div>
  );
}
export function Panel({ title, children }) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      {children}
    </section>
  );
}
export function Availability({ counts = {} }) {
  return (
    <span className={`availability${counts.available ? "" : " unavailable"}`}>
      <strong>{`${counts.available || 0} available out of ${counts.total || 0}`}</strong>
      {!counts.available && (
        <small className="subline">Currently unavailable</small>
      )}
    </span>
  );
}
export function Table({ columns, rows = [], className = "" }) {
  return (
    <div className={`table-wrap ${className}`}>
      <table role="table">
        <thead role="rowgroup">
          <tr role="row">
            {columns.map((column, i) => (
              <th key={i} scope="col" role="columnheader">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody role="rowgroup">
          {rows.map((row, i) => (
            <tr key={row._id || i} role="row">
              {columns.map((column, j) => (
                <td key={j} data-label={column.label} role="cell">
                  <span className="mobile-cell-label" aria-hidden="true">
                    {column.label}
                  </span>
                  <div className="cell-value">
                    {column.render
                      ? column.render(row)
                      : (row[column.key] ?? "—")}
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && (
        <div className="empty">
          <strong>Nothing here yet</strong>
          <p>New records will appear here.</p>
        </div>
      )}
    </div>
  );
}
export function Loading() {
  return (
    <p className="loading" role="status">
      Loading your workspace…
    </p>
  );
}
export function ErrorMessage({ error, retry }) {
  return (
    <div className="form-error" role="alert">
      <p>{error?.message || error}</p>
      {retry && <Button onClick={retry}>Try again</Button>}
    </div>
  );
}
