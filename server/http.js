// ── Responses ───
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8", "cache-control": "no-store",
      "x-content-type-options": "nosniff", ...headers,
    },
  });

export const error = (status, message) => json({ error: message }, status);

// ── Request guards ───
const MAX_BODY = 64 * 1024;

// CSRF: SameSite=Lax cookie plus a same-origin Origin header and a JSON
// content type (a cross-site form can't send either).
export function checkMutation(request, url) {
  const origin = request.headers.get("origin");
  if (origin !== url.origin) throw new HttpError(403, "Bad origin.");
  const type = request.headers.get("content-type") || "";
  if (!type.toLowerCase().startsWith("application/json")) {
    throw new HttpError(415, "Send JSON with Content-Type: application/json.");
  }
}

// Empty body gives {}. Anything else must be a JSON object under 64 KB.
export async function readJson(request) {
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > MAX_BODY) throw new HttpError(413, "That request is too large.");
  const text = await request.text();
  if (text.length > MAX_BODY) throw new HttpError(413, "That request is too large.");
  if (!text.trim()) return {};
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new HttpError(400, "The request body isn't valid JSON.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError(400, "The request body must be a JSON object.");
  }
  return body;
}
