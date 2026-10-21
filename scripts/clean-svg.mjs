#!/usr/bin/env node
// Sanitize SVG icons with a strict allowlist, in place. No dependencies.
//
//   node scripts/clean-svg.mjs public/img/factions/*.svg
//   node scripts/clean-svg.mjs --check file.svg   (exit 1 if the file would change)
//
// Why a parser and not regexes: icons from third parties are untrusted. We parse
// the small subset of XML that real icons use, rebuild the file from allowlisted
// elements and attributes only, and FAIL (exit 1, file untouched) on anything we
// can't parse, rather than passing it through.
import fs from 'node:fs';

const ELEMENTS = new Set(['svg', 'g', 'path', 'circle', 'ellipse', 'rect', 'polygon', 'polyline', 'line', 'title', 'defs', 'clipPath', 'use']);
// Dropped with everything inside them (reported, not fatal).
const STRIP = new Set(['script', 'foreignObject', 'style', 'image', 'metadata', 'mask', 'filter', 'animate', 'set', 'animateTransform', 'a', 'text', 'tspan', 'linearGradient', 'radialGradient', 'pattern', 'symbol', 'marker', 'namedview', 'switch']);
const ATTRS = new Set([
  'id', 'd', 'viewBox', 'xmlns', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit',
  'fill-rule', 'clip-rule', 'clip-path', 'transform', 'opacity', 'fill-opacity', 'stroke-opacity',
  'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'width', 'height', 'points', 'x1', 'y1', 'x2', 'y2', 'href', 'clipPathUnits',
]);
const NUM = /^[-+0-9.eE ,\t\n\rMmLlHhVvCcSsQqTtAaZz]*$/; // path data and number lists only
const TRANSFORM = /^\s*((matrix|translate|scale|rotate)\([-+0-9.eE ,]*\)\s*)+$/;
const report = [];

class SvgError extends Error {}
const fail = (msg) => { throw new SvgError(msg); };

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
function decode(s) {
  return s.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, (m, e) => {
    if (Object.hasOwn(NAMED, e)) return NAMED[e];
    return String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
  });
}
const encode = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ── Parse ─────────────────────────────────────────────────────────────────
function parse(src) {
  let i = 0;
  const root = { name: '#root', attrs: {}, children: [] };
  const stack = [root];
  const top = () => stack[stack.length - 1];
  while (i < src.length) {
    const lt = src.indexOf('<', i);
    checkText(src.slice(i, lt < 0 ? src.length : lt), stack);
    if (lt < 0) break;
    const past = skipMarkup(src, lt);
    if (past >= 0) { i = past; continue; }
    if (src.startsWith('</', lt)) { i = closeTag(src, lt, stack, root); continue; }
    const { node, end, selfClose } = openTag(src, lt);
    top().children.push(node);
    if (!selfClose) stack.push(node);
    i = end;
  }
  if (stack.length !== 1) fail('unclosed element <' + top().name + '>');
  if (root.children.length !== 1) fail('expected exactly one root element');
  return root.children[0];
}

// Text between tags: only a <title> may hold any (and stripped elements are dropped later anyway).
function checkText(text, stack) {
  if (!text.trim()) return;
  const p = stack[stack.length - 1];
  if (p.name === 'title') p.text = (p.text || '') + decode(text.trim());
  else if (p.name !== '#root' && !stack.some((n) => n.name !== '#root' && (STRIP.has(localName(n.name)) || n.name.includes(':')))) fail(`unexpected text inside <${p.name}>`);
  else if (p.name === '#root') fail('text outside the root element');
}

// Comments and processing instructions are skipped (returns the index after
// them); CDATA and DOCTYPE fail; anything else returns -1.
function skipMarkup(src, lt) {
  if (src.startsWith('<!--', lt)) {
    const e = src.indexOf('-->', lt);
    if (e < 0) fail('unterminated comment');
    return e + 3;
  }
  if (src.startsWith('<?', lt)) {
    const e = src.indexOf('?>', lt);
    if (e < 0) fail('unterminated processing instruction');
    return e + 2;
  }
  if (src.startsWith('<![CDATA[', lt)) fail('CDATA is not allowed');
  if (src.startsWith('<!', lt)) fail('DOCTYPE / entity declarations are not allowed');
  return -1;
}

function closeTag(src, lt, stack, root) {
  const e = src.indexOf('>', lt);
  if (e < 0) fail('unterminated closing tag');
  const name = src.slice(lt + 2, e).trim();
  const node = stack.pop();
  if (!node || node === root || node.name !== name) fail(`mismatched closing tag </${name}>`);
  return e + 1;
}

// Opening tag: read the name, then attributes with quoted values.
function openTag(src, lt) {
  const m = /^<([A-Za-z_][\w:.-]*)/.exec(src.slice(lt, lt + 200));
  if (!m) fail(`cannot parse tag near "${src.slice(lt, lt + 30)}"`);
  const node = { name: m[1], attrs: {}, children: [] };
  let j = lt + m[0].length, selfClose = false;
  for (;;) {
    while (/\s/.test(src[j] ?? '')) j++;
    if (j >= src.length) fail(`unterminated tag <${node.name}>`);
    if (src[j] === '>') { j++; break; }
    if (src[j] === '/' && src[j + 1] === '>') { selfClose = true; j += 2; break; }
    const am = /^([A-Za-z_][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)')/.exec(src.slice(j, j + 200000));
    if (!am) fail(`cannot parse attribute in <${node.name}> near "${src.slice(j, j + 30)}"`);
    node.attrs[am[1]] = decode(am[3] ?? am[4]);
    j += am[0].length;
  }
  return { node, end: j, selfClose };
}
const localName = (n) => n.replace(/^.*:/, '');

// ── Sanitize ──────────────────────────────────────────────────────────────
const internalRef = (v) => /^#[A-Za-z_][\w.-]*$/.test(v);
const urlRef = (v) => { const m = /^url\(\s*#([A-Za-z_][\w.-]*)\s*\)$/.exec(v.trim()); return m ? `url(#${m[1]})` : null; };

const dropped = (msg) => { report.push(msg); return null; };

function cleanHref(k, v, name) {
  if (name !== 'use') return dropped(`dropped ${k} on <${name}>`);
  if (!internalRef(v)) fail(`<use> ${k} must be an internal #id, got "${v.slice(0, 60)}"`);
  return ['href', v];
}

// One attribute -> [name, value] to keep, or null to drop it. Fails on anything unsafe.
function cleanAttr(k, v, name) {
  if (/^on/i.test(k)) return dropped(`dropped ${k} on <${name}>`);
  if (k === 'href' || k === 'xlink:href') return cleanHref(k, v, name);
  if (/^xmlns/.test(k) || k.includes(':')) return k === 'xmlns' ? null : dropped(`dropped ${k}`);
  if (k === 'style') return dropped(`dropped style on <${name}> (use attributes)`);
  if (k === 'class' || k === 'version' || k === 'baseProfile') return null;
  if (!ATTRS.has(k)) return dropped(`dropped attribute ${k} on <${name}>`);
  if (/data:|javascript:|https?:|file:|\/\//i.test(v)) fail(`attribute ${k} on <${name}> contains an external or data reference`);
  return [k, cleanValue(k, v, name)];
}

// The value to keep for an allowlisted attribute (fails if it's not a safe shape).
function cleanValue(k, v, name) {
  if (k === 'clip-path') {
    const u = urlRef(v);
    if (!u) fail(`clip-path must be url(#id), got "${v}"`);
    return u;
  }
  if (k === 'fill' || k === 'stroke') {
    if (v === 'none' || v === 'currentColor') return v;
    report.push(`${k}="${v}" on <${name}> -> currentColor`);
    return 'currentColor';
  }
  if ((k === 'd' || k === 'points' || k === 'viewBox') && !NUM.test(v)) fail(`unexpected characters in ${k} on <${name}>`);
  if (k === 'transform' && !TRANSFORM.test(v)) fail(`unsupported transform "${v.slice(0, 60)}"`);
  return v;
}

function cleanAttrs(el, name) {
  const out = {};
  for (const [k, v] of Object.entries(el.attrs)) {
    const kept = cleanAttr(k, v, name);
    if (kept) out[kept[0]] = kept[1];
  }
  return out;
}

function clean(el, isRoot) {
  const name = el.name;
  const ln = localName(name);
  if (name.includes(':') || STRIP.has(ln)) { report.push(`removed <${name}>`); return null; }
  if (!ELEMENTS.has(name)) fail(`element <${name}> is not on the allowlist`);
  if (isRoot && name !== 'svg') fail('root element must be <svg>');
  if (!isRoot && name === 'svg') fail('nested <svg> is not allowed');
  const attrs = cleanAttrs(el, name);
  if (name === 'use' && !attrs.href) fail('<use> needs an internal href');
  const kids = [];
  for (const c of el.children) {
    const k = clean(c, false);
    if (k) kids.push(k);
  }
  return { name, attrs, children: kids, text: el.text };
}

function check(root) {
  const vb = (root.attrs.viewBox || '').trim().split(/[ ,]+/).map(Number);
  if (vb.length !== 4 || vb.some((n) => !Number.isFinite(n))) fail('root needs a numeric viewBox');
  if (Math.abs(vb[2] - vb[3]) > 0.01 * Math.max(vb[2], vb[3])) fail(`viewBox is not square (${vb[2]} x ${vb[3]})`);
  // every url(#x) and href must point at an id that exists
  const ids = new Set(), refs = [];
  (function walk(n) {
    if (n.attrs.id) ids.add(n.attrs.id);
    for (const [k, v] of Object.entries(n.attrs)) {
      if (k === 'href') refs.push(v.slice(1));
      if (k === 'clip-path') refs.push(v.slice(5, -1));
    }
    n.children.forEach(walk);
  })(root);
  for (const r of refs) if (!ids.has(r)) fail(`reference to missing id "${r}"`);
  if (!root.children.length) fail('svg is empty');
}

function write(n) {
  const a = Object.entries(n.attrs).map(([k, v]) => ` ${k}="${encode(v)}"`).join('');
  const inner = (n.name === 'title' && n.text ? encode(n.text) : '') + n.children.map(write).join('');
  return inner ? `<${n.name}${a}>${inner}</${n.name}>` : `<${n.name}${a}/>`;
}

export function cleanSvg(src) {
  report.length = 0;
  const root = clean(parse(src), true);
  root.attrs = { xmlns: 'http://www.w3.org/2000/svg', viewBox: root.attrs.viewBox, ...root.attrs };
  delete root.attrs.width; delete root.attrs.height;
  check(root);
  return write(root) + '\n';
}

// ── CLI ───────────────────────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const checkOnly = args[0] === '--check';
  const files = checkOnly ? args.slice(1) : args;
  if (!files.length) { console.error('usage: node scripts/clean-svg.mjs [--check] file.svg ...'); process.exit(2); }
  let bad = 0;
  for (const f of files) {
    try {
      const src = fs.readFileSync(f, 'utf8');
      const out = cleanSvg(src);
      const notes = [...new Set(report)];
      const changed = out !== src;
      if (checkOnly) {
        console.log(`${changed ? 'DIRTY' : 'ok   '} ${f}`);
        if (changed) bad++;
      } else {
        if (changed) fs.writeFileSync(f, out);
        const noteText = notes.length ? '\n   ' + notes.join('\n   ') : '';
        console.log(`${changed ? 'cleaned' : 'ok     '} ${f} (${Buffer.byteLength(out)} bytes)${noteText}`);
      }
    } catch (e) {
      bad++;
      console.error(`FAIL ${f}: ${e.message}`);
    }
  }
  process.exit(bad ? 1 : 0);
}
