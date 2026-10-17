import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { session, login, logout, manager, admin, currentUser } from "./api.js";
import { mountPreferences, updateTitle } from "./preferences.js";
import { interceptNavigation, navigate } from "./router.js";
import { el, toast } from "./dom.js";
import { routes, preloadRoute } from "./routes.js";

function Preferences() {
  const host = useRef(null);
  useLayoutEffect(() => mountPreferences(host.current), []);
  return <div className="preference-host" ref={host} />;
}

function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark" aria-hidden="true">
        ⚜
      </span>
      <span>
        <strong>Scout Storage</strong>
        <small>Ready for adventure</small>
      </span>
    </div>
  );
}

function SignIn({ onSignIn }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await login(data.get("email"), data.get("password"));
      onSignIn(currentUser);
      navigate("/dashboard.html", { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="login-art">
        <Brand />
        <div>
          <div className="login-motif" aria-hidden="true">
            ⚜
          </div>
          <h1>
            Good gear.
            <br />
            Great adventures.
          </h1>
          <p>
            A shared home for your group’s equipment. Keep it organized, cared
            for, and ready when it matters.
          </p>
        </div>
        <footer>Prepared today. Ready for tomorrow.</footer>
      </section>
      <main className="login-main">
        <Preferences />
        <form id="login-form" className="login-form" onSubmit={submit}>
          <p className="eyebrow">WELCOME BACK</p>
          <h1>Sign in to your storage</h1>
          <p className="muted">
            Use the account provided by your administrator.
          </p>
          <label className="field" htmlFor="email">
            <span>Email address</span>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              required
              maxLength={254}
              placeholder="you@scoutgroup.org"
            />
          </label>
          <label className="field" htmlFor="password">
            <span>Password</span>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              maxLength={200}
            />
          </label>
          <p id="login-error" className="form-error" role="alert">
            {error}
          </p>
          <button type="submit" className="button primary" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
          <p className="login-security">
            Protected access · Your session expires after 8 hours
          </p>
        </form>
      </main>
    </>
  );
}

// Isolate existing workflow DOM inside a React-owned route lifecycle. A new
// container per URL prevents late responses from overwriting a newer route.
function WorkflowView({ page, search }) {
  const host = useRef(null);
  useEffect(() => {
    const container = document.createElement("div");
    host.current.replaceChildren(container);
    let active = true;
    const route = routes[page];
    container.append(
      el("p", { class: "loading", role: "status" }, "Loading your workspace…"),
    );
    async function render() {
      try {
        if (!route) throw new Error("Page not found");
        if (route[2] && !route[2]()) throw new Error("Permission denied");
        // Render in a detached container so loading remains visible until ready.
        const content = document.createElement("div");
        const renderView = await route[1]();
        if (!active) return;
        await renderView(content, new URLSearchParams(search).get("id"));
        if (!active) return;
        container.replaceChildren(content);
        const notice = sessionStorage.getItem("scout-notice");
        if (notice) {
          sessionStorage.removeItem("scout-notice");
          toast(notice);
        }
        host.current.closest("main").focus({ preventScroll: true });
      } catch (error) {
        if (active)
          container.replaceChildren(
            el(
              "div",
              { class: "panel form-error", role: "alert" },
              error.message,
            ),
          );
      }
    }
    render();
    return () => {
      active = false;
      container.remove();
      for (const dialog of document.querySelectorAll("dialog")) {
        dialog.close();
        dialog.remove();
      }
    };
  }, [page, search]);
  return <div ref={host} />;
}

function Workspace({ user, page, search }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  useEffect(() => {
    setMenuOpen(false);
    window.scrollTo(0, 0);
  }, [page, search]);
  useEffect(() => {
    document.body.classList.toggle("menu-open", menuOpen);
    return () => document.body.classList.remove("menu-open");
  }, [menuOpen]);
  const nav = [
    ["dashboard.html", "Overview", "◈"],
    ["equipment.html", "Equipment", "▦"],
    ["borrowings.html", "Borrowings", "⇄"],
    ["requests.html", "Requests", "☷"],
    ["maintenance.html", "Maintenance", "⚒"],
    ...(manager() ? [["reports.html", "Reports", "▥"]] : []),
    ...(admin()
      ? [
          ["users.html", "Users", "♧"],
          ["audit-logs.html", "Audit trail", "≡"],
        ]
      : []),
    ["settings.html", "Settings", "⚙"],
  ];
  const activePage = page.startsWith("equipment-")
    ? "equipment.html"
    : page === "index.html"
      ? "dashboard.html"
      : page;
  async function signOut() {
    setSigningOut(true);
    try {
      await logout();
    } catch (error) {
      toast(error.message, "error");
    } finally {
      setSigningOut(false);
    }
  }
  return (
    <>
      <a href="#content" className="skip-link">
        Skip to content
      </a>
      <aside className="sidebar">
        <a href="/dashboard.html">
          <Brand />
        </a>
        <p className="nav-label">WORKSPACE</p>
        <nav id="navigation" aria-label="Main navigation">
          {nav.map(([href, label, icon]) => (
            <a
              key={href}
              href={href}
              onPointerEnter={() => preloadRoute(href)}
              onFocus={() => preloadRoute(href)}
              className={`nav-link${activePage === href ? " active" : ""}`}
              aria-current={activePage === href ? "page" : undefined}
            >
              <span aria-hidden="true">{icon}</span>
              <span>{label}</span>
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          Care for our gear.
          <br />
          Make every adventure possible.
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <Preferences />
          <button
            id="menu-toggle"
            className="button menu-toggle"
            aria-label="Toggle navigation"
            aria-expanded={menuOpen}
            aria-controls="navigation"
            onClick={() => setMenuOpen((value) => !value)}
          >
            ☰
          </button>
          <div className="breadcrumb">
            Workspace <strong>Scout Storage</strong>
          </div>
          <div className="account" id="account">
            <span className="avatar">
              {user.name
                .split(" ")
                .map((x) => x[0])
                .slice(0, 2)
                .join("")
                .toUpperCase()}
            </span>
            <span className="account-name">
              {user.name}
              <small>{user.role.replaceAll("_", " ")}</small>
            </span>
            <button
              className="button secondary"
              disabled={signingOut}
              onClick={signOut}
            >
              Sign out
            </button>
          </div>
        </header>
        <main id="content" className="content" tabIndex={-1}>
          <WorkflowView page={page} search={search} />
        </main>
      </div>
    </>
  );
}

function App() {
  const [url, setUrl] = useState(() => location.pathname + location.search);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const page =
    new URL(url, location.origin).pathname.split("/").pop() || "index.html";
  const search = new URL(url, location.origin).search;
  useEffect(() => {
    const update = () => setUrl(location.pathname + location.search);
    const expired = () => {
      setUser(null);
      navigate("/login.html", { replace: true });
    };
    window.addEventListener("popstate", update);
    window.addEventListener("scout:signed-out", expired);
    document.addEventListener("click", interceptNavigation);
    session()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
    return () => {
      window.removeEventListener("popstate", update);
      window.removeEventListener("scout:signed-out", expired);
      document.removeEventListener("click", interceptNavigation);
    };
  }, []);
  useEffect(() => {
    document.body.classList.toggle("login-page", !loading && !user);
    updateTitle(
      `${page === "login.html" ? "Sign in" : routes[page]?.[0] || "Scout Storage"} · Scout Storage`,
    );
    if (!loading) {
      if (!user && page !== "login.html")
        navigate("/login.html", { replace: true });
      else if (user && page === "login.html")
        navigate("/dashboard.html", { replace: true });
      else if (page === "categories.html")
        navigate("/equipment.html", { replace: true });
    }
  }, [page, loading, user]);
  if (loading)
    return (
      <p className="loading" role="status">
        Loading your workspace…
      </p>
    );
  return user ? (
    <Workspace user={user} page={page} search={search} />
  ) : (
    <SignIn onSignIn={setUser} />
  );
}

createRoot(document.getElementById("root")).render(<App />);
