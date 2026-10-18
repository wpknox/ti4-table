// Small pieces shared by the games pages.
import { esc } from "../lib.js";
import { symbolSlot } from "../factions.js";
import { isTiAssistantUrl } from "./validate.js";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// Dates come as YYYY-MM-DD (or an ISO timestamp). Parsed by hand so the
// local timezone can't shift the day.
const parts = (s) => String(s).slice(0, 10).split("-").map(Number);
export const dayShort = (s) => { const [, m, d] = parts(s); return `${d} ${MONTHS[m - 1]}`; };
export const yearOf = (s) => parts(s)[0];
export const dayLong = (s) => { const [y, m, d] = parts(s); return `${d} ${LONG[m - 1]} ${y}`; };

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
export { isTiAssistantUrl as safeTiLink };
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

// A share button that uses the phone's share sheet, else copies.
export function shareButton(text, label = "Share") {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "btn";
  b.textContent = navigator.share ? label : "Copy";
  b.addEventListener("click", async () => {
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        b.textContent = "Copied";
      }
    } catch {}
  });
  return b;
}
