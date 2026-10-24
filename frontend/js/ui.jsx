import React, {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { api, currentUser } from "./api.js";
import { dateText } from "./i18n.js";

export const fmt = dateText;
export const short = (value) =>
  String(value || "")
    .slice(-8)
    .toUpperCase();
export const opts = (values) =>
  values.map((value) => ({ value, label: value.replaceAll("_", " ") }));
export const inputDate = (value) => {
  const d = new Date(value || Date.now());
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};
export const iso = (value) => new Date(value).toISOString();
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

const UI = createContext(null);
export const useUI = () => useContext(UI);
export function Button({
  children,
  onClick,
  variant = "secondary",
  disabled,
  ...props
}) {
  const [busy, setBusy] = useState(false);
  const ui = useUI();
  const pending = useRef(false);
  return (
    <button
      type="button"
      className={`button ${variant}`}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...props}
      onClick={async () => {
        if (pending.current) return;
        pending.current = true;
        setBusy(true);
        try {
          await onClick?.();
        } catch (error) {
          ui?.toast(error.message, "error");
        } finally {
          pending.current = false;
          setBusy(false);
        }
      }}
    >
      {children}
    </button>
  );
}

function Dialog({ children, title, close, wide = false }) {
  const ref = useRef(null);
  const heading = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return createPortal(
    <dialog
      ref={ref}
      className={`modal${wide ? " wide" : ""}`}
      aria-labelledby={heading}
      onCancel={(event) => {
        event.preventDefault();
        close(null);
      }}
      onClose={() => close(null)}
    >
      <h2 id={heading}>{title}</h2>
      {children}
    </dialog>,
    document.body,
  );
}

export function UIProvider({ children }) {
  const [dialogs, setDialogs] = useState([]);
  const [toasts, setToasts] = useState([]);
  const pending = useRef(new Map());
  const timers = useRef(new Set());
  const open = (Component, props = {}) =>
    new Promise((resolve) => {
      const id = crypto.randomUUID();
      pending.current.set(id, resolve);
      setDialogs((items) => [...items, { id, Component, props }]);
    });
  const close = (id, value) => {
    const resolve = pending.current.get(id);
    pending.current.delete(id);
    resolve?.(value);
    setDialogs((items) => items.filter((item) => item.id !== id));
  };
  const dismiss = () => {
    for (const resolve of pending.current.values()) resolve(null);
    pending.current.clear();
    setDialogs([]);
  };
  useEffect(() => {
    window.addEventListener("popstate", dismiss);
    window.addEventListener("scout:signed-out", dismiss);
    return () => {
      window.removeEventListener("popstate", dismiss);
      window.removeEventListener("scout:signed-out", dismiss);
      for (const timer of timers.current) clearTimeout(timer);
    };
  }, []);
  const toast = (message, type = "success") => {
    const id = crypto.randomUUID();
    setToasts((items) => [...items, { id, message, type }]);
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      setToasts((items) => items.filter((item) => item.id !== id));
    }, 7000);
    timers.current.add(timer);
  };
  const ui = {
    open,
    toast,
    form: (props) => open(FormDialog, props),
    confirm: (title, message, action) =>
      open(ConfirmDialog, { title, message, action }),
  };
  return (
    <UI.Provider value={ui}>
      {children}
      {dialogs.map(({ id, Component, props }) => (
        <Component key={id} {...props} close={(value) => close(id, value)} />
      ))}
      {createPortal(
        toasts.map((item) => (
          <div
            key={item.id}
            className={`toast ${item.type}`}
            role={item.type === "error" ? "alert" : "status"}
          >
            {item.message}
          </div>
        )),
        document.getElementById("toasts"),
      )}
    </UI.Provider>
  );
}

export function Form({
  children,
  onSubmit,
  submit = "Save",
  close,
  className = "",
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [invalid, setInvalid] = useState({});
  const ref = useRef(null);
  const lock = useRef(false);
  async function save(event) {
    event.preventDefault();
    if (lock.current) return;
    const fields = [...ref.current.elements].filter(
      (input) => input.name && input.willValidate,
    );
    const errors = Object.fromEntries(
      fields
        .filter((input) => !input.checkValidity())
        .map((input) => [input.name, input.validationMessage]),
    );
    setInvalid(errors);
    setError(null);
    if (Object.keys(errors).length) {
      fields.find((input) => errors[input.name])?.focus();
      return;
    }
    lock.current = true;
    setBusy(true);
    try {
      await onSubmit(new FormData(ref.current));
    } catch (err) {
      setError(err.message);
      setInvalid(err.fields || {});
      const field = fields.find((input) => err.fields?.[input.name]);
      if (field) field.focus();
      else ref.current.querySelector('[role="alert"]')?.focus();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <FormState.Provider value={invalid}>
      <form
        ref={ref}
        noValidate
        className={className}
        onSubmit={save}
        aria-busy={busy}
        onInput={(event) => {
          const name = event.target.name;
          if (invalid[name])
            setInvalid((current) => ({ ...current, [name]: undefined }));
        }}
      >
        <fieldset className="form-fields" disabled={busy}>
          {children}
        </fieldset>
        {error && (
          <p className="form-error" role="alert" tabIndex={-1}>
            {error}
          </p>
        )}
        <Actions>
          {close && (
            <Button disabled={busy} onClick={() => close(null)}>
              Cancel
            </Button>
          )}
          <button type="submit" className="button primary" disabled={busy}>
            {busy ? "Saving…" : submit}
          </button>
          {busy && (
            <span className="muted" role="status">
              Saving…
            </span>
          )}
        </Actions>
      </form>
    </FormState.Provider>
  );
}
const FormState = createContext({});
export function Field({ label, name, children, hint, ...props }) {
  const id = useId();
  const errors = useContext(FormState);
  const error = errors[name];
  const child = children || <input {...props} />;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {React.cloneElement(child, {
        id,
        name,
        "aria-invalid": error ? "true" : undefined,
        "aria-describedby": error || hint ? `${id}-help` : undefined,
      })}
      {(error || hint) && (
        <small id={`${id}-help`} className={error ? "form-error" : "muted"}>
          {error || hint}
        </small>
      )}
    </div>
  );
}
function FormDialog({
  title,
  fields: initialFields,
  onSubmit,
  close,
  submit = "Save",
  intro,
  success = "Saved successfully",
}) {
  const [fields, setFields] = useState(initialFields);
  const [values, setValues] = useState(() =>
    Object.fromEntries(
      initialFields.map((field) => [
        field.name,
        field.value ??
          (field.type === "select" ? field.options?.[0]?.value || "" : ""),
      ]),
    ),
  );
  const ui = useUI();
  return (
    <Dialog title={title} close={close}>
      <Form
        close={close}
        submit={submit}
        onSubmit={async () => {
          const data = {};
          for (const field of fields) {
            const value = values[field.name];
            if (value === "" && field.required === false) continue;
            data[field.name] = field.type === "number" ? Number(value) : value;
          }
          const result = await onSubmit(data);
          close(result ?? true);
          if (success !== false)
            ui.toast(typeof result === "string" ? result : success);
        }}
      >
        {intro && <p className="muted">{intro}</p>}
        {fields.map((field) => {
          const props = {
            required: field.required ?? field.type !== "textarea",
            value: values[field.name],
            onChange: (event) =>
              setValues((current) => ({
                ...current,
                [field.name]: event.target.value,
              })),
            min: field.min,
            max: field.max,
            step: field.step,
            minLength: field.minLength,
            maxLength: field.maxLength || 2000,
            autoComplete: field.autocomplete || "off",
            placeholder: field.placeholder,
          };
          return (
            <React.Fragment key={field.name}>
              <Field name={field.name} label={field.label} hint={field.hint}>
                {field.type === "select" ? (
                  <select {...props}>
                    {field.options.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : field.type === "textarea" ? (
                  <textarea {...props} rows={3} />
                ) : (
                  <input {...props} type={field.type || "text"} />
                )}
              </Field>
              {field.action && (
                <Button
                  onClick={async () => {
                    const result = await field.action.run();
                    if (result) {
                      setFields((current) =>
                        current.map((item) =>
                          item.name === field.name
                            ? { ...item, options: result.options }
                            : item,
                        ),
                      );
                      setValues((current) => ({
                        ...current,
                        [field.name]: result.value,
                      }));
                    }
                  }}
                >
                  {field.action.label}
                </Button>
              )}
            </React.Fragment>
          );
        })}
      </Form>
    </Dialog>
  );
}
function ConfirmDialog({ title, message, action, close }) {
  return (
    <Dialog title={title} close={close}>
      <p>{message}</p>
      <Form
        close={close}
        submit="Confirm"
        onSubmit={async () => {
          await action?.();
          close(true);
        }}
      />
    </Dialog>
  );
}
export { Dialog };

export function useResource(path, revision = 0, loader) {
  const [state, setState] = useState({ loading: true });
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setState((current) => ({ ...current, loading: true, error: null }));
    (loader ? loader() : api(path, { signal: controller.signal }))
      .then((result) => {
        if (active) setState({ ...result, loading: false });
      })
      .catch((error) => {
        if (active)
          setState((current) => ({ ...current, loading: false, error }));
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [path, revision]);
  return state;
}
export function useReload() {
  const [revision, setRevision] = useState(0);
  return [revision, () => setRevision((current) => current + 1)];
}
const listStates = new Map();
export function useListState(key, defaults = {}) {
  const scoped = `${currentUser?._id}:${location.pathname}:${key}`;
  const [state, setState] = useState(() => {
    const params = new URLSearchParams(location.search);
    const saved = listStates.get(scoped) || {};
    const values = { page: 1, search: "", ...defaults, ...saved };
    for (const name of Object.keys(values))
      if (params.has(name)) values[name] = params.get(name);
    values.page = Math.min(
      100000,
      Math.max(1, Math.floor(Number(values.page)) || 1),
    );
    return values;
  });
  function change(patch) {
    const next = { ...state, ...patch };
    listStates.set(scoped, next);
    const url = new URL(location.href);
    for (const [name, value] of Object.entries(next)) {
      if (value && !(name === "page" && value === 1))
        url.searchParams.set(name, value);
      else url.searchParams.delete(name);
    }
    history.replaceState(history.state, "", url);
    setState(next);
  }
  return [state, change];
}
export function useRestoreScroll(ready) {
  const target = useRef(history.state?.scroll || 0);
  const restored = useRef(false);
  useEffect(() => {
    if (ready && !restored.current) {
      const frame = requestAnimationFrame(() => {
        window.scrollTo(0, target.current);
        restored.current = true;
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [ready]);
}
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
