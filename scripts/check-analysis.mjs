// Checks public/js/map/analyze.js against synthetic maps with hand-checked
// numbers, then runs it over the real maps in scripts/fixtures/maps.mjs.
// No dependencies:  node scripts/check-analysis.mjs

import { readFileSync } from "node:fs";
import { parseMapString } from "../public/js/map/parse.js";
import { analyze, describe } from "../public/js/map/analyze.js";
import { MAPS, SYM, swap, LOP, SUPERNOVA, NEBULA, ASTEROID, RIFT, WORMHOLE } from "./fixtures/maps.mjs";

const { tiles } = JSON.parse(readFileSync(new URL("../public/data/tiles.json", import.meta.url), "utf8"));
const rules = JSON.parse(readFileSync(new URL("../public/data/rules.json", import.meta.url), "utf8"));
const RULE_IDS = new Set(rules.pages.map((p) => p.id));

let failures = 0;
const check = (ok, msg) => {
  if (!ok) {
    failures++;
    console.log(`    FAIL ${msg}`);
  }
};
const eq = (a, b, msg) => check(JSON.stringify(a) === JSON.stringify(b), `${msg}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
const near = (a, b, msg) => check(typeof a === "number" && Math.abs(a - b) < 1e-3, `${msg}: got ${a}, want ${b}`);

const run = (str, playerCount) => {
  const parsed = parseMapString(str, { data: tiles, playerCount });
  return { parsed, report: analyze(parsed, tiles) };
};
const warnsOf = (report, seat) => report.findings.filter((f) => f.seat === seat && f.severity === "warn").map((f) => f.code);
const finding = (report, seat, code) => report.findings.find((f) => f.seat === seat && f.code === code);

// Conservation: every slice-able system is handed out exactly once.
function conserved(parsed, report) {
  const sliceable = parsed.tiles.filter((t) => {
    const i = tiles[t.id];
    return i && i.type !== "hyperlane" && i.type !== "mecatol" && i.type !== "home" && t.id !== "0" && !parsed.homes.includes(t.pos);
  }).length;
  const given = report.seats.reduce((a, s) => a + s.own.length + s.shared.reduce((b, x) => b + x.weight, 0), 0);
  near(given + report.table.unassigned.length, sliceable, "slice conservation");
}

// ── SYM ───────────────────────────────────────────────────────────────────

console.log("SYM");
{
  const { parsed, report } = run(SYM);
  eq(parsed.homes, [19, 22, 25, 28, 31, 34], "homes");
  conserved(parsed, report);
  const s1 = report.seats[0];
  eq(s1.own, [1, 7, 20, 36], "seat 1 own");
  eq(s1.shared, [{ pos: 8, weight: 0.5, with: [2] }, { pos: 18, weight: 0.5, with: [6] }], "seat 1 shared");
  const m = s1.metrics;
  near(m.optimal.resources, 3, "optimal R");
  near(m.optimal.influence, 5, "optimal I");
  near(m.optimal.total, 8, "optimal total");
  near(m.raw.resources, 7, "raw R");
  near(m.raw.influence, 8, "raw I");
  near(m.planets, 5, "planets");
  eq(m.skips, { red: 0, blue: 1, green: 1, yellow: 1 }, "skips");
  check(m.mecatol === 3, `mecatol ${m.mecatol}`);
  check(m.adjacentPlanets === 3, `adjacentPlanets ${m.adjacentPlanets}`);
  for (const s of report.seats) {
    // Rotating the map turns contested keys too, so compare shape not keys.
    const norm = (x) => JSON.stringify({ ...x, contested: Object.values(x.contested) });
    check(norm(s.metrics) === norm(m), `seat ${s.seat} metrics match seat 1`);
    eq(s.own.length, 4, `seat ${s.seat} own count`);
  }
  eq(report.findings.filter((f) => f.severity === "warn"), [], "no warns");
  check(report.verdict.code === "fair", `verdict ${report.verdict.code}`);
}

// ── LOP ───────────────────────────────────────────────────────────────────

console.log("LOP");
{
  const { parsed, report } = run(LOP);
  conserved(parsed, report);
  eq(report.seats.map((s) => s.metrics.optimal.total), [17, 8, 8, 5, 8, 8], "optimal totals");
  near(report.table.mean.optimalTotal, 9, "table mean");
  check(!!finding(report, 1, "optimal-high"), "seat 1 optimal-high");
  check(!!finding(report, 4, "optimal-low"), "seat 4 optimal-low");
  check(!!finding(report, 4, "few-adjacent"), "seat 4 few-adjacent");
  check(report.seats[3].metrics.adjacentPlanets === 1, `seat 4 adjacentPlanets ${report.seats[3].metrics.adjacentPlanets}`);
  for (const s of [2, 3, 5, 6]) eq(warnsOf(report, s), [], `seat ${s} warns`);
  eq(report.verdict, { code: "lopsided", seats: [1, 4] }, "verdict");
  const d = describe(report);
  check(d.seats[0].lines.some((l) => l.text.includes("17") && l.text.includes("9")), "seat 1 line mentions 17 and 9");
  check(/seats 1 and 4/.test(d.verdict), `verdict text: ${d.verdict}`);
  console.log(`  ${d.verdict}`);
}

// ── Anomalies ─────────────────────────────────────────────────────────────

console.log("SUPERNOVA");
{
  const { parsed, report } = run(SUPERNOVA);
  conserved(parsed, report);
  const s1 = report.seats[0];
  check(s1.metrics.mecatol === 4, `seat 1 mecatol ${s1.metrics.mecatol}`);
  for (const s of report.seats.slice(1)) check(s.metrics.mecatol === 3, `seat ${s.seat} mecatol ${s.metrics.mecatol}`);
  check(s1.distance["7"] === 1, `seat 1 distance to 7 is ${s1.distance["7"]}`);
  // Nothing beyond the supernova may be reached through it: 7's other
  // neighbours (8, 1, 18, 19, 20 etc.) are reached the long way or not at all.
  const sh = s1.shared.find((x) => x.pos === 1);
  check(sh && sh.with.length === 2 && sh.with.includes(2) && sh.with.includes(6), `position 1 shared with 2 and 6: ${JSON.stringify(sh)}`);
  near(sh?.weight, 1 / 3, "position 1 weight");
  const f = finding(report, 1, "mecatol-far");
  check(f && f.severity === "note", `seat 1 mecatol-far is a note: ${JSON.stringify(f)}`);
}
for (const [name, str, want] of [["NEBULA", NEBULA, 4], ["ASTEROID", ASTEROID, 4], ["RIFT", RIFT, 3]]) {
  console.log(name);
  const { parsed, report } = run(str);
  conserved(parsed, report);
  const s1 = report.seats[0];
  check(s1.metrics.mecatol === want, `seat 1 mecatol ${s1.metrics.mecatol}, want ${want}`);
  if (name !== "RIFT") check(s1.distance["7"] === 1, `seat 1 distance to 7 is ${s1.distance["7"]}`);
}

console.log("WORMHOLE");
{
  const { parsed, report } = run(WORMHOLE);
  conserved(parsed, report);
  const [s1, , , s4] = report.seats;
  check(s1.distance["29"] === 2, `seat 1 to 29: ${s1.distance["29"]}`);
  check(s4.distance["20"] === 2, `seat 4 to 20: ${s4.distance["20"]}`);
  check(s1.own.includes(20), "20 is seat 1's own");
  check(s4.own.includes(29), "29 is seat 4's own");
}

// ── Thunder's Edge ────────────────────────────────────────────────────────

console.log("THUNDER'S EDGE");
{
  // Same rules as the plan (rules page R_expedition), written out afresh.
  const eligibleOk = (parsed, report, name) => {
    for (const pos of report.thundersEdge.eligible) {
      const t = parsed.tiles.find((x) => x.pos === pos);
      const i = tiles[t.id];
      const ok = t.id !== "0" && !parsed.homes.includes(pos) && i && i.type !== "home" && i.type !== "mecatol" && i.type !== "hyperlane" &&
        i.planets.every((p) => p.spaceStation) && ![].concat(i.anomaly ?? []).includes("supernova") && ![].concat(i.wormholes ?? []).length && !i.fracture;
      check(ok, `${name}: position ${pos} (tile ${t.id}) is not eligible`);
    }
  };
  for (const m of [...MAPS, { name: "SYM", str: SYM }]) {
    const { parsed, report } = run(m.str, m.players);
    eligibleOk(parsed, report, m.name);
    check(report.thundersEdge.spots.length <= 3, `${m.name}: at most 3 spots`);
  }

  for (const [name, str, off] of [["SUPERNOVA", SUPERNOVA, [7]], ["WORMHOLE", WORMHOLE, [20, 29]]]) {
    const { report } = run(str);
    for (const p of off) check(!report.thundersEdge.eligible.includes(p), `${name}: ${p} must not be eligible`);
  }
  // Tile 117 holds only a space station (The Watchtower), which doesn't block placement.
  check(run(swap(SYM, { 7: 117 })).report.thundersEdge.eligible.includes(7), "STATION: 7 (tile 117, station only) is eligible");

  // SYM has a planet in every system, so nothing is eligible. This variant
  // empties ring 1 (positions 1-6, two moves from the nearest home, tiles 46-50
  // and 77 are plain red with no planet) and stays 60-degree symmetric.
  const SYM_TE = swap(SYM, { 1: 46, 2: 47, 3: 48, 4: 49, 5: 50, 6: 77 });
  const none = run(SYM);
  eq(none.report.thundersEdge, { eligible: [], spots: [] }, "SYM: nothing eligible");
  check(none.report.warnings.includes("No system on this map can take Thunder's Edge."), "SYM: warns that nothing can take it");
  eq(none.report.findings.filter((f) => f.code === "te-far"), [], "SYM: no te-far");

  {
    const { parsed, report } = run(SYM_TE);
    eligibleOk(parsed, report, "SYM_TE");
    eq(report.thundersEdge.eligible, [1, 2, 3, 4, 5, 6], "SYM_TE eligible");
    // Independent minimum spread, from each seat's distance table.
    const spreadOf = (p) => {
      const ds = report.seats.map((s) => s.distance[p]);
      return Math.max(...ds) - Math.min(...ds);
    };
    const reach = report.thundersEdge.eligible.filter((p) => report.seats.every((s) => s.distance[p] !== undefined));
    const minSpread = Math.min(...reach.map(spreadOf));
    check(report.thundersEdge.spots.length > 0, "SYM_TE has spots");
    for (const sp of report.thundersEdge.spots) {
      check(sp.max - sp.min === minSpread, `spot ${sp.pos}: spread ${sp.max - sp.min}, want ${minSpread}`);
      check(sp.min === Math.min(...report.seats.map((s) => s.distance[sp.pos])), `spot ${sp.pos}: min`);
    }
    const nearest = report.seats.map((s) => s.metrics.thundersEdge.nearest);
    check(nearest.every((v) => v === 2), `SYM_TE nearest ${nearest}`);
    eq(report.findings.filter((f) => f.code === "te-far"), [], "SYM_TE: no te-far");
  }

  // Seat 1 (home 19) has planets all around: 18, 20 and 36 are adjacent, so
  // its nearest empty system is 4 moves away (23 and 33, counted from the
  // distance table: 19-20-21-22-23 is four steps and no shortcut exists).
  // Seats 2-6 each get an empty system next to home: 23 beside home 22, 26
  // beside 25, 29 beside 28, 32 beside 31 and 33 beside 34. They sit at 1.
  {
    const { report } = run(swap(SYM, { 23: 46, 26: 47, 29: 48, 32: 49, 33: 50 }));
    eq(report.seats.map((s) => s.metrics.thundersEdge.nearest), [4, 1, 1, 1, 1, 1], "te nearest per seat");
    const f = finding(report, 1, "te-far");
    check(f && f.severity === "note" && f.data.value === 4 && f.data.best === 1, `seat 1 te-far: ${JSON.stringify(f)}`);
    eq(report.findings.filter((x) => x.code === "te-far").length, 1, "only seat 1 gets te-far");
    // The verdict comes from warnings alone, so it matches one built without te-far.
    const flagged = [...new Set(report.findings.filter((x) => x.severity === "warn").map((x) => x.seat))];
    eq(report.verdict.seats, flagged, "verdict seats are exactly the warned seats");
    check(report.findings.every((x) => x.code !== "te-far" || x.severity === "note"), "te-far is never a warn");
  }

  // Wording.
  const base = { seat: 1, severity: "note", code: "te-far" };
  const text = (data) => {
    const rep = { verdict: { code: "fair", seats: [] }, findings: [{ ...base, data }], seats: [{ seat: 1, faction: null }], table: { mean: {} } };
    return describe(rep).seats[0].lines[0];
  };
  const a = text({ value: 4, best: 1 });
  eq(a.text, "The nearest system Thunder's Edge could land in is 4 moves away, against 1 for the closest seat.", "te-far text");
  eq(text({ value: 1, best: 0 }).text.includes("is 1 move away"), true, "te-far singular");
  eq(text({ value: null, best: 1 }).text, "No system Thunder's Edge can be placed in is reachable from here.", "te-far null text");
  check(a.rule === "R_expedition" && RULE_IDS.has(a.rule), `rule ${a.rule} exists`);
}

// ── Real maps ─────────────────────────────────────────────────────────────

for (const m of MAPS) {
  const before = failures;
  console.log(`\n${m.name}`);
  const { parsed, report } = run(m.str, m.players);
  const d = describe(report);
  console.log(`  verdict: ${report.verdict.code} (${d.verdict})`);
  eq(report.seats.length, parsed.homes.length, "one entry per home");
  conserved(parsed, report);
  const lanes = new Set(parsed.tiles.filter((t) => tiles[t.id]?.type === "hyperlane").map((t) => t.pos));
  for (const s of report.seats) {
    check(!Object.keys(s.distance).some((p) => lanes.has(Number(p))), `seat ${s.seat} distance has no hyperlane`);
    check(![...s.own, ...s.shared.map((x) => x.pos)].some((p) => lanes.has(p)), `seat ${s.seat} slice has no hyperlane`);
    check(typeof s.metrics.mecatol === "number", `seat ${s.seat} mecatol is a number`);
  }
  check(d.seats.length === report.seats.length && d.seats.every((s) => s.lines.length >= 1), "every seat has a line");
  check(d.seats.every((s) => s.lines.every((l) => !l.rule || RULE_IDS.has(l.rule))), "rule ids exist");
  for (const w of report.warnings) console.log(`  warning: ${w}`);
  for (const s of report.seats) {
    const x = s.metrics;
    console.log(`  seat ${s.seat}${s.faction ? " " + s.faction : ""}: optimal ${x.optimal.total} (R ${x.optimal.resources} / I ${x.optimal.influence}), planets ${x.planets}, mecatol ${x.mecatol}, near skips ${x.skipsNear}, adjacent ${x.adjacentPlanets}`);
    for (const l of d.seats[s.seat - 1].lines) console.log(`      [${l.severity}] ${l.text}`);
  }
  console.log(`  ${failures === before ? "ok" : "FAILED"}`);
}

console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
