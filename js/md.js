/* Markdown pour les notes : titres, gras, italique, code, citations, listes,
   cases à cocher, liens, séparateurs. Le texte est échappé avant toute mise
   en forme, et un lien n'accepte que http(s) et mailto : une note ne peut pas
   injecter de HTML ni de script. */

import { esc } from "./util.js";

function inline(s) {
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (m, c) => { codes.push(c); return "\u0000" + (codes.length - 1) + "\u0000"; });
  s = s.replace(/\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^\s)]+)\)/g, (m, t, u) => '<a href="' + u + '" target="_blank" rel="noopener noreferrer">' + t + "</a>");
  s = s.replace(/(^|[\s(])((?:https?:\/\/)[^\s<)]+)/g, (m, sp, u) => sp + '<a href="' + u + '" target="_blank" rel="noopener noreferrer">' + u + "</a>");
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
  s = s.replace(/~~([^~]+)~~/g, "<del>$1</del>");
  s = s.replace(/\u0000(\d+)\u0000/g, (m, i) => "<code>" + codes[+i] + "</code>");
  return s;
}

export function renderMarkdown(src) {
  const lines = esc(String(src || "")).replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let list = null, para = [], quote = [], code = null;
  const flushPara = () => { if (para.length) { out.push("<p>" + inline(para.join("<br>")) + "</p>"); para = []; } };
  const flushList = () => { if (list) { out.push("<" + list.tag + ">" + list.items.join("") + "</" + list.tag + ">"); list = null; } };
  const flushQuote = () => { if (quote.length) { out.push("<blockquote>" + inline(quote.join("<br>")) + "</blockquote>"); quote = []; } };
  const flushAll = () => { flushPara(); flushList(); flushQuote(); };

  lines.forEach((ln, i) => {
    if (code) {
      if (/^```/.test(ln)) { out.push("<pre><code>" + code.join("\n") + "</code></pre>"); code = null; }
      else code.push(ln);
      return;
    }
    if (/^```/.test(ln)) { flushAll(); code = []; return; }
    let m;
    if ((m = /^(#{1,3})\s+(.*)$/.exec(ln))) { flushAll(); const n = m[1].length + 2; out.push("<h" + n + ">" + inline(m[2]) + "</h" + n + ">"); return; }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(ln)) { flushAll(); out.push("<hr>"); return; }
    if ((m = /^&gt;\s?(.*)$/.exec(ln))) { flushPara(); flushList(); quote.push(m[1]); return; }
    if ((m = /^\s*[-*]\s+\[( |x|X)\]\s+(.*)$/.exec(ln))) {
      flushPara(); flushQuote();
      if (!list || list.tag !== "ul") { flushList(); list = { tag: "ul", items: [] }; }
      const on = m[1] !== " ";
      list.items.push('<li class="task' + (on ? " on" : "") + '"><span class="box" data-line="' + i + '" role="checkbox" aria-checked="' + on + '"></span>' + inline(m[2]) + "</li>");
      return;
    }
    if ((m = /^\s*[-*]\s+(.*)$/.exec(ln))) {
      flushPara(); flushQuote();
      if (!list || list.tag !== "ul") { flushList(); list = { tag: "ul", items: [] }; }
      list.items.push("<li>" + inline(m[1]) + "</li>"); return;
    }
    if ((m = /^\s*\d+[.)]\s+(.*)$/.exec(ln))) {
      flushPara(); flushQuote();
      if (!list || list.tag !== "ol") { flushList(); list = { tag: "ol", items: [] }; }
      list.items.push("<li>" + inline(m[1]) + "</li>"); return;
    }
    if (!ln.trim()) { flushAll(); return; }
    flushList(); flushQuote();
    para.push(ln);
  });
  if (code) out.push("<pre><code>" + code.join("\n") + "</code></pre>");
  flushAll();
  return out.join("");
}

/* Cocher une case dans l'aperçu modifie la ligne correspondante du texte. */
export function toggleTaskLine(src, line) {
  const lines = String(src || "").replace(/\r\n?/g, "\n").split("\n");
  if (!lines[line]) return src;
  lines[line] = lines[line].replace(/\[( |x|X)\]/, (m, c) => (c === " " ? "[x]" : "[ ]"));
  return lines.join("\n");
}
