#!/usr/bin/env python3
"""Draws the README's animated mockups: docs/cockpit-dock.svg and docs/cockpit-band.svg.

A mockup, not a capture: the panel as the mod draws it, on a character grid,
with gauges and frames drawn as shapes, and CSS animations standing in for the
mod's own (spinners, the sweep on the running step, the live flow, the clock).
GitHub renders an SVG's CSS animations in a README, scripts never.

    python3 docs/make_demo.py
"""

from __future__ import annotations

import math
from pathlib import Path
from xml.sax.saxutils import escape


def fit(text: str, width: float) -> str:
    """Cut to `width` cells with an ellipsis, as the mod's `truncate-end`."""
    n = int(width)
    return text if len(text) <= n else text[: max(1, n - 1)] + '…'

HERE = Path(__file__).resolve().parent

# ── The grid and the palette ────────────────────────────────────────────────
CW = 8.4  # one cell across, at 14 px: monospace advance is 0.6 em
LH = 19.0  # one row down
FS = 14
FONT = "'JetBrains Mono','Cascadia Mono','SF Mono',Menlo,Consolas,'DejaVu Sans Mono',monospace"

BG = '#0F1117'
BAR = '#1A1D25'
EDGE = '#262A33'
TX = '#D7DEE9'
WH = '#F4F1E7'
DM = '#7D8799'
FA = '#3A4356'
ACC = '#6FD3D8'  # cyan, the mockup's blue
ACC2 = '#86A2D6'  # blue
OK = '#8FC7A8'
WARN = '#F6B12A'
HOT = '#F5837C'
INK = '#0F1117'

SPIN = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'


class Svg:
    def __init__(self, ox: float, oy: float):
        self.ox, self.oy = ox, oy
        self.out: list[str] = []
        self.uid = 0

    def x(self, col: float) -> float:
        return round(self.ox + col * CW, 2)

    def y(self, row: float) -> float:
        return round(self.oy + row * LH, 2)

    def text(self, col: float, row: float, s: str, color: str = TX, bold: bool = False, cls: str = '', anchor: str = 'start', size: int = FS):
        weight = ' font-weight="700"' if bold else ''
        klass = f' class="{cls}"' if cls else ''
        a = '' if anchor == 'start' else f' text-anchor="{anchor}"'
        fs = '' if size == FS else f' font-size="{size}"'
        self.out.append(f'<text x="{self.x(col)}" y="{self.y(row) + 14}" fill="{color}"{weight}{klass}{a}{fs}>{escape(s)}</text>')

    def right(self, col: float, row: float, s: str, color: str = TX, bold: bool = False):
        """Ends at `col`: the mod's right-aligned figures."""
        self.text(col, row, s, color, bold, anchor='end')

    def runs(self, col: float, row: float, parts: list[tuple[str, str] | tuple[str, str, bool]]):
        """Consecutive runs on one row, each placed on the grid by its length."""
        c = col
        for p in parts:
            s, color = p[0], p[1]
            bold = len(p) > 2 and p[2]
            if s.strip():
                self.text(c, row, s, color, bold)
            c += len(s)

    def runs_right(self, end: float, row: float, parts: list):
        """Runs that end at `end`: the mod's right-hand figures, several colors."""
        self.runs(end - len(''.join(p[0] for p in parts)), row, parts)

    def play(self, col: float, row: float, color: str):
        """The mode's `⏵⏵`, drawn: fonts rarely have the glyph."""
        x, y = self.x(col) + 1, self.y(row) + 5
        for k in range(2):
            dx = x + k * 6.5
            self.out.append(f'<path d="M{dx} {y} L{dx + 6} {y + 4.5} L{dx} {y + 9} Z" fill="{color}"/>')

    def rect(self, col: float, row: float, w: float, h: float, fill: str, rx: float = 0, cls: str = '', extra: str = ''):
        klass = f' class="{cls}"' if cls else ''
        self.out.append(f'<rect x="{self.x(col)}" y="{self.y(row)}" width="{round(w * CW, 2)}" height="{round(h * LH, 2)}" rx="{rx}" fill="{fill}"{klass}{extra}/>')

    def frame(self, col: float, row: float, w: float, h: float, color: str = FA, width: float = 1.2):
        """A rounded frame around `w` × `h` cells: the mod's `borderStyle="round"`."""
        self.out.append(
            f'<rect x="{self.x(col) + 3}" y="{self.y(row) + 5}" width="{round(w * CW - 6, 2)}" height="{round(h * LH - 10, 2)}" '
            f'rx="7" fill="none" stroke="{color}" stroke-width="{width}"/>'
        )

    def line(self, col: float, row: float, w: float, color: str, thick: float = 2.2, cls: str = ''):
        """A rule across `w` cells, mid-row: the mod's `━` runs."""
        klass = f' class="{cls}"' if cls else ''
        y = self.y(row) + LH / 2
        self.out.append(f'<line x1="{self.x(col)}" y1="{y}" x2="{self.x(col + w)}" y2="{y}" stroke="{color}" stroke-width="{thick}" stroke-linecap="round"{klass}/>')

    def spinner(self, col: float, row: float, color: str = ACC, period: float = 1.0, phase: float = 0.0):
        """The mod's braille spinner: one frame shown at a time, by CSS."""
        n = len(SPIN)
        for i, ch in enumerate(SPIN):
            delay = round(-period + (i / n) * period - phase, 3)
            self.out.append(
                f'<text x="{self.x(col)}" y="{self.y(row) + 14}" fill="{color}" font-weight="700" class="frame" '
                f'style="animation-duration:{period}s;animation-delay:{delay}s">{ch}</text>'
            )

    def digits(self, col: float, row: float, period: float, color: str, offset: int = 0, count: int = 10):
        """A digit that counts: `count` frames over `period` seconds."""
        for i in range(count):
            delay = round(-period + (i / count) * period - offset * period / count, 3)
            self.out.append(
                f'<text x="{self.x(col)}" y="{self.y(row) + 14}" fill="{color}" class="frame" '
                f'style="animation-duration:{period}s;animation-delay:{delay}s;--f:{1 / count * 100:.3f}%">{i}</text>'
            )

    def gauge(self, col: float, row: float, w: float, pct: float, color: str, shimmer: bool = True):
        """A gauge as the mod draws it: the filled part, then a light-shaded track."""
        self.rect(col, row + 0.22, w, 0.56, FA, rx=2, extra=' opacity="0.55"')
        filled = w * pct / 100
        self.uid += 1
        cid = f'g{self.uid}'
        self.out.append(f'<clipPath id="{cid}"><rect x="{self.x(col)}" y="{self.y(row + 0.22)}" width="{round(filled * CW, 2)}" height="{round(0.56 * LH, 2)}" rx="2"/></clipPath>')
        self.rect(col, row + 0.22, filled, 0.56, color, rx=2)
        if shimmer:
            self.out.append(
                f'<g clip-path="url(#{cid})"><rect x="{self.x(col) - 60}" y="{self.y(row + 0.22)}" width="60" height="{round(0.56 * LH, 2)}" '
                f'fill="url(#shine)" class="sweep" style="--d:{round(filled * CW + 60, 1)}px"/></g>'
            )

    def svg(self, w: float, h: float, title: str) -> str:
        return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{round(w)}" height="{round(h)}" viewBox="0 0 {round(w)} {round(h)}" font-family="{FONT}" font-size="{FS}" role="img" aria-label="{escape(title)}">
<title>{escape(title)}</title>
<defs>
  <linearGradient id="shine" x1="0" x2="1" y1="0" y2="0">
    <stop offset="0" stop-color="#ffffff" stop-opacity="0"/>
    <stop offset="0.5" stop-color="#ffffff" stop-opacity="0.55"/>
    <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
  </linearGradient>
</defs>
<style>
  text {{ white-space: pre; }}
  .frame {{ opacity: 0; animation-name: frame; animation-timing-function: steps(1, end); animation-iteration-count: infinite; }}
  @keyframes frame {{ 0% {{ opacity: 1; }} 10% {{ opacity: 0; }} 100% {{ opacity: 0; }} }}
  .blink {{ animation: blink 1.1s steps(1, end) infinite; }}
  @keyframes blink {{ 0% {{ opacity: 1; }} 50% {{ opacity: 0.25; }} }}
  .cursor {{ animation: blink 1s steps(1, end) infinite; }}
  .sweep {{ animation: sweep 2.6s linear infinite; }}
  @keyframes sweep {{ from {{ transform: translateX(0); }} to {{ transform: translateX(var(--d)); }} }}
  .flow {{ transform-box: fill-box; transform-origin: 50% 100%; animation: flow 2.4s ease-in-out infinite alternate; }}
  @keyframes flow {{ from {{ transform: scaleY(0.35); }} to {{ transform: scaleY(1); }} }}
  .pulse {{ animation: pulse 1.6s ease-in-out infinite; }}
  @keyframes pulse {{ 0%, 100% {{ opacity: 1; }} 50% {{ opacity: 0.35; }} }}
  .spark {{ animation: spark 1.4s linear infinite; }}
  @keyframes spark {{ from {{ transform: translateX(0); }} to {{ transform: translateX(var(--d)); }} }}
  .grow {{ animation: grow 24s ease-in-out infinite alternate; transform-box: fill-box; transform-origin: 0 50%; }}
  @keyframes grow {{ from {{ transform: scaleX(0.9); }} to {{ transform: scaleX(1.06); }} }}
  @media (prefers-reduced-motion: reduce) {{ .sweep, .flow, .pulse, .spark, .grow, .blink, .cursor {{ animation: none; }} }}
</style>
<rect width="100%" height="100%" rx="12" fill="{BG}"/>
{chr(10).join(self.out)}
</svg>
'''


def chrome(s: Svg, w: float, title: str):
    """The window's title bar: three lights and the tab's name."""
    s.out.append(f'<rect x="0" y="0" width="{round(w)}" height="34" rx="12" fill="{BAR}"/>')
    s.out.append(f'<rect x="0" y="22" width="{round(w)}" height="12" fill="{BAR}"/>')
    s.out.append(f'<line x1="0" y1="34" x2="{round(w)}" y2="34" stroke="{EDGE}"/>')
    for i, c in enumerate(['#F5837C', '#F6B12A', '#8FC7A8']):
        s.out.append(f'<circle cx="{20 + i * 18}" cy="17" r="5.5" fill="{c}" opacity="0.85"/>')
    s.out.append(f'<text x="{round(w / 2)}" y="22" fill="{DM}" text-anchor="middle" font-size="12">{escape(title)}</text>')


# ── The transcript beside the panel ─────────────────────────────────────────

TRANSCRIPT = [
    [('> ', DM), ("Refonds l'intégration de paiement, plan d'abord.", TX)],
    [],
    [('● ', OK), ('cockpit - plan (MCP)', TX, True), ('(title: "Refonte de l\'API', DM)],
    [('  de paiement", steps: [7 étapes])', DM)],
    [('  ⎿ ', FA), ('Plan affiché : 7 étapes, ~1 h 55 estimées.', DM)],
    [],
    [('● ', OK), ('Read', TX, True), ('(src/billing/stripe_client.ts)', DM)],
    [('  ⎿ ', FA), ('Read 412 lines', DM)],
    [],
    [('● ', OK), ('Bash', TX, True), ('(npm run test:contract)', DM)],
    [('  ⎿ ', FA), ('42 passed, 0 failed', DM)],
    [],
    [('● ', OK), ('cockpit - step (MCP)', TX, True), ('(step: 3, status:', DM)],
    [('  "completed")', DM)],
    [],
    [('● ', TX), ('Le client Stripe est migré et les tests de', TX)],
    [('  contrat passent. J\'attaque les webhooks : le', TX)],
    [('  routeur actuel mélange vérification et', TX)],
    [('  dispatch, je les sépare.', TX)],
    [],
    [('● ', OK), ('cockpit - step (MCP)', TX, True), ('(step: 4, status:', DM)],
    [('  "in_progress", note: "réécrit le routeur', DM)],
    [('  des webhooks", estimate_min: 20)', DM)],
    [],
    [('● ', OK), ('Agent', TX, True), ('(revue du lot)', DM)],
    [('  ⎿ ', FA), ('Backgrounded agent', DM)],
    [],
    [('● ', OK), ('Bash', TX, True), ('(npm run test:e2e)', DM)],
    [('  ⎿ ', FA), ('Running in the background', DM)],
    [],
    [('● ', OK), ('Edit', TX, True), ('(src/billing/webhooks/router.ts)', DM)],
    [('  ⎿ ', FA), ('Updated with 38 additions and 21 removals', DM)],
    [],
    [('● ', OK), ('Edit', TX, True), ('(src/billing/webhooks/verify.ts)', DM)],
    [('  ⎿ ', FA), ('Updated with 54 additions', DM)],
    [],
    [('● ', TX), ('La vérification de signature vit maintenant à', TX)],
    [('  part ; le routeur ne fait plus que dispatcher.', TX)],
]


def transcript(s: Svg, col: float, row: float, rows: int, width: int):
    for i, line in enumerate(TRANSCRIPT[:rows - 4]):
        s.runs(col, row + i, line)
    # The thinking line and the prompt.
    r = row + rows - 4
    s.spinner(col, r, WARN, 1.2)
    s.runs(col + 2, r, [('Réécriture du routeur… ', WARN), ('(2 min · ↓ 3.1k tokens)', DM)])
    s.rect(col - 0.5, r + 1.4, width + 1, 0.06, EDGE)
    s.runs(col, r + 2, [('> ', TX)])
    s.rect(col + 2, r + 2.12, 0.9, 0.78, TX, cls='cursor')
    s.play(col, r + 3, WARN)
    s.runs(col + 3, r + 3, [('auto mode on', WARN), (' (shift+tab to cycle)', DM)])


# ── The side panel ──────────────────────────────────────────────────────────

def heading(s: Svg, col: float, row: float, w: int, title: str, right: list | None = None):
    label = ' '.join(title)
    s.line(col, row, 1.6, FA, 2)
    s.text(col + 3, row, label, DM, True)
    end = col + w - (len(''.join(p[0] for p in right)) + 2 if right else 0)
    s.line(col + 4 + len(label), row, max(1, end - (col + 4 + len(label))), FA, 2)
    if right:
        c = col + w - len(''.join(p[0] for p in right))
        s.runs(c, row, right)


def dock(s: Svg, col: float, row: float, cols: int):
    P = 2
    c0 = col + P
    W = cols - 2 * P
    r = row + 1

    # Header: the name, the clock, the live dot.
    s.text(c0, r, '◢◤ C O C K P I T', ACC, True)
    s.text(c0 + W - 16, r, '14:45:4', DM)
    s.digits(c0 + W - 9, r, 10, DM)
    s.text(c0 + W - 6, r, '●', ACC, cls='blink')
    s.text(c0 + W - 4, r, 'LIVE', ACC, True)
    r += 2

    heading(s, c0, r, W, 'CONFIGURATION')
    r += 2

    # Model and mode cards.
    mw = W - 20
    s.frame(c0, r, mw, 5)
    s.text(c0 + 2, r + 1, 'MODÈLE', DM, True)
    s.text(c0 + 2, r + 2, '◆ Opus 5.5', WH, True)
    s.text(c0 + 2, r + 3, 'claude-opus-5-5 · 1 M', DM)
    s.frame(c0 + mw + 1, r, 19, 5)
    s.text(c0 + mw + 3, r + 1, 'MODE', DM, True)
    s.rect(c0 + mw + 3, r + 2.08, 9, 0.84, WARN, rx=2)
    s.play(c0 + mw + 3.5, r + 2, INK)
    s.text(c0 + mw + 6.5, r + 2, 'auto', INK, True)
    s.text(c0 + mw + 3, r + 3, 'shift+tab', DM)
    r += 6

    # Effort.
    s.text(c0, r, 'EFFORT', DM, True)
    ec = c0 + W - 16.4
    for i in range(5):
        s.rect(ec + i * 1, r + 0.2, 0.62, 0.62, ACC if i < 3 else FA, rx=1)
    s.runs(ec + 5.4, r, [(' high', WH, True), (' / max', DM)])
    r += 2

    heading(s, c0, r, W, 'STATISTIQUES')
    r += 2

    # The session in three tiles: the tokens one carries sent and received.
    sw = min(16, (W - 2) // 3)
    s.frame(c0, r, sw, 5)
    s.text(c0 + 2, r + 1, 'DURÉE', DM, True)
    s.text(c0 + 2, r + 2, '2 h 14', WH, True)
    s.text(c0 + 2, r + 3, 'depuis 12:31', DM)
    s.frame(c0 + sw + 1, r, sw, 5)
    s.text(c0 + sw + 3, r + 1, 'COÛT ≈', DM, True)
    s.text(c0 + sw + 3, r + 2, '18,40 $', WARN, True)
    s.text(c0 + sw + 3, r + 3, 'au tarif API', DM)
    tx, tw = c0 + 2 * (sw + 1), W - 2 * sw - 2
    s.frame(tx, r, tw, 5)
    s.text(tx + 2, r + 1, 'TOKENS', DM, True)
    s.right(tx + tw - 2, r + 1, '642 req.', DM)
    s.text(tx + 2, r + 2, '21.7 M', ACC, True)
    s.runs(tx + 2, r + 3, [('↑', ACC), (' 21.4 M', WH), ('  ↓', WARN), (' 286 k', WH)])
    r += 6

    heading(s, c0, r, W, 'ACTIVITÉ')
    r += 2

    # The 5-hour window, its pace, the week.
    s.text(c0, r, 'SESSION · 5 H', DM, True)
    s.right(c0 + W, r, '57 %', ACC, True)
    s.gauge(c0, r + 1, W, 57, ACC)
    s.text(c0, r + 2, 'fin de fenêtre dans', DM)
    s.runs_right(c0 + W, r + 2, [('1 h 12', WH), (' · 15:10', DM)])
    s.text(c0, r + 3, 'au rythme actuel, à la fin de la fenêtre', DM)
    s.right(c0 + W, r + 3, '~78 %', WARN)
    r += 5

    s.text(c0, r, 'SEMAINE', DM, True)
    s.right(c0 + W, r, '31 %', ACC, True)
    s.gauge(c0, r + 1, W, 31, ACC)
    s.text(c0, r + 2, 'renouvellement dans', DM)
    s.runs_right(c0 + W, r + 2, [('2 j 4 h', WH), (' · lun. 19:00', DM)])
    r += 4

    # The context by category.
    s.text(c0, r, 'CONTEXTE', DM, True)
    s.runs_right(c0 + W, r, [('412 k', WH, True), (' / 1 M · ', DM), ('41 %', ACC, True)])
    y = r + 1
    s.rect(c0, y + 0.22, W, 0.56, FA, rx=2, extra=' opacity="0.55"')
    segs = [(0.03, ACC2, 1), (0.05, ACC2, 0.6), (0.33, ACC, 1)]
    c = c0
    for frac, color, op in segs:
        s.rect(c, y + 0.22, W * frac, 0.56, color, rx=1, extra=f' opacity="{op}"')
        c += W * frac
    s.rect(c0 + W * 0.83, y + 0.22, W * 0.17, 0.56, WARN, rx=1, extra=' opacity="0.28"')
    s.runs(c0, r + 2, [('■', ACC2), (' système 3 %  ', DM), ('■', ACC2), (' outils 5 %  ', DM), ('■', ACC), (' messages 33 %  ', DM), ('■', WARN), (' réserve', DM)])
    r += 4

    # The flow: output tokens per request.
    s.text(c0, r, 'DÉBIT', DM, True)
    heights = [0.3, 0.55, 0.4, 0.8, 0.35, 0.6, 0.95, 0.5, 0.7, 1.0]
    for i, h in enumerate(heights):
        bh = 0.8 * h
        delay = round((i * 0.37) % 2.4, 2)
        s.rect(c0 + 7 + i * 1, r + 0.92 - bh, 0.7, bh, ACC, rx=1, cls='flow', extra=f' style="animation-delay:-{delay}s"')
    s.runs_right(c0 + W, r, [('dernière réponse ', DM), ('↓', WARN), (' 3 k', WH)])
    r += 2

    # What the prompt cache served, said plainly.
    s.text(c0, r, 'CACHE', DM, True)
    s.runs_right(c0 + W, r, [('92 %', ACC, True), (' relus du cache, ≈ 10× moins chers', DM)])
    r += 2

    # Work left running.
    s.text(c0, r, 'EN FOND', DM, True)
    s.right(c0 + W, r, '1 agent · 1 commande', WH)
    s.spinner(c0, r + 1, ACC, 1.0)
    s.runs(c0 + 1, r + 1, [(' agent  ', DM), ('revue du lot', WH)])
    s.right(c0 + W, r + 1, '12 min', DM)
    s.spinner(c0, r + 2, ACC, 1.0, 0.45)
    s.runs(c0 + 1, r + 2, [(' shell  ', DM), ('npm run test:e2e', WH)])
    s.right(c0 + W, r + 2, '3 min', DM)
    r += 4

    # The plan.
    heading(s, c0, r, W, 'PLAN', [('3', ACC, True), (' / 7', DM)])
    r += 2
    s.text(c0, r, "Refonte de l'API de paiement", WH, True)
    s.runs(c0, r + 1, [('écoulé ', DM), ('1 h 10', WH), ('  ·  reste ≈ ', DM), ('46 min', ACC, True)])
    r += 2
    # The frieze: a node where each step began, ⚑ at the end, each step as long as it lasts.
    starts = ['13:35', '13:47', '14:18', '14:36', '~14:56', '~15:11', '~15:21']
    weights = [12, 31, 18, 20, 15, 10, 10]
    nodes = len(weights)
    room = W - nodes - 1
    floor = 6
    rest = room - floor * nodes
    exact = [w / sum(weights) * rest for w in weights]
    gaps = [floor + int(x) for x in exact]
    for i in sorted(range(nodes), key=lambda i: -(exact[i] - int(exact[i])))[: room - sum(gaps)]:
        gaps[i] += 1
    cols = []
    c = 0
    for g in gaps:
        cols.append(c)
        c += 1 + g
    for i, (col, g) in enumerate(zip(cols, gaps)):
        x = c0 + col
        cur = i == 3
        idc = ACC if cur else (OK if i < 3 else DM)
        s.text(x + (1 + g - 1) // 2, r, str(i + 1), idc, cur)
        start = x + 1.2
        span = g - 0.4
        if i < 3:
            s.line(start, r + 1, span, OK, 2.2)
        elif cur:
            s.line(start, r + 1, span * 0.45, ACC, 2.2)
            s.line(start + span * 0.45, r + 1, span * 0.55, FA, 2.2)
            s.out.append(f'<circle cx="{s.x(start + 0.1)}" cy="{s.y(r + 1) + LH / 2}" r="2.6" fill="{WH}" class="spark" style="--d:{round(span * 0.45 * CW, 1)}px"/>')
        else:
            s.line(start, r + 1, span, FA, 2.2)
        cx, cy = s.x(x + 0.5), s.y(r + 1) + LH / 2
        if i < 3:
            s.out.append(f'<circle cx="{cx}" cy="{cy}" r="4.6" fill="{OK}"/>')
        elif cur:
            s.out.append(f'<circle cx="{cx}" cy="{cy}" r="6" fill="none" stroke="{ACC}" stroke-width="2" class="pulse"/>')
            s.out.append(f'<circle cx="{cx}" cy="{cy}" r="2.8" fill="{ACC}"/>')
        else:
            s.out.append(f'<circle cx="{cx}" cy="{cy}" r="4" fill="none" stroke="{DM}" stroke-width="1.4"/>')
        hc = ACC if cur else (WH if i < 3 else DM)
        # An hour that would touch the end's gives way, as in the mod.
        if col + len(starts[i]) + 1 <= W - len('~15:31'):
            s.text(x, r + 2, starts[i], hc, cur)
    s.right(c0 + W, r, 'fin', DM)
    s.text(c0 + W - 1, r + 1, '⚑', ACC, True)
    s.right(c0 + W, r + 2, '~15:31', ACC, True)
    r += 4

    done = [
        ('1', 'Cartographier les appels', '12 min', '15 min', WH),
        ('2', 'Écrire les tests de contrat', '31 min', '25 min', HOT),
        ('3', 'Migrer le client Stripe', '18 min', '20 min', WH),
    ]
    for n, title, real, est, color in done:
        s.runs(c0, r, [('✓', OK), ('  ' + n + ' ', FA), (title, WH)])
        s.runs_right(c0 + W, r, [(real, color), (' / ' + est, DM)])
        r += 1

    # The running step's card.
    s.frame(c0, r, W, 6, ACC, 1.4)
    s.spinner(c0 + 2, r + 1, ACC, 1.0)
    s.runs(c0 + 4, r + 1, [('4', ACC, True), (' ', TX), ('Adapter les webhooks', WH, True)])
    s.runs_right(c0 + W - 2, r + 1, [('9 min', ACC, True), (' / ~20 min', DM)])
    bw = W - 12
    fill = bw * 0.45
    s.uid += 1
    cid = f'b{s.uid}'
    bx, by = s.x(c0 + 2), s.y(r + 2) + 5
    s.out.append(f'<rect x="{bx}" y="{by}" width="{round(bw * CW, 1)}" height="9" rx="2" fill="{FA}" opacity="0.6"/>')
    s.out.append(f'<clipPath id="{cid}"><rect x="{bx}" y="{by}" width="{round(fill * CW, 1)}" height="9" rx="2"/></clipPath>')
    s.out.append(f'<rect x="{bx}" y="{by}" width="{round(fill * CW, 1)}" height="9" rx="2" fill="{ACC}" class="grow"/>')
    s.out.append(f'<g clip-path="url(#{cid})"><rect x="{bx - 50}" y="{by}" width="50" height="9" fill="url(#shine)" class="sweep" style="--d:{round(fill * CW + 50, 1)}px"/></g>')
    s.text(c0 + 2 + bw + 2, r + 2, '45 %', ACC, True)
    s.runs(c0 + 2, r + 3, [('✓ ', ACC), ('lit le schéma des événements Stripe', DM)])
    s.runs(c0 + 2, r + 4, [('› ', ACC, True), ('réécrit le routeur des webhooks', WH)])
    r += 6.4

    todo = [('5', 'Rejouer les paiements de test', '~15 min'), ('6', 'Documenter la migration', '~10 min'), ('7', 'Relecture et commit', '~10 min')]
    for n, title, est in todo:
        s.runs(c0, r, [('○', DM), ('  ' + n + ' ', FA), (title, DM)])
        s.right(c0 + W, r, est, DM)
        r += 1
    r += 1

    return r + 3


def make_dock():
    left_cols, panel_cols = 54, 60
    rows = 68
    top = 34 + 10
    s = Svg(0, top)
    w = (left_cols + panel_cols + 6) * CW
    h = top + rows * LH + 8
    chrome(s, w, 'claude — ~/billing')
    transcript(s, 2, 1, rows - 1, left_cols - 2)
    sep = (left_cols + 1.5) * CW
    s.out.append(f'<line x1="{sep}" y1="34" x2="{sep}" y2="{h}" stroke="{EDGE}"/>')
    dock(s, left_cols + 2, 0, panel_cols)
    (HERE / 'cockpit-dock.svg').write_text(s.svg(w, h, 'Cockpit docked beside the Claude Code transcript'), encoding='utf-8')


# ── The band above the prompt ───────────────────────────────────────────────

def make_band():
    cols = 128
    top = 34 + 10
    rows = 23
    s = Svg(0, top)
    w = (cols + 4) * CW
    h = top + rows * LH + 8
    chrome(s, w, 'claude — ~/billing (narrow terminal: the cockpit becomes a band)')
    c0 = 2 + 2
    W = cols - 4
    s.runs(c0 - 2, 0, [('● ', OK), ('Edit', TX, True), ('(src/billing/webhooks/router.ts)', DM)])
    s.runs(c0 - 2, 1, [('  ⎿ ', FA), ('Updated with 38 additions and 21 removals', DM)])
    s.frame(2, 2.4, cols, 17.6, EDGE)
    r = 3
    s.text(c0, r, '◢◤ C O C K P I T', ACC, True)
    s.runs(c0 + W - 62, r, [('◆ Opus 5.5', WH, True), ('   effort ', DM)])
    for i in range(5):
        s.rect(c0 + W - 41 + i, r + 0.2, 0.62, 0.62, ACC if i < 3 else FA, rx=1)
    s.runs(c0 + W - 36, r, [(' high', WH, True), (' / max   ', DM)])
    s.rect(c0 + W - 22, r + 0.08, 9, 0.84, WARN, rx=2)
    s.play(c0 + W - 21.5, r, INK)
    s.text(c0 + W - 18.5, r, 'auto', INK, True)
    s.text(c0 + W - 11, r, '14:45:4', DM)
    s.digits(c0 + W - 4, r, 10, DM)
    s.text(c0 + W - 2, r, '●', ACC, cls='blink')
    r += 2
    cw3 = (W - 6) / 3
    cols3 = [c0, c0 + cw3 + 3, c0 + 2 * (cw3 + 3)]
    s.text(cols3[0], r, 'SESSION · 5 H', DM, True)
    s.right(cols3[0] + cw3, r, '57 %', ACC, True)
    s.gauge(cols3[0], r + 1, cw3, 57, ACC)
    s.text(cols3[0], r + 2, 'fin dans', DM)
    s.runs(cols3[0] + cw3 - 14, r + 2, [('1 h 12', WH), (' · 15:10', DM)])
    s.text(cols3[0], r + 3, 'à la fin de la fenêtre', DM)
    s.right(cols3[0] + cw3, r + 3, '~78 %', WARN)
    s.text(cols3[1], r, 'SEMAINE', DM, True)
    s.right(cols3[1] + cw3, r, '31 %', ACC, True)
    s.gauge(cols3[1], r + 1, cw3, 31, ACC)
    s.text(cols3[1], r + 2, 'renouvellement', DM)
    s.runs(cols3[1] + cw3 - 19, r + 2, [('2 j 4 h', WH), (' · lun. 19:00', DM)])
    s.text(cols3[2], r, 'CONTEXTE', DM, True)
    s.runs(cols3[2] + cw3 - 18, r, [('412 k', WH, True), (' / 1 M · ', DM), ('41 %', ACC, True)])
    y = r + 1
    s.rect(cols3[2], y + 0.22, cw3, 0.56, FA, rx=2, extra=' opacity="0.55"')
    c = cols3[2]
    for frac, color, op in [(0.03, ACC2, 1), (0.05, ACC2, 0.6), (0.33, ACC, 1)]:
        s.rect(c, y + 0.22, cw3 * frac, 0.56, color, rx=1, extra=f' opacity="{op}"')
        c += cw3 * frac
    s.rect(cols3[2] + cw3 * 0.83, y + 0.22, cw3 * 0.17, 0.56, WARN, rx=1, extra=' opacity="0.28"')
    s.runs(cols3[2], r + 2, [('■', ACC2), (' système 3 %  ', DM), ('■', ACC2), (' outils 5 %  ', DM), ('■', ACC), (' messages', DM)])
    r += 5
    s.runs(c0, r, [('A C T I V I T É   ', DM, True), ('2 h 14', WH, True), ('  ·  ', DM), ('≈ 18,40 $ API', WARN, True), ('  ·  ', DM), ('21.7 M', ACC, True), (' tokens  ', DM), ('↑', ACC), (' 21.4 M', WH), ('  ↓', WARN), (' 286 k', WH), ('  ·  642 req.', DM)])
    s.runs_right(c0 + W, r, [('relus du cache ', DM), ('92 %', WH), (' des envoyés', DM)])
    r += 2
    s.text(c0, r, 'E N   F O N D', DM, True)
    s.spinner(c0 + 15, r, ACC)
    s.runs(c0 + 17, r, [('revue du lot', WH), (' 12 min', DM), ('   ·   ', DM)])
    s.spinner(c0 + 41, r, ACC, 1.0, 0.45)
    s.runs(c0 + 43, r, [('npm run test:e2e', WH), (' 3 min', DM)])
    r += 2
    s.runs(c0, r, [('P L A N   ', DM, True), ("Refonte de l'API de paiement  ", WH, True), ('3', ACC, True), ('/7', DM)])
    s.runs(c0 + W - 50, r, [('écoulé ', DM), ('1 h 10', WH, True), ('  ·  reste ≈ ', DM), ('46 min', ACC, True), ('  ·  fin ≈ ', DM), ('15:31', ACC, True)])
    r += 1
    steps = [
        ('1', 'Cartographier', '12 min / 15 min', 'done'),
        ('2', 'Tests de contrat', '31 min / 25 min', 'over'),
        ('3', 'Client Stripe', '18 min / 20 min', 'done'),
        ('4', 'Webhooks', '9 min / ~20 min', 'cur'),
        ('5', 'Paiements de test', '~15 min', 'todo'),
        ('6', 'Documentation', '~10 min', 'todo'),
        ('7', 'Relecture', '~10 min', 'todo'),
    ]
    sw = (W - 6) / 7
    for i, (n, title, time, state) in enumerate(steps):
        x = c0 + i * (sw + 1)
        cx, cy = s.x(x + 0.5), s.y(r) + LH / 2
        if state in ('done', 'over'):
            s.out.append(f'<circle cx="{cx}" cy="{cy}" r="4.4" fill="{OK}"/>')
            s.line(x + 1.4, r, sw - 1.8, OK)
        elif state == 'cur':
            s.out.append(f'<circle cx="{cx}" cy="{cy}" r="5.6" fill="none" stroke="{ACC}" stroke-width="2" class="pulse"/>')
            s.out.append(f'<circle cx="{cx}" cy="{cy}" r="2.6" fill="{ACC}"/>')
            s.line(x + 1.4, r, (sw - 1.8) * 0.45, ACC)
            s.line(x + 1.4 + (sw - 1.8) * 0.45, r, (sw - 1.8) * 0.55, FA)
            s.out.append(f'<circle cx="{s.x(x + 1.5)}" cy="{cy}" r="2.4" fill="{WH}" class="spark" style="--d:{round((sw - 1.8) * 0.45 * CW, 1)}px"/>')
        else:
            s.out.append(f'<circle cx="{cx}" cy="{cy}" r="3.8" fill="none" stroke="{DM}" stroke-width="1.4"/>')
            s.line(x + 1.4, r, sw - 1.8, FA)
        if state == 'cur':
            s.spinner(x, r + 1, ACC)
            s.runs(x + 2, r + 1, [(fit(title, sw - 3), WH, True)])
        else:
            s.runs(x, r + 1, [(n, FA), (' ' + fit(title, sw - 3), WH if state != 'todo' else DM)])
        tcolor = HOT if state == 'over' else (ACC if state == 'cur' else (WH if state == 'done' else DM))
        real, _, est = time.partition(' / ')
        if est:
            s.runs(x, r + 2, [(real, tcolor, state == 'cur'), (' / ' + est, DM)])
        else:
            s.text(x, r + 2, time, DM)
    r += 3
    s.runs(c0, r, [('› ', ACC, True), ('réécrit le routeur des webhooks', WH), ('   ·   ensuite : Rejouer les paiements de test', DM)])
    s.runs(2, rows - 1.6, [('> ', TX)])
    s.rect(4, rows - 1.48, 0.9, 0.78, TX, cls='cursor')
    (HERE / 'cockpit-band.svg').write_text(s.svg(w, h, 'Cockpit as a band above the prompt'), encoding='utf-8')


if __name__ == '__main__':
    make_dock()
    make_band()
    print('docs/cockpit-dock.svg, docs/cockpit-band.svg')
