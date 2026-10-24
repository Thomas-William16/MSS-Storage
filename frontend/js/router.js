export const pages = new Set([
  "index.html",
  "dashboard.html",
  "equipment.html",
  "equipment-details.html",
  "equipment-item.html",
  "borrowings.html",
  "requests.html",
  "maintenance.html",
  "users.html",
  "reports.html",
  "audit-logs.html",
  "settings.html",
  "login.html",
  "categories.html",
]);

export function navigate(href, { replace = false } = {}) {
  const url = new URL(href, location.href);
  if (url.origin !== location.origin) return location.assign(url.href);
  if (url.pathname === "/categories.html") url.pathname = "/equipment.html";
  if (url.href === location.href) return;
  history.replaceState({ ...history.state, scroll: window.scrollY }, "");
  history[replace ? "replaceState" : "pushState"](
    { scroll: 0, from: location.pathname + location.search },
    "",
    url,
  );
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function interceptNavigation(event) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  )
    return;
  const anchor = event.target.closest?.("a[href]");
  if (
    !anchor ||
    anchor.hasAttribute("download") ||
    (anchor.target && anchor.target !== "_self")
  )
    return;
  const url = new URL(anchor.href, location.href);
  if (
    url.origin !== location.origin ||
    url.hash ||
    !pages.has(url.pathname.slice(1) || "index.html")
  )
    return;
  event.preventDefault();
  navigate(url.href);
}
