import { API_BASE_URL } from "./config.js";
let csrfToken;
export let currentUser;
const references = new Map();
const referenceTTL = 60_000;
function clearReferences() {
  references.clear();
}
export async function api(path, options = {}) {
  const writing = (options.method || "GET").toUpperCase() !== "GET";
  if (writing) clearReferences();
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1${path}`, {
      credentials: "include",
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
        ...options.headers,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const payload = await response.json().catch(() => ({
      error: { message: "Server returned an invalid response" },
    }));
    if (!response.ok) {
      if (response.status === 401) clearReferences();
      if (response.status === 401 && !path.startsWith("/auth/"))
        window.dispatchEvent(new Event("scout:signed-out"));
      throw Object.assign(
        new Error(payload.error?.message || "Request failed"),
        { fields: payload.error?.fields, status: response.status },
      );
    }
    return payload;
  } finally {
    // A lookup started while a write was pending must not survive that write.
    if (writing) clearReferences();
  }
}
export async function session() {
  clearReferences();
  const { data } = await api("/auth/me");
  csrfToken = data.csrfToken;
  currentUser = data.user;
  return data.user;
}
export async function login(email, password) {
  const { data } = await api("/auth/login", {
    method: "POST",
    body: { email, password },
  });
  csrfToken = data.csrfToken;
  currentUser = data.user;
}
export async function logout() {
  await api("/auth/logout", { method: "POST" });
  csrfToken = undefined;
  currentUser = undefined;
  window.dispatchEvent(new Event("scout:signed-out"));
}
export async function download(path, name) {
  const response = await fetch(`${API_BASE_URL}/api/v1${path}`, {
    credentials: "include",
  });
  if (!response.ok) throw new Error("Download failed");
  const blob = await response.blob(),
    url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function all(path) {
  // Only reference data is cached. Stock and operational lists stay live.
  if (path !== "/categories") return loadAll(path);
  const cached = references.get(path);
  if (cached && (cached.pending || cached.expires > Date.now()))
    return structuredClone(await cached.promise);
  const entry = { pending: true, expires: 0 };
  entry.promise = loadAll(path)
    .then((rows) => {
      entry.pending = false;
      entry.expires = Date.now() + referenceTTL;
      return rows;
    })
    .catch((error) => {
      if (references.get(path) === entry) references.delete(path);
      throw error;
    });
  references.set(path, entry);
  const rows = await entry.promise;
  return structuredClone(rows);
}
async function loadAll(path) {
  let page = 1,
    rows = [];
  for (;;) {
    const result = await api(
      `${path}${path.includes("?") ? "&" : "?"}page=${page}&limit=100`,
    );
    rows.push(...result.data);
    if (!result.meta || page >= result.meta.pages) break;
    page++;
  }
  return rows;
}
export const manager = () =>
  ["ADMIN", "STORAGE_KEEPER"].includes(currentUser?.role);
export const admin = () => currentUser?.role === "ADMIN";
