// fetch wrapper for /api/*. JSON in and out, same-origin cookies (the session
// is an HttpOnly cookie, so JS never sees it). Errors become ApiError with a
// plain message that is safe to show with textContent or esc().

export class ApiError extends Error {
  constructor(status, message, { offline = false } = {}) {
    super(message);
    this.status = status;
    this.offline = offline;
  }
}

export const OFFLINE_MESSAGE = "You're offline. Games need a connection.";

// Used only when the server sent no message of its own.
const FALLBACK = {
  401: "Sign in first.",
  403: "You don't have permission to do that.",
  404: "That doesn't exist.",
  409: "That conflicts with something already saved.",
  415: "The request wasn't sent as JSON. Reload the page and try again.",
  429: "Too many tries. Wait a few minutes and try again.",
};

export async function api(method, path, body) {
  const init = { method, credentials: "same-origin", headers: {} };
  if (method !== "GET") {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body ?? {});
  }
  let res;
  try {
    res = await fetch(path, init);
  } catch {
    throw new ApiError(0, OFFLINE_MESSAGE, { offline: true });
  }
  let data = null;
  try {
    data = await res.json();
  } catch {}
  if (!res.ok) {
    const msg = typeof data?.error === "string" && data.error ? data.error : FALLBACK[res.status] ?? `Something went wrong (${res.status}).`;
    throw new ApiError(res.status, msg);
  }
  return data ?? {};
}

export const get = (path) => api("GET", path);
export const post = (path, body) => api("POST", path, body);
export const put = (path, body) => api("PUT", path, body);
export const patch = (path, body) => api("PATCH", path, body);
export const del = (path) => api("DELETE", path);

// The signed-in player, or null. A failed lookup (offline) counts as signed out
// only for display; writes are still checked by the server.
export async function currentPlayer() {
  const { player } = await get("/api/me");
  return player ?? null;
}
