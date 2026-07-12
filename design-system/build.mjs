// Generates the TradeOS design-system preview cards for Claude Design.
// Every card is a self-contained HTML file (no CDN, no JS, no external fonts)
// showing the component in BOTH themes side by side. Token values are
// extracted from src/app/globals.css at build time so the cards can never
// drift from the app.
//
// Usage: node design-system/build.mjs   (from the repo root)

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "design-system");
const css = readFileSync(join(ROOT, "src/app/globals.css"), "utf8");

// --- extract token blocks -------------------------------------------------
function extractVars(block) {
  return [...block.matchAll(/--[\w-]+:\s*[^;]+;/g)].map((m) => m[0]).join("\n    ");
}
const rootBlock = css.match(/:root\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
const darkBlock = css.match(/\.dark\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
const LIGHT_VARS = extractVars(rootBlock);
const DARK_VARS = extractVars(darkBlock);

const equitySvg = readFileSync(join(OUT, "assets/equity-curve.svg"), "utf8");
const bucketSvg = readFileSync(join(OUT, "assets/bucket-bar.svg"), "utf8");

// --- shared css -----------------------------------------------------------
const SHARED_CSS = `
  * { margin:0; padding:0; box-sizing:border-box; border-color:hsl(var(--border)); }
  body { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; background:#e8e9ec; }
  .panels { display:grid; grid-template-columns:1fr 1fr; min-height:100vh; }
  @media (max-width: 720px) { .panels { grid-template-columns:1fr; } }
  .panel { padding:28px; background:hsl(var(--background)); color:hsl(var(--foreground)); }
  .panel-light { ${LIGHT_VARS} }
  .panel-dark { ${DARK_VARS} }
  .panel-tag { font-size:10px; text-transform:uppercase; letter-spacing:.14em; color:hsl(var(--muted-foreground)); margin-bottom:18px; }
  .tabular { font-variant-numeric: tabular-nums; font-feature-settings:"tnum"; }
  .row { display:flex; flex-wrap:wrap; gap:10px; align-items:center; margin-bottom:14px; }
  .stack { display:flex; flex-direction:column; gap:14px; }
  h3.sec { font-size:11px; text-transform:uppercase; letter-spacing:.12em; color:hsl(var(--muted-foreground)); margin:18px 0 8px; font-weight:600; }

  /* buttons */
  .btn { display:inline-flex; align-items:center; justify-content:center; gap:8px; white-space:nowrap;
    border-radius:calc(var(--radius) - 2px); font-size:14px; font-weight:500; border:1px solid transparent;
    height:36px; padding:0 16px; cursor:default; }
  .btn-sm { height:32px; padding:0 12px; font-size:12px; }
  .btn-lg { height:44px; padding:0 24px; }
  .btn-default { background:hsl(var(--primary)); color:hsl(var(--primary-foreground)); box-shadow:0 1px 2px rgb(0 0 0 / .08); }
  .btn-secondary { background:hsl(var(--surface-overlay)); color:hsl(var(--foreground)); border-color:hsl(var(--border)); }
  .btn-outline { background:transparent; border-color:hsl(var(--input)); color:hsl(var(--foreground)); }
  .btn-ghost { background:transparent; color:hsl(var(--foreground)); }
  .btn-destructive { background:hsl(var(--loss)); color:hsl(var(--primary-foreground)); }
  .btn-link { background:none; color:hsl(var(--primary)); text-decoration:underline; text-underline-offset:4px; }

  /* badges */
  .badge { display:inline-flex; align-items:center; border-radius:6px; border:1px solid transparent;
    padding:2px 8px; font-size:11px; font-weight:500; text-transform:uppercase; letter-spacing:.05em; }
  .badge-default { background:hsl(var(--primary)); color:hsl(var(--primary-foreground)); }
  .badge-secondary { background:hsl(var(--surface-overlay)); color:hsl(var(--foreground)); }
  .badge-outline { border-color:hsl(var(--border)); color:hsl(var(--foreground)); }
  .badge-profit { background:hsl(var(--profit-muted)); color:hsl(var(--profit)); }
  .badge-loss { background:hsl(var(--loss-muted)); color:hsl(var(--loss)); }
  .badge-warning { background:hsl(var(--warning-muted)); color:hsl(var(--warning)); }
  .badge-info { background:hsl(var(--primary) / .15); color:hsl(var(--info)); }

  /* card */
  .card { border-radius:var(--radius); border:1px solid hsl(var(--border)); background:hsl(var(--card));
    color:hsl(var(--card-foreground)); box-shadow:0 1px 2px rgb(0 0 0 / .05); }
  .panel-dark .card { background-image:linear-gradient(hsl(var(--foreground) / .03), transparent 45%); }
  .card-h { padding:20px; display:flex; align-items:center; justify-content:space-between; }
  .card-t { font-size:16px; font-weight:600; letter-spacing:-.01em; }
  .card-d { font-size:14px; color:hsl(var(--muted-foreground)); margin-top:4px; }
  .card-c { padding:20px; padding-top:0; }

  /* misc */
  .label { font-size:11px; font-weight:500; text-transform:uppercase; letter-spacing:.05em; color:hsl(var(--muted-foreground)); }
  .meter { height:6px; width:100%; overflow:hidden; border-radius:999px; background:hsl(var(--muted)); }
  .meter > div { height:100%; border-radius:999px; }
  .swatch { width:100%; height:44px; border-radius:8px; border:1px solid hsl(var(--border)); }
  .sw-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; }
  .sw-name { font-size:11px; margin-top:4px; color:hsl(var(--muted-foreground)); }
  input.inp, select.inp, textarea.inp { display:block; width:100%; height:36px; border-radius:calc(var(--radius) - 2px);
    border:1px solid hsl(var(--input)); background:hsl(var(--surface)); color:hsl(var(--foreground));
    padding:4px 12px; font-size:14px; font-family:inherit; }
  textarea.inp { height:auto; min-height:70px; padding-top:8px; }
  .inp::placeholder { color:hsl(var(--muted-foreground)); }
  table.tbl { width:100%; border-collapse:collapse; font-size:14px; }
  table.tbl th { text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:.05em;
    color:hsl(var(--muted-foreground)); font-weight:500; padding:8px 12px; border-bottom:1px solid hsl(var(--border)); }
  table.tbl td { padding:10px 12px; border-bottom:1px solid hsl(var(--border)); }
  .t-profit { color:hsl(var(--profit)); } .t-loss { color:hsl(var(--loss)); }
  .t-high { color:hsl(var(--score-high)); } .t-mid { color:hsl(var(--score-mid)); } .t-low { color:hsl(var(--score-low)); }
  .chip { display:inline-block; padding:1px 7px; border-radius:6px; font-size:11px; font-weight:600; }
  .chip-high { background:hsl(var(--score-high) / .15); color:hsl(var(--score-high)); }
  .chip-mid { background:hsl(var(--score-mid) / .15); color:hsl(var(--score-mid)); }
  .chip-low { background:hsl(var(--score-low) / .15); color:hsl(var(--score-low)); }
  .skeleton { background:hsl(var(--muted)); border-radius:8px; }
  .progress { height:8px; border-radius:999px; background:hsl(var(--muted)); overflow:hidden; }
  .progress > div { height:100%; border-radius:999px; background:hsl(var(--primary)); }
`;

function page(title, group, body, extraCss = "") {
  return `<!-- @dsCard group="${group}" -->
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title} — TradeOS DS</title>
<style>${SHARED_CSS}${extraCss}</style>
</head>
<body>
  <div class="panels">
    <div class="panel panel-dark"><div class="panel-tag">Dark (native)</div>${body}</div>
    <div class="panel panel-light"><div class="panel-tag">Light</div>${body}</div>
  </div>
</body>
</html>`;
}

// --- score ring (same math as src/components/charts/score-ring.tsx) --------
function ring(score, band) {
  const size = 120, stroke = 10;
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const off = c - (score / 100) * c;
  return `<div style="position:relative;width:${size}px;height:${size}px;display:inline-flex;align-items:center;justify-content:center;">
    <svg width="${size}" height="${size}" style="transform:rotate(-90deg)">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="hsl(var(--muted))" stroke-width="${stroke}"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="hsl(var(--score-${band}))" stroke-width="${stroke}"
        stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" stroke-linecap="round"/>
    </svg>
    <div style="position:absolute;text-align:center;">
      <div class="tabular t-${band}" style="font-size:28px;font-weight:600;">${score}</div>
      <div class="label">Overall</div>
    </div>
  </div>`;
}

function meterRow(label, score, band, detail) {
  return `<div>
    <div style="display:flex;justify-content:space-between;align-items:baseline;">
      <span style="font-size:14px;">${label}</span>
      <span class="tabular" style="font-size:14px;font-weight:600;">${score}</span>
    </div>
    <div class="meter" style="margin-top:6px;"><div style="width:${score}%;background:hsl(var(--score-${band}));"></div></div>
    ${detail ? `<p style="font-size:11px;color:hsl(var(--muted-foreground));margin-top:4px;">${detail}</p>` : ""}
  </div>`;
}

const cards = {};

// FOUNDATIONS ---------------------------------------------------------------
cards["foundations/colors.html"] = page("Colors", "Foundations", `
  <h3 class="sec">Surfaces & structure</h3>
  <div class="sw-grid">
    ${["background", "surface", "surface-raised", "surface-overlay", "card", "border", "muted", "accent", "input"]
      .map((t) => `<div><div class="swatch" style="background:hsl(var(--${t}))"></div><div class="sw-name">--${t}</div></div>`).join("")}
  </div>
  <h3 class="sec">Signal — one accent + financial semantics</h3>
  <div class="sw-grid">
    ${["primary", "profit", "loss", "warning", "profit-muted", "loss-muted", "warning-muted", "info", "ring"]
      .map((t) => `<div><div class="swatch" style="background:hsl(var(--${t}))"></div><div class="sw-name">--${t}</div></div>`).join("")}
  </div>
  <h3 class="sec">Discipline-score bands</h3>
  <div class="sw-grid">
    ${["score-high", "score-mid", "score-low"]
      .map((t) => `<div><div class="swatch" style="background:hsl(var(--${t}))"></div><div class="sw-name">--${t}</div></div>`).join("")}
  </div>`);

cards["foundations/typography.html"] = page("Typography", "Foundations", `
  <div class="stack">
    <div style="font-size:30px;font-weight:600;letter-spacing:-.02em;">Page title — 30/semibold</div>
    <div style="font-size:16px;font-weight:600;">Card title — 16/semibold</div>
    <div style="font-size:14px;">Body — 14/regular. Sharp, trader-native copy. No fluff.</div>
    <div style="font-size:14px;color:hsl(var(--muted-foreground));">Muted — 14 muted-foreground</div>
    <div class="label">Small label — 11/uppercase/tracking-wide</div>
    <h3 class="sec">Tabular numerals (mandatory for financial figures)</h3>
    <div class="tabular" style="font-size:24px;font-weight:600;">
      <span class="t-profit">+$6,327.29</span>&nbsp;&nbsp;<span class="t-loss">−$1,487.06</span>&nbsp;&nbsp;50.4%
    </div>
    <div style="font-size:12px;color:hsl(var(--muted-foreground));">Every digit same width — columns align. Class: <code>.tabular</code></div>
  </div>`);

cards["foundations/surfaces.html"] = page("Elevation & radius", "Foundations", `
  <div class="stack">
    <div style="background:hsl(var(--surface));border:1px solid hsl(var(--border));border-radius:var(--radius);padding:18px;">
      <div class="label">surface</div>
      <div style="background:hsl(var(--surface-raised));border:1px solid hsl(var(--border));border-radius:calc(var(--radius) - 2px);padding:16px;margin-top:10px;">
        <div class="label">surface-raised</div>
        <div style="background:hsl(var(--surface-overlay));border:1px solid hsl(var(--border));border-radius:calc(var(--radius) - 4px);padding:14px;margin-top:10px;">
          <div class="label">surface-overlay</div>
        </div>
      </div>
    </div>
    <div style="font-size:12px;color:hsl(var(--muted-foreground));">4 elevation levels: background → surface → raised → overlay. Radius: 0.75rem cards, −2px controls.</div>
  </div>`);

// ACTIONS --------------------------------------------------------------------
cards["actions/buttons.html"] = page("Buttons", "Actions", `
  <h3 class="sec">Variants</h3>
  <div class="row">
    <span class="btn btn-default">Start free trial</span>
    <span class="btn btn-secondary">Import</span>
    <span class="btn btn-outline">Rulebook</span>
    <span class="btn btn-ghost">Cancel</span>
    <span class="btn btn-destructive">Delete account</span>
    <span class="btn btn-link">View all</span>
  </div>
  <h3 class="sec">Sizes</h3>
  <div class="row">
    <span class="btn btn-default btn-sm">Small</span>
    <span class="btn btn-default">Default</span>
    <span class="btn btn-default btn-lg">Large</span>
  </div>
  <h3 class="sec">Disabled</h3>
  <div class="row"><span class="btn btn-default" style="opacity:.5;">Disabled</span></div>`);

// DATA DISPLAY ----------------------------------------------------------------
cards["data/badges.html"] = page("Badges", "Data Display", `
  <h3 class="sec">All variants — uppercase 11px</h3>
  <div class="row">
    <span class="badge badge-default">Default</span>
    <span class="badge badge-secondary">Secondary</span>
    <span class="badge badge-outline">Outline</span>
    <span class="badge badge-profit">Pass</span>
    <span class="badge badge-loss">Fail</span>
    <span class="badge badge-warning">Warning</span>
    <span class="badge badge-info">14 days left</span>
  </div>
  <h3 class="sec">Score chips (bg at 15% opacity)</h3>
  <div class="row">
    <span class="chip chip-high tabular">92</span>
    <span class="chip chip-mid tabular">72</span>
    <span class="chip chip-low tabular">41</span>
  </div>`);

cards["data/cards.html"] = page("Cards & stat tiles", "Data Display", `
  <div class="card" style="margin-bottom:16px;">
    <div class="card-h">
      <div><div class="card-t">Equity Curve</div><div class="card-d">Cumulative net P&amp;L over time</div></div>
      <span class="btn btn-outline btn-sm">Rulebook</span>
    </div>
    <div class="card-c" style="color:hsl(var(--muted-foreground));font-size:14px;">Card body content. Header row via flex-row.</div>
  </div>
  <h3 class="sec">KPI stat tile (compact)</h3>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
    <div class="card"><div style="padding:16px;">
      <div class="label">Net P&amp;L</div>
      <div class="tabular t-profit" style="font-size:24px;font-weight:600;margin-top:8px;">+$6,327.29</div>
      <div style="font-size:11px;color:hsl(var(--muted-foreground));margin-top:4px;">250 trades · $2,247.96 fees</div>
    </div></div>
    <div class="card"><div style="padding:16px;">
      <div class="label">Max Drawdown</div>
      <div class="tabular t-loss" style="font-size:24px;font-weight:600;margin-top:8px;">−$1,487.06</div>
      <div style="font-size:11px;color:hsl(var(--muted-foreground));margin-top:4px;">58.4%</div>
    </div></div>
  </div>`);

cards["data/score.html"] = page("Discipline score", "Data Display", `
  <h3 class="sec">The one gauge in the product — three bands</h3>
  <div class="row" style="gap:24px;">${ring(92, "high")}${ring(72, "mid")}${ring(41, "low")}</div>
  <h3 class="sec">Sub-score meters</h3>
  <div class="stack">
    ${meterRow("Rule adherence", 74, "mid", "1087/1500 rule checks passed (severity-weighted).")}
    ${meterRow("Risk discipline", 80, "high", "Loss control 80%; max drawdown 1487.")}
    ${meterRow("Consistency", 49, "low", "45 trading days; daily P&amp;L CV 1.19.")}
  </div>`);

cards["data/table.html"] = page("Trades table", "Data Display", `
  <div class="card"><div style="padding:6px 0;">
  <table class="tbl">
    <thead><tr><th>Symbol</th><th>Side</th><th>Net P&amp;L</th><th>R</th><th>Score</th></tr></thead>
    <tbody>
      <tr><td style="font-weight:500;">NQ</td><td><span class="badge badge-profit">Long</span></td><td class="tabular t-profit">+$385.19</td><td class="tabular">+1.8R</td><td><span class="chip chip-high tabular">94</span></td></tr>
      <tr><td style="font-weight:500;">ES</td><td><span class="badge badge-loss">Short</span></td><td class="tabular t-loss">−$291.42</td><td class="tabular">−1.0R</td><td><span class="chip chip-mid tabular">68</span></td></tr>
      <tr><td style="font-weight:500;">CL</td><td><span class="badge badge-loss">Short</span></td><td class="tabular t-loss">−$310.00</td><td class="tabular">−1.2R</td><td><span class="chip chip-low tabular">41</span></td></tr>
    </tbody>
  </table>
  </div></div>
  <p style="font-size:12px;color:hsl(var(--muted-foreground));margin-top:10px;">Tabular numerals, pnlColor semantics, score chip per trade.</p>`);

cards["data/charts.html"] = page("Charts", "Data Display", `
  <h3 class="sec">Equity curve — real rendered SVG, token-driven</h3>
  <div class="card"><div style="padding:16px;max-width:100%;overflow-x:auto;">${equitySvg}</div></div>
  <h3 class="sec">Bucket bars</h3>
  <div class="card" style="margin-top:14px;"><div style="padding:16px;max-width:100%;overflow-x:auto;">${bucketSvg}</div></div>`,
  ` .recharts-wrapper, .recharts-wrapper svg { max-width:100%; height:auto; }`);

// FEEDBACK ---------------------------------------------------------------------
cards["feedback/empty-state.html"] = page("Empty states & loading", "Feedback", `
  <div class="card"><div style="padding:40px 24px;display:flex;flex-direction:column;align-items:center;gap:12px;text-align:center;">
    <div style="width:44px;height:44px;border-radius:999px;background:hsl(var(--muted));display:flex;align-items:center;justify-content:center;color:hsl(var(--muted-foreground));font-size:20px;">◎</div>
    <div>
      <div style="font-size:14px;font-weight:500;">Your discipline score starts here</div>
      <div style="font-size:14px;color:hsl(var(--muted-foreground));margin-top:4px;">Three steps and every trade gets graded.</div>
    </div>
    <ol style="list-style:none;display:flex;flex-direction:column;gap:6px;align-items:flex-start;text-align:left;">
      ${["Import trades from your broker", "Define your rulebook", "Watch your 0–100 score"].map((s, i) => `
      <li style="display:flex;gap:8px;align-items:center;font-size:14px;color:hsl(var(--muted-foreground));">
        <span style="width:20px;height:20px;border-radius:999px;border:1px solid hsl(var(--border));background:hsl(var(--surface));display:inline-flex;align-items:center;justify-content:center;font-size:11px;" class="tabular">${i + 1}</span>${s}
      </li>`).join("")}
    </ol>
    <span class="btn btn-default btn-sm">Load sample data</span>
  </div></div>
  <h3 class="sec">Skeleton & progress</h3>
  <div class="stack">
    <div class="skeleton" style="height:16px;width:60%;"></div>
    <div class="skeleton" style="height:16px;width:40%;"></div>
    <div class="progress"><div style="width:64%;"></div></div>
  </div>`);

// NAVIGATION ---------------------------------------------------------------------
cards["navigation/app-shell.html"] = page("App shell", "Navigation", `
  <div style="display:flex;border:1px solid hsl(var(--border));border-radius:var(--radius);overflow:hidden;background:hsl(var(--background));">
    <div style="width:190px;background:hsl(var(--surface));border-right:1px solid hsl(var(--border));padding:12px 10px;">
      <div style="display:flex;align-items:center;gap:8px;padding:0 6px 12px;border-bottom:1px solid hsl(var(--border));margin-bottom:12px;">
        <span style="width:24px;height:24px;border-radius:6px;background:hsl(var(--primary));display:inline-flex;align-items:center;justify-content:center;color:hsl(var(--primary-foreground));font-size:12px;">◈</span>
        <b style="font-size:14px;">TradeOS</b>
      </div>
      <div class="label" style="padding:0 6px 6px;">Trading</div>
      <div style="position:relative;display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:8px;background:hsl(var(--accent));font-size:13px;font-weight:500;">
        <span style="position:absolute;left:0;top:8px;bottom:8px;width:2px;border-radius:999px;background:hsl(var(--primary));"></span>
        Dashboard
      </div>
      ${["Trade Journal", "Analytics", "Rule Engine", "Prop Firm"].map((l) =>
        `<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:8px;color:hsl(var(--muted-foreground));font-size:13px;font-weight:500;">${l}</div>`).join("")}
    </div>
    <div style="flex:1;">
      <div style="height:48px;border-bottom:1px solid hsl(var(--border));background:hsl(var(--surface) / .8);display:flex;align-items:center;justify-content:flex-end;gap:10px;padding:0 14px;">
        <span class="badge badge-info">9 days left in trial</span>
        <span class="btn btn-secondary btn-sm">Import</span>
        <span style="width:28px;height:28px;border-radius:999px;background:hsl(var(--primary) / .15);color:hsl(var(--primary));display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;">DE</span>
      </div>
      <div style="padding:16px;color:hsl(var(--muted-foreground));font-size:13px;">Content area</div>
    </div>
  </div>
  <h3 class="sec">Mobile bottom tabs</h3>
  <div style="max-width:390px;border:1px solid hsl(var(--border));border-radius:12px;background:hsl(var(--surface));display:flex;height:56px;">
    ${["Home", "Journal", "Stats", "Rules", "Prop"].map((l, i) =>
      `<div style="position:relative;flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;font-size:10px;font-weight:500;color:hsl(var(--${i === 0 ? "primary" : "muted-foreground"}));">
        ${i === 0 ? '<span style="position:absolute;top:0;height:2px;width:32px;border-radius:999px;background:hsl(var(--primary));"></span>' : ""}
        <span style="font-size:16px;">${["▦", "▤", "◫", "◇", "▲"][i]}</span>${l}
      </div>`).join("")}
  </div>`);

// FORMS ---------------------------------------------------------------------------
cards["forms/inputs.html"] = page("Forms", "Forms", `
  <div class="stack" style="max-width:420px;">
    <div><div class="label" style="margin-bottom:6px;">Email</div><input class="inp" placeholder="you@email.com" /></div>
    <div><div class="label" style="margin-bottom:6px;">Broker</div>
      <select class="inp"><option>Topstep</option><option>Tradovate</option></select></div>
    <div><div class="label" style="margin-bottom:6px;">Notes</div><textarea class="inp" placeholder="What was the plan?"></textarea></div>
    <h3 class="sec">Tabs</h3>
    <div style="display:inline-flex;background:hsl(var(--muted));border-radius:10px;padding:3px;gap:2px;">
      <span style="padding:6px 14px;border-radius:8px;background:hsl(var(--surface-overlay));font-size:13px;font-weight:500;">Overview</span>
      <span style="padding:6px 14px;border-radius:8px;color:hsl(var(--muted-foreground));font-size:13px;font-weight:500;">Rules</span>
      <span style="padding:6px 14px;border-radius:8px;color:hsl(var(--muted-foreground));font-size:13px;font-weight:500;">History</span>
    </div>
    <h3 class="sec">Focus ring</h3>
    <input class="inp" style="outline:2px solid hsl(var(--ring));outline-offset:2px;" value="Focused input" />
  </div>`);

// write ------------------------------------------------------------------------
for (const [path, html] of Object.entries(cards)) {
  const full = join(OUT, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, html);
  console.log("wrote", path);
}
console.log("done:", Object.keys(cards).length, "cards");
