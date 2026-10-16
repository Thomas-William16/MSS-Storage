import { dateText } from "./i18n.js";

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null) continue;
    if (key === "class") node.className = value;
    else if (key.startsWith("on"))
      node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === "text") node.textContent = value;
    else if (key in node) node[key] = value;
    else node.setAttribute(key, value);
  }
  for (const child of children.flat()) {
    if (child != null)
      node.append(
        child instanceof Node ? child : document.createTextNode(String(child)),
      );
  }
  return node;
}
export const button = (label, action, style = "secondary") =>
  el(
    "button",
    {
      type: "button",
      class: `button ${style}`,
      onClick: async (event) => {
        const target = event.currentTarget;
        target.disabled = true;
        try {
          await action();
        } catch (error) {
          toast(error.message, "error");
        } finally {
          target.disabled = target.dataset.keepDisabled === "true";
        }
      },
    },
    label,
  );
export const badge = (value) =>
  el(
    "span",
    { class: `badge ${String(value).toLowerCase()}` },
    String(value).replaceAll("_", " "),
  );
export const fmt = dateText;
export const short = (value) =>
  String(value || "")
    .slice(-8)
    .toUpperCase();
export function toast(message, type = "success") {
  const node = el(
    "div",
    { class: `toast ${type}`, role: type === "error" ? "alert" : "status" },
    message,
  );
  document.getElementById("toasts").append(node);
  setTimeout(() => node.remove(), 7000);
}
export function table(columns, rows, className = "") {
  const wrapper = el("div", { class: `table-wrap ${className}` });
  const tbody = el("tbody");
  for (const row of rows)
    tbody.append(
      el(
        "tr",
        {},
        columns.map((column) =>
          el(
            "td",
            { "data-label": column.label },
            column.render ? column.render(row) : (row[column.key] ?? "—"),
          ),
        ),
      ),
    );
  wrapper.append(
    el(
      "table",
      {},
      el(
        "thead",
        {},
        el(
          "tr",
          {},
          columns.map((column) => el("th", { scope: "col" }, column.label)),
        ),
      ),
      tbody,
    ),
  );
  if (!rows.length)
    wrapper.append(
      el(
        "div",
        { class: "empty" },
        el("strong", {}, "Nothing here yet"),
        el("p", {}, "New records will appear here."),
      ),
    );
  return wrapper;
}
export function availability(counts) {
  const available = counts.available || 0,
    total = counts.total || 0;
  return el(
    "span",
    { class: available ? "availability" : "availability unavailable" },
    el("strong", {}, `${available} available out of ${total}`),
    available
      ? null
      : el("small", { class: "subline" }, "Currently unavailable"),
  );
}
export const actions = (...buttons) => el("div", { class: "actions" }, buttons);
export const link = (text, href) => el("a", { href, class: "text-link" }, text);
export function stat(label, value, detail) {
  return el(
    "article",
    { class: "stat" },
    el("span", { class: "stat-label" }, label),
    el("strong", {}, value),
    el("small", {}, detail),
  );
}
export function header(title, subtitle, ...buttons) {
  return el(
    "div",
    { class: "page-heading" },
    el(
      "div",
      {},
      el("p", { class: "eyebrow" }, "SCOUT STORAGE"),
      el("h1", {}, title),
      el("p", { class: "muted" }, subtitle),
    ),
    actions(...buttons),
  );
}
export function panel(title, ...content) {
  return el("section", { class: "panel" }, el("h2", {}, title), ...content);
}
export async function confirmAction(title, message, action) {
  return new Promise((resolve) => {
    const dialog = el("dialog", { class: "modal small" });
    dialog.append(
      el("h2", {}, title),
      el("p", {}, message),
      actions(
        button("Cancel", () => {
          dialog.close();
          resolve(false);
        }),
        button(
          "Confirm",
          async () => {
            await action();
            dialog.close();
            resolve(true);
          },
          "primary",
        ),
      ),
    );
    dialog.addEventListener("close", () => {
      dialog.remove();
      resolve(false);
    });
    document.body.append(dialog);
    dialog.showModal();
  });
}
export function formModal(
  title,
  fields,
  onSubmit,
  { submit = "Save", intro, success = "Saved successfully" } = {},
) {
  const dialog = el("dialog", { class: "modal" }),
    form = el("form"),
    error = el("p", { class: "form-error", role: "alert" }),
    inputs = {};
  const submitButton = el(
    "button",
    { type: "submit", class: "button primary" },
    submit,
  );
  form.append(el("h2", {}, title));
  if (intro) form.append(el("p", { class: "muted" }, intro));
  for (const field of fields) {
    const inputId = `field-${field.name}-${crypto.randomUUID()}`;
    let input;
    if (field.type === "select")
      input = el(
        "select",
        { id: inputId, name: field.name, required: field.required ?? true },
        (field.options || []).map((option) =>
          el(
            "option",
            {
              value: option.value,
              selected: String(field.value) === String(option.value),
            },
            option.label,
          ),
        ),
      );
    else if (field.type === "textarea")
      input = el("textarea", {
        id: inputId,
        name: field.name,
        required: field.required ?? false,
        rows: 3,
        maxLength: field.maxLength || 2000,
        value: field.value || "",
      });
    else
      input = el("input", {
        id: inputId,
        name: field.name,
        type: field.type || "text",
        required: field.required ?? true,
        value: field.value ?? "",
        min: field.min,
        max: field.max,
        maxLength: field.maxLength || 2000,
        minLength: field.minLength,
        step: field.step,
        placeholder: field.placeholder,
        autocomplete: field.autocomplete || "off",
      });
    inputs[field.name] = input;
    form.append(
      el(
        "div",
        { class: "field" },
        el("label", { htmlFor: inputId }, field.label),
        input,
        field.action
          ? button(field.action.label, () => field.action.run(input))
          : null,
        field.hint ? el("small", { class: "muted" }, field.hint) : null,
      ),
    );
  }
  form.append(
    error,
    actions(
      button("Cancel", () => dialog.close()),
      submitButton,
    ),
  );
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    error.textContent = "";
    submitButton.disabled = true;
    try {
      const data = {};
      for (const field of fields) {
        const value = inputs[field.name].value;
        if (value === "" && field.required === false) continue;
        data[field.name] = field.type === "number" ? Number(value) : value;
      }
      const message = await onSubmit(data, dialog);
      dialog.close();
      toast(typeof message === "string" ? message : success);
    } catch (err) {
      error.textContent = err.message;
    } finally {
      submitButton.disabled = false;
    }
  });
  dialog.addEventListener("close", () => {
    dialog.remove();
  });
  dialog.append(form);
  document.body.append(dialog);
  dialog.showModal();
  return dialog;
}
export const inputDate = (value) => {
  const d = value ? new Date(value) : new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};
export const iso = (value) => new Date(value).toISOString();
