// Entry point: registers each section with the router and starts it.

import { addSection, start } from "./router.js";
import { renderRules } from "./rules/view.js";

addSection({ prefix: "/rules", label: "Rules", render: renderRules });

start();

// Offline support. Skipped on localhost so edits show up without a stale cache.
if ("serviceWorker" in navigator && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
  navigator.serviceWorker.register("/sw.js").catch((err) => console.warn("Service worker:", err));
}
