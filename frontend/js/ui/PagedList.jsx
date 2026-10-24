import React, { useState } from "react";
import { Button } from "./Button.jsx";
import { Table, Loading, ErrorMessage } from "./primitives.jsx";
import { useResource } from "../hooks/resource.js";
import { useListState, useRestoreScroll } from "../hooks/navigation.js";
export function Pager({ meta, page, onChange }) {
  return (
    <div className="pagination">
      <span className="muted">{`${meta?.total || 0} records · Page ${page} of ${meta?.pages || 1}`}</span>
      {page > 1 && <Button onClick={() => onChange(page - 1)}>Previous</Button>}
      {page < (meta?.pages || 1) && (
        <Button onClick={() => onChange(page + 1)}>Next</Button>
      )}
    </div>
  );
}
export function PagedList({
  path,
  columns,
  filters = [],
  search = true,
  revision = 0,
}) {
  const [state, change] = useListState(
    path,
    Object.fromEntries(filters.map((filter) => [filter.name, ""])),
  );
  const [draft, setDraft] = useState(state.search);
  const query = new URLSearchParams({
    ...Object.fromEntries(
      Object.entries(state).filter(([, value]) => value !== ""),
    ),
    limit: 25,
  });
  const result = useResource(
    `${path}${path.includes("?") ? "&" : "?"}${query}`,
    revision,
  );
  useRestoreScroll(!result.loading);
  return (
    <>
      <form
        className="toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          change({ page: 1, search: draft });
        }}
      >
        {search && (
          <div className="search-form">
            <input
              type="search"
              aria-label="Search records"
              placeholder="Search records…"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
            <button type="submit" className="button secondary">
              Search
            </button>
          </div>
        )}
        {filters.map((filter) => (
          <select
            key={filter.name}
            aria-label={filter.label}
            value={state[filter.name] || ""}
            onChange={(event) =>
              change({ page: 1, [filter.name]: event.target.value })
            }
          >
            <option value="">{filter.label}</option>
            {filter.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ))}
      </form>
      <div aria-busy={result.loading}>
        {result.loading && <Loading />}
        {result.error ? (
          <ErrorMessage error={result.error} />
        ) : (
          result.data && <Table columns={columns} rows={result.data} />
        )}
      </div>
      <Pager
        meta={result.meta}
        page={state.page}
        onChange={(page) => change({ page })}
      />
    </>
  );
}
