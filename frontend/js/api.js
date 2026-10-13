import { API_BASE_URL } from "./config.js";
let csrfToken;
export let currentUser;
export async function api(path, options = {}) {
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
    if (response.status === 401 && !path.startsWith("/auth/"))
      location.assign("/login.html");
    throw new Error(payload.error?.message || "Request failed");
  }
  return payload;
}
export async function session() {
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
  location.assign("/login.html");
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
