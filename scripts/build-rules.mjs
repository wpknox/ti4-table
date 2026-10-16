// Bundles the tirules-search pages into public/data/rules.json.
// Usage: node scripts/build-rules.mjs [path/to/tirules-search]
//
// The rules folder is the first of: the path argument, $TIRULES_DIR, or a
// tirules-search clone next to this repo. The credit link shown on the site
// comes from that folder's git remote, so a different fork is credited correctly.
//
// Each R_/F_/C_ page in the rules repo is plain HTML wrapped in two PHP
// include lines, so we strip those and keep the rest as-is. The site renders
// that HTML directly and builds its search index in the browser.

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = resolve(
  process.argv[2] ?? process.env.TIRULES_DIR ?? join(ROOT, "../tirules-search"),
);
const OUT = join(ROOT, "public/data/rules.json");

if (!existsSync(SRC) || !readdirSync(SRC).some((f) => /^R_\w+\.php$/.test(f))) {
  console.error(
    `No tirules-search pages found in ${SRC}\n\n` +
      "Clone https://github.com/wpknox/tirules-search (or a fork), then either:\n" +
      "  node scripts/build-rules.mjs path/to/tirules-search\n" +
      "  TIRULES_DIR=path/to/tirules-search node scripts/build-rules.mjs\n" +
      "or put the clone next to this repo as ../tirules-search.",
  );
  process.exit(1);
}

// Returns null when the folder isn't a git repo or git isn't installed.
function git(args) {
  try {
    return execSync(`git ${args}`, { cwd: SRC, stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

// git@github.com:owner/repo.git or https://github.com/owner/repo.git
//   -> https://github.com/owner/repo
function webUrl(remote) {
  if (!remote) return null;
  return remote
    .replace(/^git@([^:]+):/, "https://$1/")
    .replace(/^ssh:\/\/git@/, "https://")
    .replace(/\.git$/, "");
}

const KINDS = { R: "Rules", F: "Factions", C: "Components" };

const ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  times: "×",
  Omega: "Ω",
  omega: "ω",
};

function decode(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) =>
      String.fromCodePoint(Number.parseInt(n, 16)),
    )
    .replace(/&(\w+);/g, (_, name) => ENTITIES[name] ?? " ");
}

function buildPage(file) {
  const id = file.replace(/\.php$/, "");
  let html = readFileSync(join(SRC, file), "utf8")
    .replace(/<\?php\s+include\s+"(prefix|suffix)\.php"\s*\?>\n?/g, "")
    .trim();

  const h1 = html.match(/<header>\s*<h1>(.*?)<\/h1>\s*<\/header>/is);
  if (!h1) throw new Error(`${file}: no <header><h1> found`);
  const sub = h1[1].match(/<sub>(.*?)<\/sub>/is);
  const title = decode(
    h1[1]
      .replace(/<sub>.*?<\/sub>/is, "")
      .replace(/<br\s*\/?>/gi, " / ")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/\s+/g, " ")
    .trim();
  const subtitle = sub
    ? decode(sub[1].replace(/<[^>]+>/g, ""))
        .replace(/^\(|\)$/g, "")
        .trim()
    : "";

  return { id, kind: KINDS[id[0]], title, subtitle, html };
}

const files = readdirSync(SRC).filter((f) => /^[RFC]_\w+\.php$/.test(f));
const sortKey = (p) => p.title.replace(/^[^\p{L}]+/u, "");
const pages = files
  .map(buildPage)
  .sort((a, b) => sortKey(a).localeCompare(sortKey(b)));

const commit = git("rev-parse --short HEAD") ?? "unknown";
const repo =
  webUrl(git("remote get-url origin")) ?? "https://github.com/wpknox/tirules-search";

const data = {
  // No build timestamp: the file only changes when the rules do.
  source: { repo, commit },
  pages,
};
writeFileSync(OUT, JSON.stringify(data));

const counts = Object.values(KINDS).map(
  (k) => `${pages.filter((p) => p.kind === k).length} ${k.toLowerCase()}`,
);
console.log(
  `Wrote ${OUT}\n  ${pages.length} pages (${counts.join(", ")}) from ${SRC} @ ${commit}`,
);
