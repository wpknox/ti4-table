// Map analysis: turns a parsed map into a per-seat report and plain-English
// text. Pure functions, no DOM and no fetch, so Node can import it too
// (scripts/check-analysis.mjs). Spec: docs/plans/m2-map-analyzer.md (2b).

import { DIRS, rotateLanes } from "./parse.js";

// ── Thresholds ────────────────────────────────────────────────────────────

// A seat's optimal total this far from the table mean is a real imbalance;
// smaller gaps are noise next to dice and draft choices.
export const OPTIMAL_BAND = 0.2;
// Below this share of the table mean on one stat, the seat is lopsided in
// kind (e.g. all resources, no influence) even when its total looks fine.
export const SPLIT_LOW = 0.7;
// One extra move to Mecatol is a note; two or more costs a whole turn of tempo.
export const MECATOL_WARN = 2;
// More than this many anomaly systems in a slice slows movement and fleets.
export const MAX_ANOMALIES = 2;
// Fewer than this many planets one move away leaves a seat with nothing to
// grab early or defend cheaply.
export const MIN_ADJACENT = 2;
// Systems within this many moves count as "near" for tech skips.
export const NEAR = 2;

// Anomalies that stop a fleet from moving on (the system still gets a distance).
const BLOCKING = new Set(["supernova", "asteroid-field", "nebula"]);

const r4 = (x) => Math.round(x * 1e4) / 1e4;
const arr = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

// ── Movement graph ────────────────────────────────────────────────────────

function buildGraph(parsed, tiles) {
  const info = (t) => tiles[t.id] ?? { type: "other", planets: [], wormholes: [], anomaly: null };
  const byHex = new Map(parsed.tiles.map((t) => [`${t.q},${t.r}`, t]));
  const at = (q, r) => byHex.get(`${q},${r}`);
  const isLane = (t) => info(t).type === "hyperlane";
  const systems = parsed.tiles.filter((t) => !isLane(t));
  const adj = new Map(systems.map((t) => [t.pos, new Set()]));
  const link = (a, b) => {
    if (a == null || b == null || a === b) return;
    adj.get(a).add(b);
    adj.get(b).add(a);
  };

  // 1. Neighbouring hexes.
  for (const t of systems)
    for (const [dq, dr] of DIRS) {
      const n = at(t.q + dq, t.r + dr);
      if (n && !isLane(n)) link(t.pos, n.pos);
    }

  // 2. Wormholes (on-map tiles only).
  const holes = new Map();
  for (const t of systems)
    for (const w of arr(info(t).wormholes)) {
      if (!holes.has(w)) holes.set(w, []);
      holes.get(w).push(t.pos);
    }
  for (const list of holes.values()) for (const a of list) for (const b of list) link(a, b);

  // 3. Hyperlanes: walk out of each end of each lane, through further lanes.
  const lanesOf = (t) => rotateLanes(info(t).hyperlanes ?? [], t.rotation);
  function trace(from, edge) {
    let cur = from;
    let e = edge;
    for (let hop = 0; hop < 6; hop++) {
      const n = at(cur.q + DIRS[e][0], cur.r + DIRS[e][1]);
      if (!n) return null;
      if (!isLane(n)) return n.pos;
      const enter = (e + 3) % 6;
      const pair = lanesOf(n).find((p) => p.includes(enter));
      if (!pair) return null;
      e = pair[0] === enter ? pair[1] : pair[0];
      cur = n;
    }
    return null;
  }
  for (const t of parsed.tiles.filter(isLane))
    for (const [a, b] of lanesOf(t)) link(trace(t, a), trace(t, b));

  return { info, adj, systems };
}

// Moves from `start` to every reachable system. Blocking anomalies get a
// distance (for slicing) but never expand the search.
function distancesFrom(start, graph, tileAt) {
  const dist = new Map([[start, 0]]);
  const queue = [start];
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i];
    const stops = p !== start && arr(graph.info(tileAt.get(p)).anomaly).some((a) => BLOCKING.has(a));
    if (stops) continue;
    for (const n of graph.adj.get(p)) {
      if (dist.has(n)) continue;
      dist.set(n, dist.get(p) + 1);
      queue.push(n);
    }
  }
  return dist;
}

// ── Analysis ──────────────────────────────────────────────────────────────

/**
 * @param {object} parsed  return value of parseMapString(str, { data: tiles })
 * @param {object} tiles   the `tiles` object from tiles.json
 */
export function analyze(parsed, tiles) {
  const graph = buildGraph(parsed, tiles);
  const tileAt = new Map(parsed.tiles.map((t) => [t.pos, t]));
  const warnings = [...parsed.warnings];
  const homeSet = new Set(parsed.homes);
  const mecatolPos = parsed.tiles.find((t) => graph.info(t).type === "mecatol")?.pos;

  const dists = parsed.homes.map((h) => distancesFrom(h, graph, tileAt));

  // Slices: each system goes to its nearest seat(s).
  const sliceable = graph.systems.filter((t) => {
    const type = graph.info(t).type;
    return type !== "mecatol" && type !== "home" && t.id !== "0" && !homeSet.has(t.pos);
  });
  const seats = parsed.homes.map((pos, i) => {
    const home = tileAt.get(pos);
    const hi = graph.info(home);
    return {
      seat: i + 1, pos, homeId: home.id, faction: hi.type === "home" ? hi.faction ?? null : null,
      distance: Object.fromEntries([...dists[i]].sort((a, b) => a[0] - b[0])),
      own: [], shared: [], metrics: null,
    };
  });
  const unassigned = [];
  for (const t of sliceable) {
    let best = Infinity;
    let tied = [];
    dists.forEach((d, i) => {
      const v = d.get(t.pos);
      if (v === undefined) return;
      if (v < best) { best = v; tied = [i]; }
      else if (v === best) tied.push(i);
    });
    if (!tied.length) unassigned.push(t.pos);
    else if (tied.length === 1) seats[tied[0]].own.push(t.pos);
    else
      for (const i of tied)
        seats[i].shared.push({ pos: t.pos, weight: r4(1 / tied.length), with: tied.filter((j) => j !== i).map((j) => j + 1) });
  }
  unassigned.sort((a, b) => a - b);
  for (const s of seats) {
    s.own.sort((a, b) => a - b);
    s.shared.sort((a, b) => a.pos - b.pos);
  }
  if (unassigned.length) warnings.push(`${unassigned.length} system(s) can't be reached from any seat.`);
  seats.forEach((s) => {
    if (mecatolPos != null && !dists[s.seat - 1].has(mecatolPos))
      warnings.push(`Seat ${s.seat} can't reach Mecatol Rex.`);
  });

  // Metrics.
  seats.forEach((s, i) => {
    // A system shared by k seats counts 1/k for each.
    const slice = [
      ...s.own.map((pos) => ({ pos, w: 1 })),
      ...s.shared.map((x) => ({ pos: x.pos, w: 1 / (x.with.length + 1) })),
    ];

    const m = {
      optimal: { resources: 0, influence: 0, total: 0 }, raw: { resources: 0, influence: 0 },
      planets: 0, skips: { red: 0, blue: 0, green: 0, yellow: 0 }, skipsNear: 0,
      legendary: [], wormholes: [], anomalies: {}, mecatol: null, adjacentPlanets: 0, contested: {},
    };
    for (const { pos, w } of slice) {
      const info = graph.info(tileAt.get(pos));
      for (const p of info.planets) {
        m.raw.resources += p.resources * w;
        m.raw.influence += p.influence * w;
        if (p.resources > p.influence) m.optimal.resources += p.resources * w;
        else if (p.influence > p.resources) m.optimal.influence += p.influence * w;
        else {
          m.optimal.resources += (p.resources / 2) * w;
          m.optimal.influence += (p.influence / 2) * w;
        }
        if (!info.spaceStation && !p.spaceStation) m.planets += w;
        for (const t of arr(p.tech)) m.skips[t] += w;
        if (p.legendary) m.legendary.push(p.name);
      }
      for (const wh of arr(info.wormholes)) if (!m.wormholes.includes(wh)) m.wormholes.push(wh);
      for (const a of arr(info.anomaly)) m.anomalies[a] = (m.anomalies[a] ?? 0) + w;
    }
    for (const x of s.shared) for (const o of x.with) m.contested[o] = (m.contested[o] ?? 0) + x.weight;

    // Distance-based, unweighted and regardless of whose slice it is.
    for (const [pos, d] of dists[i]) {
      const info = graph.info(tileAt.get(pos));
      if (d <= NEAR) m.skipsNear += info.planets.filter((p) => arr(p.tech).length).length;
      if (d === 1) m.adjacentPlanets += info.spaceStation ? 0 : info.planets.length;
    }
    m.mecatol = mecatolPos != null && dists[i].has(mecatolPos) ? dists[i].get(mecatolPos) : null;

    m.optimal.total = m.optimal.resources + m.optimal.influence;
    for (const k of ["resources", "influence", "total"]) m.optimal[k] = r4(m.optimal[k]);
    for (const k of ["resources", "influence"]) m.raw[k] = r4(m.raw[k]);
    m.planets = r4(m.planets);
    for (const k of Object.keys(m.skips)) m.skips[k] = r4(m.skips[k]);
    for (const k of Object.keys(m.anomalies)) m.anomalies[k] = r4(m.anomalies[k]);
    for (const k of Object.keys(m.contested)) m.contested[k] = r4(m.contested[k]);
    m.legendary.sort();
    m.wormholes.sort();
    s.metrics = m;
  });

  // Table figures.
  const n = seats.length;
  const mean = (f) => (n ? r4(seats.reduce((a, s) => a + f(s.metrics), 0) / n) : 0);
  const mecatols = seats.map((s) => s.metrics.mecatol).filter((v) => v !== null);
  const table = {
    mean: {
      optimalTotal: mean((m) => m.optimal.total), optimalResources: mean((m) => m.optimal.resources),
      optimalInfluence: mean((m) => m.optimal.influence), planets: mean((m) => m.planets),
    },
    bestMecatol: mecatols.length ? Math.min(...mecatols) : null,
    unassigned,
  };

  // Findings.
  const split = (m) => ({ resources: m.optimal.resources, influence: m.optimal.influence });
  const hasLegendary = (pos) => graph.info(tileAt.get(pos)).planets.some((p) => p.legendary);
  const findings = [];
  const add = (seat, severity, code, data = {}) => findings.push({ seat, severity, code, data });
  for (const s of seats) {
    const m = s.metrics;
    const total = m.optimal.total;
    const meanT = table.mean.optimalTotal;
    let optimalWarn = false;
    if (meanT > 0 && total < meanT * (1 - OPTIMAL_BAND)) { add(s.seat, "warn", "optimal-low", { value: total, mean: meanT, ...split(m) }); optimalWarn = true; }
    else if (meanT > 0 && total > meanT * (1 + OPTIMAL_BAND)) { add(s.seat, "warn", "optimal-high", { value: total, mean: meanT, ...split(m) }); optimalWarn = true; }
    if (!optimalWarn) {
      if (m.optimal.resources < table.mean.optimalResources * SPLIT_LOW)
        add(s.seat, "note", "resources-low", { value: m.optimal.resources, mean: table.mean.optimalResources });
      if (m.optimal.influence < table.mean.optimalInfluence * SPLIT_LOW)
        add(s.seat, "note", "influence-low", { value: m.optimal.influence, mean: table.mean.optimalInfluence });
    }
    if (m.skipsNear === 0) add(s.seat, "warn", "no-skips-near", { within: NEAR });
    if (m.mecatol === null) add(s.seat, "warn", "mecatol-far", { value: null, best: table.bestMecatol });
    else if (table.bestMecatol !== null && m.mecatol > table.bestMecatol) {
      const extra = m.mecatol - table.bestMecatol;
      add(s.seat, extra >= MECATOL_WARN ? "warn" : "note", "mecatol-far", { value: m.mecatol, best: table.bestMecatol });
    }
    const anomalyCount = r4(Object.values(m.anomalies).reduce((a, b) => a + b, 0));
    if (anomalyCount > MAX_ANOMALIES) add(s.seat, "note", "many-anomalies", { value: anomalyCount, types: Object.keys(m.anomalies) });
    if (m.wormholes.length) {
      const without = seats.filter((o) => o !== s && !o.metrics.wormholes.length).length;
      if (without >= (n - 1) / 2) add(s.seat, "note", "wormhole", { types: m.wormholes });
    }
    if (m.legendary.length) {
      const sharedWith = [...new Set(s.shared.filter((x) => hasLegendary(x.pos)).flatMap((x) => x.with))];
      add(s.seat, "good", "legendary", { names: m.legendary, sharedWith });
    }
    if (m.adjacentPlanets < MIN_ADJACENT) add(s.seat, "warn", "few-adjacent", { value: m.adjacentPlanets });
  }

  const flagged = [...new Set(findings.filter((f) => f.severity === "warn").map((f) => f.seat))];
  let code = "fair";
  if (flagged.length >= 2) code = "lopsided";
  else if (flagged.length === 1)
    code = findings.some((f) => f.seat === flagged[0] && f.code === "optimal-high") ? "one-strong" : "one-weak";

  return { seats, table, findings, verdict: { code, seats: flagged }, warnings };
}

// ── Wording ───────────────────────────────────────────────────────────────

const fmt = (x) => String(+Number(x).toFixed(1));
const list = (xs) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const plural = (n, one, many) => (n === 1 ? one : many);
const ANOMALY_RULE = {
  supernova: "R_supernova", "asteroid-field": "R_asteroid_field", nebula: "R_nebula", "gravity-rift": "R_gravity_rift",
};
const ORDER = { warn: 0, note: 1, good: 2 };

function sentence(f, seat, report) {
  const d = f.data;
  const mean = report.table.mean;
  switch (f.code) {
    // Name the side that drives the gap, so a seat that is only short on
    // influence isn't described as short on everything.
    case "optimal-low":
    case "optimal-high": {
      const low = f.code === "optimal-low";
      const r = d.resources / (mean.optimalResources || 1);
      const i = d.influence / (mean.optimalInfluence || 1);
      const side = Math.abs(r - i) < 0.25 ? "resources and influence" : (low ? r < i : r > i) ? "resources" : "influence";
      return {
        text: `${low ? "Weak" : "Strong"} on ${side}: ${fmt(d.value)} optimal (${fmt(d.resources)} resources, ${fmt(d.influence)} influence), against a table average of ${fmt(d.mean)}.`,
      };
    }
    case "resources-low":
      return { text: `Short on resources: ${fmt(d.value)} optimal, against a table average of ${fmt(d.mean)}.` };
    case "influence-low":
      return { text: `Short on influence: ${fmt(d.value)} optimal, against a table average of ${fmt(d.mean)}.` };
    case "no-skips-near":
      return { text: `No tech skips within ${d.within} moves.` };
    case "mecatol-far":
      if (d.value === null) return { text: "Can't reach Mecatol Rex by normal movement." };
      return { text: `${d.value} moves from Mecatol Rex, against ${d.best} for the closest seat.` };
    case "many-anomalies": {
      const first = d.types[0];
      return { text: `${fmt(d.value)} anomaly systems in this slice (${list(d.types.map((t) => t.replace("-", " ")))}), which slow movement.`, rule: ANOMALY_RULE[first] };
    }
    case "wormhole":
      return { text: `Has ${list(d.types)} wormhole access that most of the table lacks.`, rule: "R_wormholes" };
    case "legendary": {
      const what = plural(d.names.length, "a legendary planet", "legendary planets");
      const names = list(d.names);
      return { text: d.sharedWith.length ? `Shares ${what} with seat ${list(d.sharedWith)}: ${names}.` : `Has ${what}: ${names}.` };
    }
    case "few-adjacent":
      return { text: `Only ${d.value} ${plural(d.value, "planet", "planets")} one move away, so little to claim or defend early.` };
    default:
      return { text: f.code };
  }
}

/** report -> { verdict, seats: [{ seat, title, lines: [{ text, severity, rule? }] }] } */
export function describe(report) {
  const { code, seats: flagged } = report.verdict;
  let verdict;
  if (code === "fair") verdict = "Fair.";
  else if (code === "one-weak") verdict = `Fair, with one weak seat (seat ${flagged[0]}).`;
  else if (code === "one-strong") verdict = `Fair, with one strong seat (seat ${flagged[0]}).`;
  else verdict = `Lopsided: seats ${list(flagged)} stand out.`;

  const seats = report.seats.map((s) => {
    const lines = report.findings
      .filter((f) => f.seat === s.seat)
      .sort((a, b) => ORDER[a.severity] - ORDER[b.severity])
      .map((f) => ({ ...sentence(f, s, report), severity: f.severity }));
    if (!lines.length)
      lines.push({ text: "Close to the table average on everything.", severity: "good" });
    return { seat: s.seat, title: s.faction ? `Seat ${s.seat}: ${s.faction}` : `Seat ${s.seat}`, lines };
  });
  return { verdict, seats };
}
