import { api } from "./api.js";
import { el, button, table } from "./dom.js";
export function pagedList(
  container,
  { path, columns, filters = [], search = true },
) {
  let page = 1;
  const filterInputs = new Map();
  const values = {},
    body = el("div"),
    pagination = el("div", { class: "pagination" }),
    toolbar = el("div", { class: "toolbar" });
  if (search) {
    const input = el("input", {
      type: "search",
      placeholder: "Search records…",
      "aria-label": "Search records",
    });
    const form = el(
      "form",
      {
        class: "search-form",
        onSubmit: (event) => {
          event.preventDefault();
          values.search = input.value;
          page = 1;
          load();
        },
      },
      input,
      el("button", { class: "button secondary", type: "submit" }, "Search"),
    );
    toolbar.append(form);
  }
  for (const filter of filters) {
    const select = el(
      "select",
      { "aria-label": filter.label },
      el("option", { value: "" }, filter.label),
      filter.options.map((x) => el("option", { value: x.value }, x.label)),
    );
    filterInputs.set(filter.name, { select, label: filter.label });
    select.addEventListener("change", () => {
      values[filter.name] = select.value;
      page = 1;
      load();
    });
    toolbar.append(select);
  }
  container.append(toolbar, body, pagination);
  let pending;
  async function load() {
    pending?.abort();
    const controller = new AbortController();
    pending = controller;
    body.replaceChildren(
      el("p", { class: "loading", role: "status" }, "Loading records…"),
    );
    try {
      const query = new URLSearchParams({
        page,
        limit: 25,
        ...Object.fromEntries(Object.entries(values).filter(([, v]) => v)),
      });
      const result = await api(
        `${path}${path.includes("?") ? "&" : "?"}${query}`,
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      body.replaceChildren(table(columns, result.data));
      pagination.replaceChildren(
        el(
          "span",
          { class: "muted" },
          `${result.meta?.total ?? result.data.length} records · Page ${page} of ${result.meta?.pages || 1}`,
        ),
      );
      if (page > 1)
        pagination.append(
          button("Previous", () => {
            page--;
            return load();
          }),
        );
      if (page < (result.meta?.pages || 1))
        pagination.append(
          button("Next", () => {
            page++;
            return load();
          }),
        );
    } catch (error) {
      if (controller.signal.aborted) return;
      body.replaceChildren(
        el("p", { class: "form-error", role: "alert" }, error.message),
      );
    } finally {
      if (pending === controller) pending = undefined;
    }
  }
  load.setFilterOptions = (name, options) => {
    const entry = filterInputs.get(name);
    if (!entry) return;
    const selected = entry.select.value;
    entry.select.replaceChildren(
      el("option", { value: "" }, entry.label),
      ...options.map((x) => el("option", { value: x.value }, x.label)),
    );
    entry.select.value = selected;
  };
  load();
  return load;
}
