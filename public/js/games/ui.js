// Small pieces shared by the games pages.
import { esc, toast } from "../lib.js";
import { symbolSlot } from "../factions.js";
import { isTiAssistantUrl, isMiltyUrl } from "./validate.js";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// Dates come as YYYY-MM-DD (or an ISO timestamp). Parsed by hand so the
// local timezone can't shift the day.
const parts = (s) => String(s).slice(0, 10).split("-").map(Number);
export const dayShort = (s) => { const [, m, d] = parts(s); return `${d} ${MONTHS[m - 1]}`; };
export const yearOf = (s) => parts(s)[0];
export const dayLong = (s) => { const [y, m, d] = parts(s); return `${d} ${LONG[m - 1]} ${y}`; };

// Games logged from memory may know only the month or the year (date_precision).
export const dayShortP = (s, precision = "day") => {
  if (precision === "month") return MONTHS[parts(s)[1] - 1];
  return precision === "year" ? "—" : dayShort(s);
};
export const dayLongP = (s, precision = "day") => {
  if (precision === "month") { const [y, m] = parts(s); return `${LONG[m - 1]} ${y}`; }
  return precision === "year" ? String(yearOf(s)) : dayLong(s);
};

export const todayLocal = (d = new Date()) => {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

// Faction ids (F_arborec) are the symbol ids, so they go straight in.
export const sym = (faction, cls = "") => symbolSlot(faction, cls);

export function expansionsText(g) {
  const list = [g.pok && "Prophecy of Kings", g.te && "Thunder's Edge"].filter(Boolean);
  return list.length ? list.join(", ") : "base game";
}

// Only https://ti-assistant.com links are ever rendered as links; the check is
// shared with the server (validate.js). Older rows that fail it show no link.
export { isTiAssistantUrl as safeTiLink, isMiltyUrl as safeMiltyLink };
export const mapHref = (m) => `/map?m=${encodeURIComponent(m)}`;

export const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

// Shown instead of a page when its data didn't load.
export function errorBlock(err, retry) {
  const box = document.createElement("div");
  box.className = "g-error";
  const p = document.createElement("p");
  p.className = "error";
  p.setAttribute("role", "alert");
  p.textContent = err?.message ?? "Something went wrong.";
  box.append(p);
  if (retry) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn btn-primary";
    b.textContent = "Try again";
    b.addEventListener("click", retry);
    box.append(b);
  }
  return box;
}

// Games / Stats / account links under the masthead.
export function tabs(active, me) {
  const t = (key, href, label) => `<a href="${href}"${key === active ? ' aria-current="page"' : ""}>${esc(label)}</a>`;
  return `<nav class="gtabs" aria-label="Games">
    ${t("list", "/games", "Games")}${t("stats", "/games/stats", "Stats")}
    ${me ? t("me", "/games/me", me.name) : t("join", "/games/join", "Sign in")}
    ${me?.role === "admin" ? t("admin", "/games/admin", "Admin") : ""}
  </nav>`;
}

const button = (label, className = "btn") =>
  Object.assign(document.createElement("button"), { type: "button", className, textContent: label });

// Copies `text` and says so. If the clipboard is blocked (some browsers, some
// in-app views), selects `el` so a long-press or Ctrl+C copies it instead.
export async function copyText(text, done, el) {
  try {
    await navigator.clipboard.writeText(text);
    toast(done);
  } catch {
    if (el) getSelection()?.selectAllChildren(el);
    toast(el ? "Couldn't copy. It's selected, so copy it by hand." : "Couldn't copy. Copy it by hand.");
  }
}

// A button that copies `text`.
export function copyButton(text, label, done, el) {
  const b = button(label, "btn btn-primary");
  b.addEventListener("click", () => copyText(text, done, el));
  return b;
}

// The phone's share sheet, or null where there isn't one.
export function shareButton(text, label = "Share") {
  if (!navigator.share) return null;
  const b = button(label);
  b.addEventListener("click", async () => {
    try {
      await navigator.share({ text });
    } catch (err) {
      if (err.name !== "AbortError") toast("Couldn't open sharing. Use Copy code instead.");
    }
  });
  return b;
}
