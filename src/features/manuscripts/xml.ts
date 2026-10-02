/**
 * Minimal XML well-formedness checker (no dependencies). Used by unit tests and by the export route as a
 * self-check before a TEI file is served. It verifies: one root element, properly nested and matched tags,
 * quoted and unique attributes, legal entity references, no stray '<' or '&'.
 */
export type WellFormed = { ok: true } | { ok: false; error: string; at: number };

const NAME = /^[A-Za-z_:][\w.\-:]*/;
const ENTITY = /^&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/;

export function checkWellFormed(xml: string): WellFormed {
  let i = 0;
  const stack: string[] = [];
  let roots = 0;
  const fail = (error: string): WellFormed => ({ ok: false, error, at: i });
  const text = (end: number) => {
    for (let j = i; j < end; j++) {
      if (xml[j] === "&") {
        if (!ENTITY.test(xml.slice(j, j + 12))) return false;
      }
    }
    return true;
  };
  if (xml.startsWith("﻿")) i = 1;
  while (i < xml.length) {
    const lt = xml.indexOf("<", i);
    const end = lt === -1 ? xml.length : lt;
    if (!text(end)) return fail("bad entity reference");
    if (!stack.length && xml.slice(i, end).trim()) return fail("text outside the root element");
    if (lt === -1) break;
    i = lt;
    if (xml.startsWith("<?", i)) {
      const e = xml.indexOf("?>", i);
      if (e === -1) return fail("unterminated processing instruction");
      i = e + 2;
      continue;
    }
    if (xml.startsWith("<!--", i)) {
      const e = xml.indexOf("-->", i + 4);
      if (e === -1) return fail("unterminated comment");
      i = e + 3;
      continue;
    }
    if (xml.startsWith("<![CDATA[", i)) {
      if (!stack.length) return fail("CDATA outside the root");
      const e = xml.indexOf("]]>", i);
      if (e === -1) return fail("unterminated CDATA");
      i = e + 3;
      continue;
    }
    if (xml.startsWith("<!DOCTYPE", i)) {
      const e = xml.indexOf(">", i);
      if (e === -1 || roots) return fail("bad doctype");
      i = e + 1;
      continue;
    }
    if (xml[i + 1] === "/") {
      const m = xml.slice(i + 2).match(NAME);
      if (!m) return fail("bad closing tag");
      const name = m[0];
      let j = i + 2 + name.length;
      while (/\s/.test(xml[j] ?? "")) j++;
      if (xml[j] !== ">") return fail(`bad closing tag </${name}`);
      if (stack.pop() !== name) return fail(`mismatched closing tag </${name}>`);
      i = j + 1;
      continue;
    }
    const m = xml.slice(i + 1).match(NAME);
    if (!m) return fail("bad tag name");
    const name = m[0];
    let j = i + 1 + name.length;
    const seen = new Set<string>();
    for (;;) {
      const ws = j;
      while (/\s/.test(xml[j] ?? "")) j++;
      if (xml[j] === ">" || (xml[j] === "/" && xml[j + 1] === ">")) break;
      if (j === ws) return fail(`expected whitespace in <${name}>`);
      const am = xml.slice(j).match(NAME);
      if (!am) return fail(`bad attribute in <${name}>`);
      if (seen.has(am[0])) return fail(`duplicate attribute ${am[0]}`);
      seen.add(am[0]);
      j += am[0].length;
      while (/\s/.test(xml[j] ?? "")) j++;
      if (xml[j] !== "=") return fail(`attribute ${am[0]} has no value`);
      j++;
      while (/\s/.test(xml[j] ?? "")) j++;
      const q = xml[j];
      if (q !== '"' && q !== "'") return fail(`unquoted attribute ${am[0]}`);
      const close = xml.indexOf(q, j + 1);
      if (close === -1) return fail("unterminated attribute value");
      const val = xml.slice(j + 1, close);
      if (val.includes("<")) return fail("'<' in attribute value");
      const save = i;
      i = j + 1;
      if (!text(close)) return fail("bad entity in attribute");
      i = save;
      j = close + 1;
    }
    if (!stack.length) {
      roots++;
      if (roots > 1) return fail("more than one root element");
    }
    if (xml[j] === "/") i = j + 2;
    else {
      stack.push(name);
      i = j + 1;
    }
  }
  if (stack.length) return { ok: false, error: `unclosed <${stack[stack.length - 1]}>`, at: xml.length };
  if (!roots) return { ok: false, error: "no root element", at: 0 };
  return { ok: true };
}
