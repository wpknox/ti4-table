// Browser smoke checks: drives every section in Chrome and fails on crashes,
// console errors, CSP violations, horizontal scroll and broken core flows.
//   PLAYWRIGHT_CORE=/path/to/playwright-core/index.mjs npm run check:ui
// Uses a private local D1 in .wrangler/ui-state and port 8791. HEADED=1 to watch.
// It doesn't judge looks. Node built-ins plus playwright-core (loaded from outside the repo).
import { pathToFileURL } from "node:url";
import { startServer, resetState, makeInvite } from "./lib/dev-server.mjs";
import { MAPS } from "./fixtures/maps.mjs";
import { ARCHIVED_EXPORT } from "./fixtures/ti-assistant.mjs";

const PORT = 8791;
const STATE = ".wrangler/ui-state";
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };
const XSS_NAME = '<img src=x onerror="window.__xss=1">';

// ── Helpers ───
let failures = 0;
function check(name, ok, detail = "") {
  if (!ok) failures++;
  const why = ok || !detail ? "" : `  -> ${detail}`;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${why}`);
}

async function loadPlaywright() {
  const missing = () => {
    console.error(`playwright-core isn't installed. Install it outside the repo, e.g.
  npm i --prefix ~/.cache/ti4-table-pw playwright-core
  PLAYWRIGHT_CORE=~/.cache/ti4-table-pw/node_modules/playwright-core/index.mjs npm run check:ui`);
    process.exit(2);
  };
  const path = process.env.PLAYWRIGHT_CORE;
  try {
    if (path) return await import(pathToFileURL(path).href);
    return await import("playwright-core");
  } catch {
    return missing();
  }
}

const map6 = MAPS.find((m) => m.players === 6).str;
const mapUrl = (extra = "") => `/map?m=${encodeURIComponent(map6)}${extra}`;

// ── Run ───
let server;
let browser;

async function run() {
  const pw = await loadPlaywright();
  const chromium = pw.chromium ?? pw.default?.chromium;
  resetState(STATE);
  server = await startServer({ port: PORT, state: STATE });
  const BASE = server.base;
  browser = await chromium.launch({ channel: "chrome", headless: process.env.HEADED !== "1" });
  const context = await browser.newContext({ viewport: PHONE, colorScheme: "dark" });
  const page = await context.newPage();

  // Console watcher: errors and page errors only. Warnings (such as Chrome's
  // "preloaded using link preload but not used") are not errors and never counted.
  let seen = [];
  page.on("console", (msg) => { if (msg.type() === "error") seen.push(msg.text()); });
  page.on("pageerror", (err) => seen.push(`pageerror: ${err.message}`));

  // Runs one step; any console error recorded during it fails the step.
  async function step(name, fn) {
    seen = [];
    try {
      await fn();
    } catch (err) {
      check(name, false, String(err.message).split("\n")[0]);
    }
    await page.waitForTimeout(50);
    const csp = seen.filter((m) => m.includes("Content Security Policy"));
    for (const m of csp) check(`${name}: no CSP violation`, false, m.slice(0, 200));
    const rest = seen.filter((m) => !m.includes("Content Security Policy"));
    check(`${name}: no console errors`, rest.length === 0, rest.join(" | ").slice(0, 300));
  }

  const go = async (path) => {
    await page.goto(BASE + path);
    await page.waitForFunction(() => (document.querySelector("main")?.innerText ?? "").trim().length > 0, null, { timeout: 15000 });
    await page.waitForLoadState("networkidle").catch(() => {});
  };
  const apiJson = (path, init) => page.evaluate(async ([p, i]) => {
    const r = await fetch(p, i);
    return { status: r.status, data: await r.json().catch(() => null) };
  }, [path, init]);
  const post = (path, body) => apiJson(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  // Types into a seat's player or faction typeahead and picks the first match.
  const pick = async (card, kind, text) => {
    const input = card.locator(`.combo[data-kind=${kind}] input`);
    await input.click();
    await input.fill(text);
    await input.press("Enter");
  };

  // ── Flows ───
  await step("Rules search", async () => {
    await go("/rules");
    await page.fill("#rq", "retreat");
    await page.press("#rq", "Enter");
    await page.waitForSelector("a.snippet", { timeout: 10000 });
    check("Search for retreat shows results", (await page.locator("a.snippet").count()) > 0);
    await page.locator("a.snippet").first().click();
    await page.waitForURL(/\/rules\/R_/, { timeout: 10000 });
    await page.waitForSelector(".rbody mark", { timeout: 10000 });
    check("Snippet opens a /rules/R_ page with a highlight", new URL(page.url()).pathname.startsWith("/rules/R_") && (await page.locator(".rbody mark").count()) > 0);
  });

  await step("Rules paragraph link", async () => {
    await go("/rules/R_movement#58.3");
    await page.waitForSelector(".rbody h1");
    check("Element with id 58.3 exists", (await page.locator('[id="58.3"]').count()) > 0);
    check("Heading is Movement", (await page.locator(".rbody h1").first().innerText()).trim() === "Movement");
  });

  await step("Map", async () => {
    await go(mapUrl());
    await page.waitForSelector("svg.mapsvg", { timeout: 15000 });
    const players = MAPS.find((m) => m.str === map6).players;
    const seats = await page.locator("article.seat").count();
    const sub = await page.locator(".map-sub").innerText();
    check("Seat count matches the map's player count", seats === players && sub.startsWith(`${players} seats`), `${seats} seats, "${sub}"`);
    await go(mapUrl("&view=art"));
    await page.waitForSelector("svg.mapsvg.art", { timeout: 15000 });
    check("view=art renders svg.mapsvg.art", (await page.locator("svg.mapsvg.art").count()) === 1);
  });

  await step("Signed out", async () => {
    await go("/games");
    check("Sign-in form shown", (await page.locator("#code").count()) === 1);
    check("No game list", (await page.locator("#glist").count()) === 0);
    // context.request shares the page's cookies and, unlike fetch(), doesn't log the 401 as a console error.
    const res = await context.request.get(`${BASE}/api/games`);
    check("GET /api/games signed out is 401", res.status() === 401, res.status());
  });

  await step("Sign in returns", async () => {
    const code = makeInvite(STATE, "UI Admin", "admin");
    await go("/games/stats");
    await page.fill("#code", code);
    await page.press("#code", "Enter");
    await page.waitForURL(/\/games\/stats$/, { timeout: 10000 });
    await page.waitForFunction(() => !document.querySelector("#code"), null, { timeout: 10000 });
    const me = await apiJson("/api/me");
    check("URL is /games/stats and /api/me is UI Admin", new URL(page.url()).pathname === "/games/stats" && me.data?.player?.name === "UI Admin");
  });

  let gameId = null;
  await step("Log a game", async () => {
    const g1 = await post("/api/players", { name: "Guest One" });
    const g2 = await post("/api/players", { name: XSS_NAME });
    check("Two guests created through the API", g1.status < 300 && g2.status < 300, `${g1.status} ${g2.status}`);
    await go("/games/new");
    // The form starts with six seats; three is the minimum.
    for (let i = 0; i < 3; i++) await page.locator("[data-rm]:visible").first().click();
    check("Form has 3 seats", (await page.locator(".seat-card").count()) === 3);
    const names = ["UI Admin", "Guest One", XSS_NAME];
    const factions = ["Arborec", "Hacan", "Federation of Sol"];
    for (let i = 0; i < 3; i++) {
      const card = page.locator(".seat-card").nth(i);
      await pick(card, "player", names[i]);
      await pick(card, "faction", factions[i]);
    }
    const plus = (i) => page.locator(".seat-card").nth(i).locator('.step[data-d="1"]');
    for (let k = 0; k < 3; k++) await plus(0).click();
    await plus(1).click();
    check("UI Admin is marked winner", (await page.locator(".seat-card").first().locator(".winner-tag").count()) === 1);
    check("Date is filled in", (await page.inputValue("#f-date")) !== "");
    await page.click("#save");
    await page.waitForURL(/\/games\/\d+$/, { timeout: 10000 });
    gameId = new URL(page.url()).pathname.split("/").pop();
    await page.waitForSelector(".gseat");
    const text = await page.locator(".gplayer").allInnerTexts();
    check("Game page shows all three names", text.length === 3 && text.some((t) => t.includes("UI Admin")) && text.some((t) => t.includes("Guest One")) && text.some((t) => t.includes(XSS_NAME)), JSON.stringify(text));
    check("XSS name is literal text, no injected img", (await page.locator("main img[src=x]").count()) === 0);
    check("window.__xss is undefined", (await page.evaluate(() => window.__xss)) === undefined);
  });

  await step("Stats", async () => {
    await go("/games/stats");
    await page.waitForSelector(".bar-fill", { timeout: 10000 });
    const widths = await page.locator(".bar-fill").evaluateAll((els) => els.map((e) => e.style.width));
    check("Every .bar-fill has a width", widths.length > 0 && widths.every((w) => w !== ""), JSON.stringify(widths));
  });

  let memGameId = null;
  await step("Log a game from memory", async () => {
    await go("/games/new");
    for (let i = 0; i < 3; i++) await page.locator("[data-rm]:visible").first().click();
    await page.locator("label.tog", { hasText: "from memory" }).click();
    await page.waitForSelector("#f-prec");
    check("Points start as ?", (await page.locator(".stepnum").allInnerTexts()).slice(1).every((t) => t === "?"));
    await page.selectOption("#f-prec", "month");
    check("The date input becomes a month input", (await page.locator("#f-date").getAttribute("type")) === "month");
    await page.fill("#f-date", "2024-07");
    const names = ["UI Admin", "Guest One", XSS_NAME];
    for (let i = 0; i < 3; i++) await pick(page.locator(".seat-card").nth(i), "player", names[i]);
    await pick(page.locator(".seat-card").nth(0), "faction", "Arborec");
    await pick(page.locator(".seat-card").nth(1), "faction", "Hacan"); // seat 3 keeps no faction
    for (let k = 0; k < 4; k++) await page.locator(".seat-card").nth(0).locator('.step[data-d="1"]').click(); // ? -> 0, 1, 2, 3
    check("Seat 1 points step from ? to 3", (await page.locator(".seat-card").nth(0).locator(".stepnum").innerText()) === "3");
    await page.locator(".seat-card").nth(1).locator("label.radio", { hasText: "Won" }).click();
    await page.click("#save");
    await page.waitForURL(/\/games\/\d+$/, { timeout: 10000 }).catch(async (e) => { throw new Error(`${e.message.split("\n")[0]} (form says: ${await page.locator("#form-err").innerText()})`); });
    memGameId = new URL(page.url()).pathname.split("/").pop();
    await page.waitForSelector(".gseat");
    check("Game page date reads July 2024", (await page.locator("h1.gtitle").innerText()).trim() === "July 2024", await page.locator("h1.gtitle").innerText());
    const scores = await page.locator(".gscore").allInnerTexts();
    check("Unknown points show as ?", scores.filter((t) => t === "?").length === 2 && scores.includes("3"), JSON.stringify(scores));
    check("The winner is the seat that was picked, not the top score", (await page.locator(".gseat.is-winner .gplayer").innerText()).startsWith("Guest One"));
    check("The page says From memory", (await page.locator(".from-memory").innerText()).trim() === "From memory.");
    check("The seat without a faction says it wasn't remembered", (await page.locator(".gfaction", { hasText: "Faction not remembered" }).count()) === 1);
    await go("/games");
    const row = await page.locator(".drow", { hasText: "Guest One won as The Emirates of Hacan" }).first().innerText();
    check("The list row names the month and shows only the known score", row.includes("Jul") && row.includes("Hacan, 3\n"), row);
  });

  await step("Stats mention memory", async () => {
    await go("/games/stats");
    await page.waitForSelector(".bar-fill", { timeout: 10000 });
    check("Stats say how many games were logged from memory",
      (await page.locator("#memory-note").innerText()).trim() === "1 of these was logged from memory, so some scores and factions are missing.");
  });

  await step("Fill from a TI Assistant file", async () => {
    const roster = await post("/api/players", { name: "Player 1" });
    check("A guest named like a TI Assistant player exists", roster.status < 300, roster.status);
    await go("/games/new");
    check("The fill button and file picker are on the new-game form", (await page.locator("#ti-fill, #f-ti-file").count()) === 2);
    check("The link field is not shown twice", (await page.locator("#f-ti").count()) === 1);
    await page.click("#ti-fill");
    await page.waitForSelector("#form-err:not([hidden])");
    check("Fill with no link says to paste one", /Paste a TI Assistant game link/.test(await page.locator("#form-err").innerText()));

    const hostile = structuredClone(ARCHIVED_EXPORT);
    const snaps = hostile.actionLog.filter((e) => e.data.action === "ADVANCE_PHASE");
    for (const e of snaps) e.data.event.factions["Deepwrought Scholarate"].playerName = XSS_NAME.replace("=1", "=2"); // not on the roster, so it shows as a hint
    const upload = (name, json) => page.setInputFiles("#f-ti-file", { name, mimeType: "application/json", buffer: Buffer.from(JSON.stringify(json)) });
    await upload("XyZ789_data.json", hostile);
    await page.waitForFunction(() => document.querySelector("#f-date")?.value === "2026-04-11");
    check("The file fills the date and six seats", (await page.inputValue("#f-date")) === "2026-04-11" && (await page.locator(".seat-card").count()) === 6);
    check("A matching roster name picks the player", (await page.locator(".seat-card").first().locator("[data-kind=player] input").inputValue()) === "Player 1");
    const hints = await page.locator(".ti-hint").allInnerTexts();
    check("Unmatched names show a hint, with hostile text kept literal",
      hints.length === 5 && hints.some((t) => t.includes("<img")) && (await page.locator("main img[src=x]").count()) === 0, JSON.stringify(hints));
    check("window.__xss is undefined after the file fill", (await page.evaluate(() => window.__xss)) === undefined);
    check("The scores button shows for a file named like TI Assistant's download", await page.locator("#ti-scores").isVisible());
    check("The first factions are filled in", (await page.locator(".seat-card").first().locator("[data-kind=faction] input").inputValue()).includes("Jol-Nar"));
    await page.reload();
    await page.waitForSelector("#gform");
    await upload("export.json", ARCHIVED_EXPORT);
    await page.waitForFunction(() => document.querySelector("#f-date")?.value === "2026-04-11");
    check("A file with another name has no scores button", !(await page.locator("#ti-scores").isVisible()));
    await upload("bad.json", { nothing: true });
    await page.waitForSelector("#form-err:not([hidden])");
    check("A file that isn't a TI Assistant game gets a plain error", /doesn't look like a TI Assistant game file/.test(await page.locator("#form-err").innerText()));
    await go("/games/new"); // leave the draft behind
    await page.evaluate(() => localStorage.clear());
  });

  await step("Hostile link", async () => {
    await go(`/games/${gameId}/edit`);
    await page.fill("#f-ti", "https://evil.example/x");
    await page.click("#save");
    await page.waitForSelector("#form-err:not([hidden])", { timeout: 5000 });
    const msg = await page.locator("#form-err").innerText();
    const g = await apiJson(`/api/games/${gameId}`);
    check("Form shows an error and the game is unchanged", msg.length > 0 && new URL(page.url()).pathname.endsWith("/edit") && !g.data?.game?.ti_assistant_url, `${msg} / ${g.data?.game?.ti_assistant_url}`);
  });

  // ── Layout pass ───
  const routes = [
    "/rules", "/rules?q=retreat", "/rules/R_movement", mapUrl(), mapUrl("&view=art"), "/about",
    "/games", "/games/stats", "/games/new", "/games/me", "/games/admin", `/games/${gameId}`, `/games/${memGameId}`,
  ];
  for (const vp of [PHONE, DESKTOP]) {
    for (const scheme of ["dark", "light"]) {
      await page.setViewportSize(vp);
      await page.emulateMedia({ colorScheme: scheme });
      for (const route of routes) {
        const label = `${route.length > 40 ? route.slice(0, 37) + "..." : route} @${vp.width} ${scheme}`;
        await step(`Layout ${label}`, async () => {
          await go(route);
          if (route.startsWith("/map")) await page.waitForSelector("svg.mapsvg", { timeout: 15000 });
          const m = await page.evaluate(() => ({
            sw: document.documentElement.scrollWidth, iw: window.innerWidth,
            text: (document.querySelector("main")?.innerText ?? "").trim().length,
          }));
          check(`Layout ${label}: no horizontal scroll`, m.sw <= m.iw, `scrollWidth ${m.sw} > ${m.iw}`);
          check(`Layout ${label}: main has text`, m.text > 0);
        });
      }
    }
  }
}

try {
  await run();
} catch (err) {
  failures++;
  console.log(`FAIL  ${err.message}`);
} finally {
  await browser?.close().catch(() => {});
  server?.stop();
}
console.log(failures ? `${failures} check(s) failed` : "All checks passed");
process.exit(failures ? 1 : 0);
