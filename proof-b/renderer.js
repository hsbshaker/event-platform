// Phase B primitive renderer (throwaway, config-driven). One render function per primitive and semantic node.
// Reads a ResolvedDesignSpec: canonical composition + layout map + designIntent + pageSystem + content.
// No CSS text is derived from the tree: every value is a class or a numeric custom property from spec.layout.
(function (root) {
  const NAVY = "#172A44", CREAM = "#F4EDE1", FOREST = "#314B3C";
  const TONES = {
    light: { base: CREAM, alt: "#E9E0CC", contrast: NAVY, contrastText: CREAM, text: "#17211C", accBase: FOREST, accBaseFg: CREAM, accContrast: CREAM, accContrastFg: NAVY, error: "#8E3B33" },
    dark:  { base: NAVY, alt: "#1F3654", contrast: CREAM, contrastText: "#17211C", text: CREAM, accBase: CREAM, accBaseFg: NAVY, accContrast: FOREST, accContrastFg: CREAM, error: "#E8A79F" },
    mid:   { base: "#2E4638", alt: "#3A5646", contrast: CREAM, contrastText: "#17211C", text: CREAM, accBase: CREAM, accBaseFg: FOREST, accContrast: FOREST, accContrastFg: CREAM, error: "#E8A79F" },
  };
  const HIER = { restrained: { d: "clamp(2rem,4.6vw,3.4rem)", h2: "clamp(1.5rem,2.4vw,2.1rem)" }, editorial: { d: "clamp(2.6rem,6.6vw,5.2rem)", h2: "clamp(1.8rem,3.2vw,2.8rem)" }, dramatic: { d: "clamp(3.2rem,8.6vw,7rem)", h2: "clamp(2rem,4vw,3.4rem)" }, monumental: { d: "clamp(3.8rem,11vw,9.5rem)", h2: "clamp(2.2rem,4.8vw,4.2rem)" } };
  const DENS = { compact: { m: 44, d: 64 }, balanced: { m: 64, d: 96 }, spacious: { m: 88, d: 128 } };
  const BORDER = {
    none:     w => ({ rule: "0", strong: "0", outline: "0", field: "0", fieldB: "1px solid color-mix(in srgb,currentColor 45%,transparent)" }),
    hairline: w => ({ rule: `${w}px solid color-mix(in srgb,currentColor 30%,transparent)`, strong: `${w + 1}px solid currentColor`, outline: "0", field: `1px solid color-mix(in srgb,currentColor 40%,transparent)`, fieldB: null }),
    double:   w => ({ rule: `${w}px solid color-mix(in srgb,currentColor 55%,transparent)`, strong: `3px double currentColor`, outline: `1px solid color-mix(in srgb,currentColor 35%,transparent)`, field: `1px solid color-mix(in srgb,currentColor 50%,transparent)`, fieldB: null }),
    accented: w => ({ rule: `${w}px solid color-mix(in srgb,currentColor 30%,transparent)`, strong: `${w * 2}px solid var(--acc)`, outline: "0", field: "0", fieldB: `2px solid currentColor` }),
  };
  const CARD = { flat: { bg: "color-mix(in srgb,currentColor 6%,transparent)", border: "0", outline: "0" }, outlined: { bg: "transparent", border: "var(--rule)", outline: "0" }, tinted: { bg: "color-mix(in srgb,var(--acc) 12%,transparent)", border: "0", outline: "0" }, plate: { bg: "transparent", border: "var(--rule)", outline: "1px solid color-mix(in srgb,currentColor 35%,transparent)" } };
  const BTN = { solid_square: { bg: "var(--acc)", fg: "var(--acc-fg)", border: "1px solid var(--acc)", radius: "0", tr: ".08em", tf: "uppercase", size: ".78rem" }, solid_rounded: { bg: "var(--acc)", fg: "var(--acc-fg)", border: "1px solid var(--acc)", radius: "8px", tr: "0", tf: "none", size: ".95rem" }, outline_square: { bg: "transparent", fg: "inherit", border: "1.5px solid currentColor", radius: "0", tr: ".06em", tf: "uppercase", size: ".8rem" }, underline: { bg: "transparent", fg: "inherit", border: "0", radius: "0", tr: ".12em", tf: "uppercase", size: ".78rem" } };
  const cm = o => `color-mix(in srgb,currentColor ${Math.round(o * 100)}%,transparent)`;
  const PATTERN = {
    plaid: (s, o) => `repeating-linear-gradient(0deg,${cm(o * .55)} 0 1px,transparent 1px ${24 * s}px),repeating-linear-gradient(90deg,${cm(o * .55)} 0 1px,transparent 1px ${24 * s}px),repeating-linear-gradient(0deg,transparent 0 ${94 * s}px,${cm(o)} ${94 * s}px ${98 * s}px,transparent ${98 * s}px ${120 * s}px),repeating-linear-gradient(90deg,transparent 0 ${94 * s}px,${cm(o)} ${94 * s}px ${98 * s}px,transparent ${98 * s}px ${120 * s}px)`,
    stripe: (s, o) => `repeating-linear-gradient(0deg,${cm(o)} 0 ${5 * s}px,transparent ${5 * s}px ${14 * s}px)`,
    gingham: (s, o) => `repeating-linear-gradient(0deg,${cm(o * .5)} 0 ${18 * s}px,transparent ${18 * s}px ${36 * s}px),repeating-linear-gradient(90deg,${cm(o * .5)} 0 ${18 * s}px,transparent ${18 * s}px ${36 * s}px)`,
    linen: (s, o) => `repeating-linear-gradient(0deg,${cm(o * .6)} 0 1px,transparent 1px ${3 * s}px),repeating-linear-gradient(90deg,${cm(o * .35)} 0 1px,transparent 1px ${4 * s}px)`,
  };
  const GLYPH = {
    equestrian: [`<path d="M6 22a10 10 0 1 1 20 0v6h-4v-6a6 6 0 1 0-12 0v6H6z"/>`, `<circle cx="16" cy="16" r="10"/><path d="M2 16h28"/>`],
    botanical: [`<path d="M16 30V4M16 12c-5 0-9-3-10-7 5 0 9 3 10 7zM16 20c5 0 9-3 10-7-5 0-9 3-10 7zM16 26c-5 0-9-3-10-7 5 0 9 3 10 7z"/>`],
    celestial: [`<path d="M16 2l3 11 11 3-11 3-3 11-3-11-11-3 11-3z"/>`, `<circle cx="16" cy="16" r="3"/>`],
  };
  const glyph = (id0, size, i = 0, rot = 0) => { const id = GLYPH[id0] ? id0 : "celestial"; return `<svg width="${size}" height="${size}" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6" style="transform:rotate(${rot}deg)">${GLYPH[id][i % GLYPH[id].length]}</svg>`; };
  function arrangement(id, role, scale, seed) {
    let r = seed; const rnd = () => { r = (r * 1103515245 + 12345) & 0x7fffffff; return r / 0x7fffffff; }; const base = 26 * scale;
    if (role === "accent") return `<span class="glyphs">${glyph(id, base, 0, Math.round(rnd() * 20 - 10))}${rnd() > .5 ? glyph(id, base * .7, 1, Math.round(rnd() * 30 - 15)) : ""}</span>`;
    const n = 3 + Math.floor(rnd() * 2); let s = ""; for (let i = 0; i < n; i++) s += glyph(id, base * .75, i, Math.round(rnd() * 40 - 20)); return `<span class="glyphs">${s}</span>`;
  }
  const pattern = (motif, opacity, scale) => motif && PATTERN[motif.id] ? PATTERN[motif.id](scale, opacity) : PATTERN.linen(1, .12);
  const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

  // ---------- shared semantic components (identical DOM everywhere) ----------
  function rsvpForm() { return `<form class="rsvp-form" onsubmit="return false">
  <div class="blk span err"><label class="fld"><span>Guest name</span><input value="Sam"></label><div class="err-msg">We found more than one invitation. Enter a last name too.</div><div class="muted small">Possible matches: Samir &amp; Layla · Sami &amp; Noor</div></div>
  <div class="blk span"><div class="kicker">Text verification</div><div class="otp"><span>4</span><span>1</span><span>7</span><span>•</span><span>•</span><span>•</span></div></div>
  <div class="blk"><div class="kicker">Your party · Marissa &amp; Eren</div><label class="choice"><input type="checkbox" checked><span><b>Marissa</b><br><span class="muted">Attending</span></span></label><label class="choice"><input type="checkbox" checked><span><b>Eren</b><br><span class="muted">Attending</span></span></label></div>
  <div class="blk"><div class="kicker">Meal preference</div><div class="two"><label class="choice"><input type="radio" checked><span>Chicken</span></label><label class="choice"><input type="radio"><span>Vegetarian</span></label></div><label class="fld"><span>Any dietary restrictions?</span><textarea placeholder="Optional"></textarea></label></div>
  <div class="blk span err"><label class="fld"><span>What song should we add to the playlist?</span><input placeholder="Your answer"></label><div class="err-msg">Please answer this question before submitting.</div></div>
  <div class="blk span"><a class="btn">Submit RSVP</a></div></form>`; }
  const ITEM = {
    gift: (f) => `<div class="card item ${f ? "featured" : ""}"><div class="thumb">gift</div><div class="body"><div class="kicker">Native gift</div><h3>Natural oak activity gym</h3><p class="muted">$89 · 1 requested</p><a class="btn">Buy this gift</a></div></div>`,
    external: () => `<div class="card item"><div class="thumb">A</div><div class="body"><div class="kicker">External registry</div><h3>Amazon Baby Registry</h3><p class="muted">Shop the full registry on Amazon.</p><a class="btn">Shop registry</a></div></div>`,
    cashfund: () => `<div class="card item"><div class="thumb">$</div><div class="body"><div class="kicker">Cash fund</div><h3>Nursery fund</h3><p class="muted">Venmo @haseeb · $25 · $50 · $100</p><a class="btn">Send a gift</a></div></div>`,
  };
  const returnPrompt = () => `<div class="return"><b>Did you buy this gift?</b><a class="btn">Yes, mark purchased</a><a class="btn ghost">No</a></div>`;
  const HEADING = { details: "Join us at the lodge.", rsvp: "Will you be there?", registry: "A few things we love." };

  // ---------- node renderers ----------
  function render(spec, opts) {
    const { composition: tree, layout, designIntent: di, pageSystem: ps, content: D, seed = 1 } = spec;
    const L = id => layout[id] || {};
    let glyphSeed = seed * 7919;
    const R = {
      Stack: n => `<div class="p-stack ${n.align ? "al-" + n.align : ""}" data-id="${n.id}" style="--gap:${L(n.id).gapPx}px">${n.children.map(N).join("")}</div>`,
      Cluster: n => `<div class="p-cluster j-${n.justify}" data-id="${n.id}" style="--gap:${L(n.id).gapPx}px">${n.children.map(N).join("")}</div>`,
      Split: n => `<div class="p-split m-${n.mobile} al-${n.align} div-${n.divider || "none"}" data-id="${n.id}" style="--cols:${L(n.id).first}fr ${100 - L(n.id).first}fr;--mcols:${n.mobile === "keep" ? Math.max(38, Math.min(62, L(n.id).first)) + "fr " + (100 - Math.max(38, Math.min(62, L(n.id).first))) + "fr" : "1fr"}">${n.children.map(N).join("")}</div>`,
      Rail: n => `<div class="p-rail side-${n.side} w-${n.width} m-${n.mobile}" data-id="${n.id}" style="--rail-w:${L(n.id).widthPx}px"><div class="rail">${N(n.rail)}</div><div class="main">${N(n.child)}</div></div>`,
      Grid: n => `<div class="p-grid ${n.ruled ? "ruled" : ""}" data-id="${n.id}" style="--cols:${n.columns};--mcols:${n.mobile};--gap:${L(n.id).gapPx}px">${n.children.map(N).join("")}</div>`,
      Cell: n => `<div class="p-cell" data-id="${n.id}" style="--span:${n.span};--rspan:${n.rowSpan}">${N(n.child)}</div>`,
      Frame: n => `<div class="p-frame" data-id="${n.id}" style="--inset:${L(n.id).insetPx}px;background:${n.motif ? pattern(n.motif, .22, 1.5) : "transparent"}"><div class="frame-box rule-${n.rule}">${N(n.child)}</div></div>`,
      Surface: n => `<div class="p-surface surf-${n.role}" data-id="${n.id}" style="--inset:${L(n.id).insetPx}px">${N(n.child)}</div>`,
      Overlay: n => `<div class="p-overlay anchor-${n.anchor} ext-${n.extent} m-${n.mobile}" data-id="${n.id}"><div class="ov-content">${N(n.content)}</div><div class="ov-deco">${N(n.decoration)}</div></div>`,
      MotifField: n => `<div class="p-field ext-${n.extent}" data-id="${n.id}" style="background:${pattern(n.motif, .16, 1.5)}"></div>`,
      MotifBand: n => `<div class="p-band ${n.fill === "accent" ? "accent" : ""}" data-id="${n.id}" style="height:${L(n.id).heightPx}px;${n.fill === "accent" ? "" : "background:" + pattern(n.motif, .22, 2)}"></div>`,
      Rule: n => n.orientation === "v" ? `<div class="p-rule v w-${n.weight}" data-id="${n.id}"></div>` : n.glyphs ? `<div class="p-divider w-${n.weight}" data-id="${n.id}">${arrangement(n.glyphs, "divider", 1, glyphSeed++)}</div>` : `<div class="p-rule w-${n.weight}" data-id="${n.id}"></div>`,
      Glyph: n => `<div class="p-glyph" data-id="${n.id}">${arrangement(n.motif, "accent", { s: .75, m: 1, l: 1.5 }[n.scale], glyphSeed++)}</div>`,
      Monogram: n => `<div class="p-mono st-${n.style}" data-id="${n.id}"><span>${esc(D.initial)}</span></div>`,
      EventTitle: n => { const words = D.title.split(" "); const lines = n.layout === "block" ? null : [words.slice(0, 2).join(" "), words.slice(2, 4).join(" "), words.slice(4).join(" ")].filter(Boolean); return `<h1 class="p-text t-EventTitle em-${n.emphasis} case-${n.case} lay-${n.layout}" data-id="${n.id}" data-t="text">${lines ? lines.map(l => `<span class="line">${esc(l)}</span>`).join("") : esc(D.title)}</h1>`; },
      Date: n => { const txt = n.form === "numeral" ? D.dayNumeral : n.form === "month-year" ? `${D.monthShort} ${D.year}` : n.form === "weekday" ? D.weekday : D.date; return `<div class="p-text t-Date form-${n.form} em-${n.emphasis}" data-id="${n.id}" data-t="text">${esc(txt)}</div>`; },
      CTA: n => `<div class="p-cta" data-id="${n.id}"><a class="${n.style === "link" ? "link" : "btn"}">${n.target === "rsvp" ? "RSVP" : "Registry"}</a></div>`,
      SectionHeading: n => `<h2 class="p-text t-Heading em-${n.emphasis}" data-id="${n.id}" data-t="text">${HEADING[n.for]}</h2>`,
      RSVP: n => `<div class="p-rsvp" data-id="${n.id}">${rsvpForm()}</div>`,
      Registry: n => `<div class="p-registry ${n.layout.t === "Stack" ? "list" : ""}" data-id="${n.id}">${N(n.layout)}${returnPrompt()}</div>`,
      RegistryItem: n => `<div class="p-item" data-id="${n.id}">${ITEM[n.kind](n.emphasis === "featured")}</div>`,
      CashFund: n => `<div class="p-item standalone" data-id="${n.id}">${ITEM.cashfund()}</div>`,
    };
    const TEXT = { Eyebrow: "eyebrow", Hosts: "hosts", Description: "description", Deadline: "deadline", Venue: "venue", Location: "location", Time: "time" };
    function N(n) {
      if (R[n.t]) return R[n.t](n);
      if (TEXT[n.t]) return `<div class="p-text t-${n.t} em-${n.emphasis} case-${n.case || "none"}" data-id="${n.id}" data-t="text">${esc(D[TEXT[n.t]])}</div>`;
      return `<!-- ${n.t} -->`;
    }
    const secs = tree.sections.map(s => `<section class="sec kind-${s.kind} surf-${s.surface} al-${s.align} fill-${s.fill}" data-id="${s.id}">${s.kind === "band" ? N(s.root) : `<div class="inner">${N(s.root)}</div>`}</section>`).join("");
    return `<div class="site fam-${di.family} hier-${di.composition.hierarchy} tone-${di.tonalDirection} btn-${ps.button}" style="${vars(spec, opts)}">${secs}<footer class="sec surf-${tree.sections[tree.sections.length - 1].surface} footer">Made with Cordially</footer></div>`;
  }
  function vars(spec, { w, vh }) {
    const { designIntent: di, pageSystem: ps } = spec; const t = TONES[di.tonalDirection], h = HIER[di.composition.hierarchy], d = DENS[di.density];
    const b = BORDER[ps.border](ps.borderWeight || 1), c = CARD[ps.card], bt = BTN[ps.button], ty = spec.typography;
    return `--t-base:${t.base};--t-alt:${t.alt};--t-contrast:${t.contrast};--t-contrast-text:${t.contrastText};--t-text:${t.text};--t-error:${t.error};--t-acc-base:${t.accBase};--t-acc-base-fg:${t.accBaseFg};--t-acc-contrast:${t.accContrast};--t-acc-contrast-fg:${t.accContrastFg};
      --display:'${ty.display}',Georgia,serif;--body:'${ty.body}',Arial,sans-serif;--display-weight:${ty.category === "grotesk_led" ? 800 : 600};--display-weight-heavy:${ty.category === "grotesk_led" ? 900 : 700};
      --display-size:${h.d};--h2-size:${h.h2};--tracking:${ps.displayTracking || 0}em;--pad-y:${w <= 700 ? d.m : d.d}px;--measure:62ch;
      --hero-h:${Math.round((w <= 700 ? .72 : .8) * vh)}px;--rule-w:${ps.borderWeight || 1}px;--rule:${b.rule};--rule-strong:${b.strong};--rule-outline:${b.outline};--field-border:${b.field};--field-border-b:${b.fieldB || b.field};
      --card-bg:${c.bg};--card-border:${c.border};--card-outline:${c.outline};--btn-bg:${bt.bg};--btn-fg:${bt.fg};--btn-border:${bt.border};--btn-radius:${bt.radius};--btn-tracking:${bt.tr};--btn-transform:${bt.tf};--btn-size:${bt.size};--pattern-linen:${PATTERN.linen(1, .16)};`;
  }
  // ---------- geometry measurement (content fit is verified against this, not estimated) ----------
  function measure(vpWidth, mode) {
    const vp = document.querySelector(".vp") || document.documentElement;
    const out = { mode, vpWidth, pageOverflow: vp.scrollWidth > vp.clientWidth + 1, texts: [], overflowing: [] };
    for (const el of document.querySelectorAll("[data-t=text]")) {
      const cs = getComputedStyle(el); if (cs.writingMode.startsWith("vertical") || el.closest(".ov-deco")) continue; /* rotated rail labels cannot be measured by width; decorations are clipped watermarks by rule */ const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2; const r = el.getBoundingClientRect();
      const lines = Math.max(1, Math.round(r.height / lh)); const pr = el.parentElement.getBoundingClientRect();
      const overflow = el.scrollWidth > el.clientWidth + 2 || r.right > pr.right + 2 || r.left < pr.left - 2;   // wider than itself, or wider than its container
      out.texts.push({ id: el.dataset.id, cls: el.className, lines, overflow, fontPx: parseFloat(cs.fontSize) });
    }
    for (const el of document.querySelectorAll(".site *")) { const cs = getComputedStyle(el); if (cs.writingMode.startsWith("vertical") || el.closest(".rail") && getComputedStyle(el.closest(".rail")).writingMode.startsWith("vertical")) continue; if (el.classList.contains("glyphs") || el.closest(".glyphs")) { if (el.classList.contains("glyphs")) { const gr = el.getBoundingClientRect(), pr = el.parentElement.getBoundingClientRect(); if (gr.right > pr.right + 2 || gr.left < pr.left - 2) out.overflowing.push("glyphs:" + (el.closest("[data-id]") || {}).dataset?.id); } continue; }
      if (el.scrollWidth > el.clientWidth + 2 && cs.overflowX !== "hidden" && !el.closest("[data-t=text]") && !el.closest(".rail") && !el.closest(".ov-deco")) { out.overflowing.push(el.dataset.id || el.className); if (out.overflowing.length > 8) break; } }
    // rails clip; report a rail child that would be clipped as an overflow of the rail
    for (const rail of document.querySelectorAll(".p-rail .rail")) { const rr = rail.getBoundingClientRect(); for (const ch of rail.querySelectorAll("[data-t=text]")) { const cr = ch.getBoundingClientRect(); if (cr.right > rr.right + 2 || cr.left < rr.left - 2) { out.overflowing.push("rail-clip:" + ch.dataset.id); break; } } }
    const hero = document.querySelector(".kind-hero"); out.heroHeight = hero ? hero.getBoundingClientRect().height : 0;
    const hr = document.querySelector(".kind-hero .inner > *"); if (hr) { const cs = getComputedStyle(hr); out.heroRoot = { cls: hr.className, height: hr.getBoundingClientRect().height, minHeight: cs.minHeight, display: cs.display }; }
    return out;
  }
  root.Renderer = { render, measure, TONES, PATTERN };
})(window);
