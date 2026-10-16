// Small helpers shared by every part of the site.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// String arguments only: replaceAll with a non-global regex throws.
export const esc = (s) =>
  String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

// One-for-one character swaps, so offsets in normalised text line up with
// offsets in the original text. Never change the string's length here.
export const normChars = (s) =>
  s
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐‑–—]/g, "-");

export const plural = (n, word, many = word + "s") =>
  `${n} ${n === 1 ? word : many}`;

// localStorage can throw (private mode, blocked storage), and an empty
// result must never break a page, so every access is guarded.
export const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(`ti4table.${key}`);
      return raw == null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(`ti4table.${key}`, JSON.stringify(value));
    } catch {}
  },
};

// Pushes `value` to the front of a remembered list, without duplicates.
export function remember(key, value, max, same = (a, b) => a === b) {
  const list = [value, ...store.get(key, []).filter((v) => !same(v, value))];
  store.set(key, list.slice(0, max));
}

let toastTimer;
// A short message at the bottom of the screen. `actions` are [label, fn] pairs.
export function toast(message, actions = []) {
  let el = $("#toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    el.setAttribute("role", "status");
    document.body.append(el);
  }
  el.replaceChildren(Object.assign(document.createElement("span"), { textContent: message }));
  for (const [label, fn] of actions) {
    const b = Object.assign(document.createElement("button"), { textContent: label });
    b.addEventListener("click", () => {
      fn();
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => el.classList.remove("show"), 1400);
    });
    el.append(b);
  }
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), actions.length ? 6000 : 2200);
}
