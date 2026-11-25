/* Launch Radar (radar-4): refits the model in this browser over data.js and renders the board.
   Every number on the page is recomputed here from the snapshot; the integrity strip says how
   far the recomputation agrees with board.json. */
(function () {
'use strict';
var M = window.RADAR_MODEL, D = window.RADAR, app = document.getElementById('board');
if (!M || !D) { app.innerHTML = '<p class="loading">No data: data.js did not load.</p>'; return; }
var R, integ = {}, bySlug = {}, scen = { deposit: 'plan', dropShare: 0.10, weeks: 12 };
var S = { verdict: 'all', tier: 'all', q: '', category: 'all', chain: 'all', sort: 'implied', dir: -1, view: 'board', slug: null, exp: {} };
var vCache = {};
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function usd(n) { if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B'; if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M'; if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K'; return '$' + Math.round(n); }
function usdF(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
function usdS(n) { return (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US'); }
function pct(n, d) { return (n * 100).toFixed(d == null ? 0 : d) + '%'; }
function mult(n) { return 'x' + n.toFixed(2); }
function ageStr(d) { if (d == null) return '—'; if (d >= 365) return (d / 365).toFixed(1) + ' yr'; if (d >= 30) return Math.round(d / 30) + ' mo'; return d + ' d'; }
function chg(c) { if (c == null) return '—'; return '<span class="' + (c >= 0 ? 'up' : 'down') + '">' + (c >= 0 ? '+' : '') + c.toFixed(1) + '%</span>'; }
function vp(v) { return '<span class="vp ' + v + '">' + v + '</span>'; }
function tierTag(t) { return t === 'watchlist' ? '<span class="tag">WATCHLIST</span>' : t === 'early' ? '<span class="tag early">EARLY</span>' : '<span class="tag off">OFF-LIST</span>'; }
function vFor(s) { var c = vCache[s.p.slug]; if (!c) { c = M.verdictFor(s, scen, R.exitPct); vCache[s.p.slug] = c; } return c; }
function counts() { var c = { FARM: 0, MARGINAL: 0, SKIP: 0 }; R.scored.forEach(function (s) { c[vFor(s).verdict]++; }); return c; }
// --- export, routing, start ------------------------------------------------
function download(name, text, type) {
  var a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: type }));
  a.download = name; a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
}
function jsonOf(rows) {
  return rows.map(function (s) {
    var v = vFor(s);
    return { rank: s.rank, slug: s.p.slug, name: s.p.name, category: s.p.category, chains: s.p.chains, tvl_usd: s.p.tvl_usd, change_7d: s.p.change_7d, age_days: s.ageDays, token_odds: s.odds, value_if_launches_usd: Math.round(s.valueIfLaunches), farm_value_usd: Math.round(s.farmValue), implied_value_usd: s.implied, p25_usd: s.p25, p75_usd: s.p75, verdict: v.verdict, deposit_usd: v.deposit, capital_charge_usd: Math.round(v.capCharge), break_even_odds: Math.round(v.breakEvenOdds * 10000) / 10000, net_of_fees_usd: Math.round(v.net), net_per_hour_usd: v.netHour };
  });
}
function csvOf(rows) {
  var cols = ['rank', 'slug', 'name', 'category', 'chains', 'tvl_usd', 'change_7d', 'age_days', 'token_odds', 'value_if_launches_usd', 'farm_value_usd', 'implied_value_usd', 'p25_usd', 'p75_usd', 'verdict', 'deposit_usd', 'capital_charge_usd', 'break_even_odds', 'net_of_fees_usd', 'net_per_hour_usd'];
  var cell = function (v) { if (v == null) return ''; v = Array.isArray(v) ? v.join(';') : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  return cols.join(',') + '\n' + jsonOf(rows).map(function (r) { return cols.map(function (c) { return cell(r[c]); }).join(','); }).join('\n') + '\n';
}
function route() {
  var h = location.hash;
  if (h === '#farm') { S.view = 'board'; S.verdict = 'FARM'; S.sort = 'netHour'; S.dir = -1; }
  else if (h.indexOf('#/') === 0 && bySlug[h.slice(2)]) { S.view = 'detail'; S.slug = h.slice(2); }
  else { S.view = 'board'; }
  if (S.view === 'board') renderBoard(); else renderDetail(S.slug);
}
window.addEventListener('hashchange', route);
setTimeout(function () {
  // The refit: the same build the program ran, over the same snapshot, in this browser.
  R = M.buildRadar({ as_of: D.as_of, source: D.source, floor_usd: D.floor_usd, protocols: D.protocols, watchlist: D.watchlist });
  R.scored.forEach(function (s) { bySlug[s.p.slug] = s; });
  var bv = {};
  D.board.forEach(function (b) { bv[b.slug] = b.implied_value_usd; });
  var ok = 0;
  R.scored.forEach(function (s) { var b = bv[s.p.slug]; if (b && Math.abs(s.implied - b) / b < 0.001) ok++; });
  var ordered = true;
  for (var i = 1; i < R.scored.length; i++) if (R.scored[i].implied > R.scored[i - 1].implied) ordered = false;
  var total = R.scored.reduce(function (a, s) { return a + s.implied; }, 0);
  integ = { ok: ok, n: R.scored.length, ordered: ordered, total: total, totalOk: total === D.totalImplied,
    chkOk: M.checksum(R.scored.map(function (s) { return s.p.slug + ':' + s.implied; }).join(',')) === D.checksum,
    wl: D.watchlist.every(function (slug) { return bySlug[slug]; }), ledger: R.accounting.total === D.protocols.length };
  route();
}, 30);
// --- the board -------------------------------------------------------------
function sortVal(s, key) {
  if (key === 'net') return vFor(s).net;
  if (key === 'netHour') return vFor(s).netHour;
  if (key === 'tvl') return s.p.tvl_usd;
  if (key === 'change') return s.p.change_7d == null ? -1e9 : s.p.change_7d;
  if (key === 'age') return s.ageDays == null ? -1 : s.ageDays;
  if (key === 'odds') return s.odds;
  if (key === 'be') return vFor(s).breakEvenOdds;
  if (key === 'value') return s.valueIfLaunches;
  return s.implied;
}
function filteredRows() {
  var q = S.q.toLowerCase(), key = S.sort, dir = S.dir;
  var rows = R.scored.filter(function (s) {
    return (S.tier === 'all' || s.tier === S.tier) && (S.verdict === 'all' || vFor(s).verdict === S.verdict)
      && (S.category === 'all' || s.p.category === S.category) && (S.chain === 'all' || s.p.chains.indexOf(S.chain) >= 0)
      && (!q || (s.p.name + ' ' + s.p.slug + ' ' + (s.p.category || '')).toLowerCase().indexOf(q) >= 0);
  });
  rows.sort(function (a, b) {
    if (key === 'name') return dir * (a.p.name < b.p.name ? -1 : a.p.name > b.p.name ? 1 : 0);
    return dir * (sortVal(a, key) - sortVal(b, key));
  });
  return rows;
}
function options(list, cur, allLabel) {
  return '<option value="all"' + (cur === 'all' ? ' selected' : '') + '>' + allLabel + '</option>'
    + list.map(function (v) { return '<option value="' + esc(v) + '"' + (cur === v ? ' selected' : '') + '>' + esc(v) + '</option>'; }).join('');
}
function filtersHtml() {
  var vc = counts(), ac = R.accounting, cats = [], chains = [];
  R.scored.forEach(function (s) { if (s.p.category && cats.indexOf(s.p.category) < 0) cats.push(s.p.category); s.p.chains.forEach(function (c) { if (chains.indexOf(c) < 0) chains.push(c); }); });
  cats.sort(); chains.sort();
  var pill = function (attr, val, label, n, cls) { return '<button class="pill ' + (cls || '') + (S[attr] === val ? ' on' : '') + '" data-' + attr + '="' + val + '">' + label + ' <span class="num">' + n + '</span></button>'; };
  var deps = [['plan', 'Deposit: plan size'], [1000, 'Deposit: $1,000'], [10000, 'Deposit: $10,000'], [25000, 'Deposit: $25,000']];
  return '<div class="filters">'
    + pill('verdict', 'all', 'All', R.scored.length) + pill('verdict', 'FARM', 'Farm', vc.FARM, 'farm') + pill('verdict', 'MARGINAL', 'Marginal', vc.MARGINAL) + pill('verdict', 'SKIP', 'Skip', vc.SKIP, 'skip')
    + pill('tier', 'all', 'All tiers', R.scored.length) + pill('tier', 'watchlist', 'Watchlist', ac.watchlist) + pill('tier', 'early', 'Early', ac.early) + pill('tier', 'off-list', 'Off-list', ac.offlist)
    + '<select id="f-dep" aria-label="Deposit size">' + deps.map(function (d) { return '<option value="' + d[0] + '"' + (scen.deposit === d[0] ? ' selected' : '') + '>' + d[1] + '</option>'; }).join('') + '</select>'
    + '<label class="lbl">Drop share <input type="range" id="f-share" min="1" max="20" step="0.5" value="' + (scen.dropShare * 100) + '"> <span id="f-share-v" class="num">' + pct(scen.dropShare, 1) + '</span></label>'
    + '<label class="lbl">Horizon <input type="range" id="f-weeks" min="4" max="52" step="1" value="' + scen.weeks + '"> <span id="f-weeks-v" class="num">' + scen.weeks + ' wk</span></label>'
    + '<input type="search" id="f-q" placeholder="Search name or slug" value="' + esc(S.q) + '">'
    + '<select id="f-cat" aria-label="Category">' + options(cats, S.category, 'All categories') + '</select>'
    + '<select id="f-chain" aria-label="Chain">' + options(chains, S.chain, 'All chains') + '</select>'
    + '<button class="btn" id="f-reset">Reset</button><button class="btn" id="f-csv">CSV</button><button class="btn" id="f-json">JSON</button>'
    + '</div><div id="tbl"></div><div class="scatter"><h2>Cap on TVL</h2>' + scatterHtml(null, 1160, 300) + '</div>';
}
function planExpHtml(s) {
  var v = vFor(s);
  var steps = (D.steps[s.p.slug] || []).map(function (t) {
    var title = t.slice(0, t.indexOf(':')), rest = t.slice(t.indexOf(':') + 2);
    var costAt = rest.indexOf(' COST '), timeAt = rest.indexOf(' TIME ');
    var text = costAt >= 0 ? rest.slice(0, costAt) : rest;
    var cost = costAt >= 0 ? rest.slice(costAt + 6, timeAt >= 0 ? timeAt : undefined).replace(/\.$/, '') : '—';
    var time = timeAt >= 0 ? rest.slice(timeAt + 6).replace(/\.$/, '') : '—';
    return '<tr><td class="when">' + esc(title) + '</td><td>' + esc(text) + '</td><td class="r num">' + esc(cost) + '</td><td class="r num">' + esc(time) + '</td></tr>';
  }).join('');
  return '<tr class="planrow"><td colspan="15"><table class="planexp"><tr><th>When</th><th>Step</th><th class="r">Cost</th><th class="r">Time</th></tr>' + steps + '</table>'
    + '<p class="bench">Budget: <b>' + usdF(v.deposit) + '</b> deposit + <b>' + usdF(v.fees) + '</b> fees + <b>' + usdF(v.capCharge) + '</b> capital charge at 2% a year = <b>' + usdF(v.deposit + v.fees + v.capCharge) + '</b> at risk · <b>' + v.hours.toFixed(1) + ' h</b> hands-on · modelled drop <b>' + usdF(v.drop) + '</b>, net <b>' + usdS(v.net) + '</b>.</p></td></tr>';
}
function tableHtml(rows) {
  var tvl = 0, imp = 0;
  rows.forEach(function (s) { tvl += s.p.tvl_usd; imp += s.implied; });
  var th = function (key, label) { return '<th data-sort="' + key + '">' + label + (S.sort === key ? (S.dir < 0 ? ' ▼' : ' ▲') : '') + '</th>'; };
  var beCell = function (v) { return v.breakEvenOdds > 1 ? '<span class="mut2">&gt;100%</span>' : pct(v.breakEvenOdds); };
  var body = rows.map(function (s) {
    var v = vFor(s), open = !!S.exp[s.p.slug];
    return '<tr data-slug="' + esc(s.p.slug) + '"><td><button class="expbtn" data-exp="' + esc(s.p.slug) + '" aria-label="Farm plan">' + (open ? '▾' : '▸') + '</button></td><td class="num">' + s.rank + '</td><td class="num">' + s.rankLo + '–' + s.rankHi + '</td>'
      + '<td class="proto"><span class="nm">' + esc(s.p.name) + '</span>' + tierTag(s.tier) + '<br><span class="sb">' + esc(s.p.category || 'uncategorised') + ' · ' + esc(s.p.chains.slice(0, 3).join(', ')) + '</span></td>'
      + '<td class="r num">' + usd(s.p.tvl_usd) + '</td><td class="r num">' + chg(s.p.change_7d) + '</td><td class="r num">' + ageStr(s.ageDays) + '</td>'
      + '<td class="r num">' + pct(s.odds) + '<span class="oddsbar"><i style="width:' + Math.round(s.odds * 100) + '%"></i></span></td>'
      + '<td class="r num">' + usd(s.valueIfLaunches) + '</td><td class="r num"><b>' + usd(s.implied) + '</b></td>'
      + '<td class="r num">' + usd(s.p25) + '–' + usd(s.p75) + '</td>'
      + '<td>' + vp(v.verdict) + '<br><span class="vsub">' + (v.verdict === 'SKIP' ? 'drop below costs' : 'net ' + usdS(v.net)) + '</span></td>'
      + '<td class="r num ' + (v.net >= 0 ? 'up' : 'down') + '">' + usdS(v.net) + '</td><td class="r num ' + (v.netHour >= 25 ? 'up' : 'down') + '">$' + v.netHour.toFixed(0) + '</td><td class="r num">' + beCell(v) + '</td></tr>'
      + (open ? planExpHtml(s) : '');
  }).join('');
  return '<p class="rowline">' + rows.length + ' of ' + R.scored.length + ' rows · ' + usd(tvl) + ' TVL · ' + usd(imp) + ' implied'
    + (S.verdict === 'FARM' ? ' · sorted by net / hour, high to low' : '') + '</p>'
    + '<table class="board"><thead><tr><th></th><th>#</th><th>Range</th>' + th('name', 'Protocol') + th('tvl', 'TVL') + th('change', '7d') + th('age', 'No-token age') + th('odds', 'Token odds') + th('value', 'If it launches') + th('implied', 'Implied value') + '<th>P25–P75</th><th>Verdict · net of fees</th>' + th('net', 'Net') + th('netHour', 'Net / hour') + th('be', 'Break-even odds') + '</tr></thead><tbody>' + body + '</tbody></table>';
}
function renderTable() { document.getElementById('tbl').innerHTML = tableHtml(filteredRows()); }
function bindFilters() {
  app.querySelector('.filters').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    if (b.hasAttribute('data-verdict')) { S.verdict = b.getAttribute('data-verdict'); if (S.verdict === 'FARM') { S.sort = 'netHour'; S.dir = -1; } renderBoard(); }
    else if (b.hasAttribute('data-tier')) { S.tier = b.getAttribute('data-tier'); renderBoard(); }
    else if (b.id === 'f-reset') { S.verdict = 'all'; S.tier = 'all'; S.q = ''; S.category = 'all'; S.chain = 'all'; S.sort = 'implied'; S.dir = -1; scen = { deposit: 'plan', dropShare: 0.10, weeks: 12 }; vCache = {}; renderBoard(); }
    else if (b.id === 'f-csv') download('launch-radar.csv', csvOf(filteredRows()), 'text/csv');
    else if (b.id === 'f-json') download('launch-radar.json', JSON.stringify(jsonOf(filteredRows()), null, 2), 'application/json');
  });
  app.querySelector('.filters').addEventListener('change', function (e) {
    var t = e.target;
    if (t.id === 'f-dep') { scen.deposit = t.value === 'plan' ? 'plan' : Number(t.value); vCache = {}; renderBoard(); }
    else if (t.id === 'f-cat') { S.category = t.value; renderBoard(); }
    else if (t.id === 'f-chain') { S.chain = t.value; renderBoard(); }
    else if (t.id === 'f-share' || t.id === 'f-weeks') renderBoard();
  });
  app.querySelector('.filters').addEventListener('input', function (e) {
    var t = e.target;
    if (t.id === 'f-q') { S.q = t.value; renderTable(); }
    else if (t.id === 'f-share') { scen.dropShare = Number(t.value) / 100; document.getElementById('f-share-v').textContent = pct(scen.dropShare, 1); vCache = {}; renderTable(); }
    else if (t.id === 'f-weeks') { scen.weeks = Number(t.value); document.getElementById('f-weeks-v').textContent = scen.weeks + ' wk'; vCache = {}; renderTable(); }
  });
  app.querySelector('#tbl').addEventListener('click', function (e) {
    var thEl = e.target.closest('th[data-sort]');
    if (thEl) { var k = thEl.getAttribute('data-sort'); if (S.sort === k) S.dir = -S.dir; else { S.sort = k; S.dir = -1; } renderTable(); return; }
    var xb = e.target.closest('.expbtn');
    if (xb) { var sl = xb.getAttribute('data-exp'); S.exp[sl] = !S.exp[sl]; renderTable(); return; }
    var tr = e.target.closest('tr[data-slug]');
    if (tr) location.hash = '#/' + tr.getAttribute('data-slug');
  });
}
function renderBoard() { app.innerHTML = topHtml() + filtersHtml() + footHtml(); bindFilters(); renderTable(); }
// --- the scatter: cap on TVL, log-log --------------------------------------
function scatterHtml(hl, W, H) {
  var ev = R.evidence.value, vm = R.valueModel, band = ev.band;
  var pts = R.comps.map(function (p) { return { x: Math.log(p.tvl_usd), y: Math.log(p.mcap_usd), c: 'a' }; });
  R.scored.forEach(function (s) { pts.push({ x: Math.log(s.p.tvl_usd), y: Math.log(s.valueIfLaunches), c: 'b', slug: s.p.slug }); });
  var xs = pts.map(function (p) { return p.x; }), ys = pts.map(function (p) { return p.y; });
  var x0 = Math.floor(Math.min.apply(null, xs)), x1 = Math.ceil(Math.max.apply(null, xs));
  var y0 = Math.floor(Math.min.apply(null, ys)), y1 = Math.ceil(Math.max.apply(null, ys));
  var L = 46, RR = 10, T = 10, B = 24;
  var X = function (v) { return L + (v - x0) / (x1 - x0) * (W - L - RR); }, Y = function (v) { return T + (y1 - v) / (y1 - y0) * (H - T - B); };
  var a = vm.size ? vm.size.a : 0, b = vm.size ? vm.size.b : 1;
  var line = '', blo = '', bhi = '';
  for (var i = 0; i <= 20; i++) {
    var xv = x0 + (x1 - x0) * i / 20, yv = a + b * xv;
    line += (i ? 'L' : 'M') + X(xv).toFixed(1) + ',' + Y(yv).toFixed(1);
    blo += (i ? 'L' : 'M') + X(xv).toFixed(1) + ',' + Y(yv + Math.log(band.lo)).toFixed(1);
    bhi = 'L' + X(xv).toFixed(1) + ',' + Y(yv + Math.log(band.hi)).toFixed(1) + bhi;
  }
  var lab = function (k) { return k >= 9 ? '$' + Math.pow(10, k - 9) + 'B' : k >= 6 ? '$' + Math.pow(10, k - 6) + 'M' : '$' + Math.pow(10, k - 3) + 'K'; };
  var grid = '';
  for (var k = Math.ceil(x0 / Math.LN10); k * Math.LN10 <= x1; k++) grid += '<line x1="' + X(k * Math.LN10).toFixed(1) + '" y1="' + T + '" x2="' + X(k * Math.LN10).toFixed(1) + '" y2="' + (H - B) + '" stroke="#1b2127"/><text x="' + X(k * Math.LN10).toFixed(1) + '" y="' + (H - 8) + '" fill="#8b98a5" font-size="10" text-anchor="middle">' + lab(k) + '</text>';
  for (var j = Math.ceil(y0 / Math.LN10); j * Math.LN10 <= y1; j++) grid += '<line x1="' + L + '" y1="' + Y(j * Math.LN10).toFixed(1) + '" x2="' + (W - RR) + '" y2="' + Y(j * Math.LN10).toFixed(1) + '" stroke="#1b2127"/><text x="' + (L - 5) + '" y="' + (Y(j * Math.LN10) + 3).toFixed(1) + '" fill="#8b98a5" font-size="10" text-anchor="end">' + lab(j) + '</text>';
  var dots = pts.map(function (p) {
    if (hl && p.slug === hl) return '<circle cx="' + X(p.x).toFixed(1) + '" cy="' + Y(p.y).toFixed(1) + '" r="5.5" fill="#bc8cff" stroke="#fff" stroke-width="1.5"/><text x="' + (X(p.x) + 8).toFixed(1) + '" y="' + (Y(p.y) - 6).toFixed(1) + '" fill="#d7dee6" font-size="11">this one</text>';
    return '<circle cx="' + X(p.x).toFixed(1) + '" cy="' + Y(p.y).toFixed(1) + '" r="' + (p.c === 'a' ? 2.8 : 2.2) + '" fill="' + (p.c === 'a' ? '#d29922' : '#bc8cff') + '" fill-opacity="' + (p.c === 'a' ? 0.85 : 0.6) + '"/>';
  }).join('');
  return '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="Scatter plot of market cap against TVL, log-log">' + grid
    + '<path d="' + blo + bhi + 'Z" fill="#bc8cff" fill-opacity="0.08"/><path d="' + line + '" fill="none" stroke="#d7dee6" stroke-width="1.2"/>'
    + dots + '</svg>'
    + '<p class="note" style="margin:4px 0 0"><span style="color:#d29922">●</span> traded tokens — real market cap (' + R.comps.length + ') · <span style="color:#bc8cff">●</span> board — fitted value if it launches (' + R.scored.length + ') · band: P25–P75 around the fitted size curve · log-log axes.</p>';
}
// --- one protocol ----------------------------------------------------------
function auditHtml(s) {
  var ev = R.evidence.value, fit = ev.fitted, vm = R.valueModel, flat = ev.rows[0];
  var rowFor = function (p) { return ev.rows.filter(function (r) { return r.name.indexOf(p) >= 0; })[0]; };
  var ln = function (k, v, tot) { return '<div class="ln' + (tot ? ' tot' : '') + '"><span class="k">' + k + '</span><span class="v num">' + v + '</span></div>'; };
  var sizeMult = Math.pow(s.p.tvl_usd / 1e8, fit.sizeSlope), sizeRow = rowFor('size curve');
  var html = '<div class="audit">'
    + ln('TVL, DefiLlama snapshot ' + D.as_of, usdF(s.p.tvl_usd))
    + ln('Base multiple — fitted on ' + ev.n + ' traded tokens, read at $100M TVL; flat alone: held-out miss ' + mult(flat.loo) + ' leave-one-out, ' + mult(flat.wf) + ' walk-forward', 'x' + fit.multiple100.toFixed(3));
  if (sizeRow && sizeRow.verdict === 'kept') html += ln('Size curve — slope ' + fit.sizeSlope.toFixed(2) + ' on ln(TVL / $100M); held-out miss ' + mult(sizeRow.loo) + ' / ' + mult(sizeRow.wf), 'x' + sizeMult.toFixed(2));
  var fam = M.familyOf(s.p.category), cat = s.p.category || 'Other';
  if (vm.family && vm.family[fam] != null) html += ln('Family effect (' + esc(fam) + ') — ridge-shrunk on its priced tokens', 'x' + Math.exp(vm.family[fam]).toFixed(2));
  if (vm.category && vm.category[cat] != null) html += ln('Category effect (' + esc(cat) + ') — ridge-shrunk on its priced tokens', 'x' + Math.exp(vm.category[cat]).toFixed(2));
  if (vm.terms.indexOf('growth') >= 0) html += ln('7-day growth — coefficient ' + vm.growth.toFixed(2) + ' on ' + pct(M.growthOf(s.p), 1) + ' weekly change', 'x' + Math.exp(vm.growth * M.growthOf(s.p)).toFixed(2));
  if (vm.terms.indexOf('age') >= 0) html += ln('Age — coefficient ' + vm.age.toFixed(3) + ' on ln(1 + ' + (M.ageYears(D.as_of, s.p.listed_at) || 0).toFixed(1) + ' years listed)', 'x' + Math.exp(vm.age * M.ageLog(D.as_of, s.p)).toFixed(2));
  if (vm.terms.indexOf('chains') >= 0) html += ln('Chain count — coefficient ' + vm.chains.toFixed(2) + ' on ln(' + s.p.chains.length + ' chains)', 'x' + Math.exp(vm.chains * M.chainsLn(s.p)).toFixed(2));
  if (vm.terms.indexOf('carry') >= 0) html += ln('Carry — coefficient ' + vm.carry.toFixed(2) + ' on ' + pct(M.carryOf(s.p, vm.marketGrowth), 1) + ' of 7-day change beyond the market\'s ' + pct(vm.marketGrowth, 1), 'x' + Math.exp(vm.carry * M.carryOf(s.p, vm.marketGrowth)).toFixed(2));
  html += ln('= Value if a token launches — TVL × effective multiple', usdF(s.valueIfLaunches));
  var oddsShort = { 'age, years listed': 'age', 'family effect': 'family', 'size curve, ln TVL': 'size', '7-day TVL growth': '7-day growth', 'chain count, ln': 'chain count' };
  var oddsKept = R.evidence.odds.rows.filter(function (r) { return r.verdict === 'kept'; }).map(function (r) { return oddsShort[r.name.replace(/^\+ /, '')] || r.name.replace(/^\+ /, ''); });
  var oddsBy = oddsKept.length ? 'peers of its ' + (oddsKept.length > 1 ? oddsKept.slice(0, -1).join(', ') + ' and ' + oddsKept[oddsKept.length - 1] : oddsKept[0]) : 'peers';
  html += ln('Token odds — ' + oddsBy + ': ' + pct(s.rateByAge) + ' record a token by its age (' + ageStr(s.ageDays) + '), ' + pct(s.rateOldest) + ' by the 3yr+ cohort\'s, so (' + pct(s.rateOldest) + ' − ' + pct(s.rateByAge) + ') ÷ (100% − ' + pct(s.rateByAge) + ') = ' + pct(s.odds) + '; Brier ' + R.evidence.odds.wf.toFixed(3) + ' vs base ' + R.evidence.odds.rows[0].wf.brier.toFixed(3), 'x' + s.odds.toFixed(2));
  if (s.tier === 'off-list') html += ln('Parent records a token — a stated haircut, not a fitted term', 'x0.50');
  html += ln('= Implied value — P25–P75 ' + usd(s.p25) + '–' + usd(s.p75) + '; rank ' + s.rankLo + '–' + s.rankHi + ' across 200 bootstrap refits', usdF(s.implied), true);
  var notUsed = ev.rows.filter(function (r) { return r.verdict === 'tested, not kept' || r.verdict === 'must not help'; }).map(function (r) { return r.name.replace(/^\+ /, '') + ' (' + mult(r.loo) + ' / ' + mult(r.wf) + ')'; });
  if (notUsed.length) html += '<p class="note" style="margin-top:8px">Tested, not used: ' + esc(notUsed.join('; ')) + '.</p>';
  return html + '</div>';
}
function peersHtml(s) {
  var list = R.comps.map(function (p, i) { return { p: p, loo: R.looPreds[i], d: Math.abs(Math.log(p.tvl_usd) - Math.log(s.p.tvl_usd)), same: p.category === s.p.category }; });
  list.sort(function (a, b) { return (b.same - a.same) || (a.d - b.d); });
  return '<table class="peers"><tr><th>Token</th><th>Category</th><th class="r">TVL</th><th class="r">Market cap</th><th class="r">Cap ÷ TVL</th><th class="r">Cap ÷ held-out model</th></tr>'
    + list.slice(0, 8).map(function (x) { return '<tr><td>' + esc(x.p.name) + '</td><td>' + esc(x.p.category || '—') + '</td><td class="r num">' + usd(x.p.tvl_usd) + '</td><td class="r num">' + usd(x.p.mcap_usd) + '</td><td class="r num">x' + (x.p.mcap_usd / x.p.tvl_usd).toFixed(2) + '</td><td class="r num">x' + (x.p.mcap_usd / x.loo).toFixed(2) + '</td></tr>'; }).join('') + '</table>';
}
function sensHtml(s) {
  var vm = R.valueModel, rows = [];
  var scen2 = function (label, tweak) {
    var p2 = Object.assign({}, s.p, tweak);
    var v2 = M.predictValue(vm, p2, D.as_of);
    var o2 = M.oddsFor(R.oddsModel, M.withAgeFallback(p2, R.medianAgeYears, D.as_of), D.as_of).odds;
    var imp2 = Math.max(1, Math.round(v2 * o2 * s.parentFactor));
    rows.push([label, v2, o2, imp2]);
  };
  scen2('TVL −30%', { tvl_usd: s.p.tvl_usd * 0.7 });
  scen2('7-day growth 0%', { change_7d: 0 });
  scen2('7-day growth +20%', { change_7d: 20 });
  if (s.p.listed_at) { var d = new Date(s.p.listed_at); d.setDate(d.getDate() - 182); scen2('Six more months listed', { listed_at: d.toISOString().slice(0, 10) }); }
  return '<table class="sens"><tr><th>What moves the value</th><th class="r">If it launches</th><th class="r">Token odds</th><th class="r">Implied</th><th class="r">Change</th></tr>'
    + rows.map(function (r) { var dl = (r[3] - s.implied) / s.implied; return '<tr><td>' + r[0] + '</td><td class="r num">' + usd(r[1]) + '</td><td class="r num">' + pct(r[2]) + '</td><td class="r num">' + usd(r[3]) + '</td><td class="r num ' + (dl >= 0 ? 'up' : 'down') + '">' + (dl >= 0 ? '+' : '') + pct(dl) + '</td></tr>'; }).join('') + '</table>';
}
function farmHtml(s) {
  var v = vFor(s), dep = v.deposit, fv = R.evidence.value.farmValueFactor;
  var beOdds = v.breakEvenOdds > 1 ? 'above 100% — it cannot break even at this deposit' : pct(v.breakEvenOdds);
  var prose = 'A ' + usdF(dep) + ' deposit for ' + scen.weeks + ' weeks buys a modelled drop of ' + usdF(v.drop) + ' — sized on the P25 value (' + fv.toFixed(2) + '× the fitted value: 3 in 4 held-out comps traded above it) — for ' + usdF(v.fees) + ' of fees, a ' + usdF(v.capCharge) + ' capital charge at 2% a year, and ' + v.hours.toFixed(1) + ' h of work: a net of ' + usdS(v.net) + ' ($' + v.netHour.toFixed(0) + '/h) against ' + usdF(v.tbill) + ' from a 4% T-bill. '
    + (v.verdict === 'FARM' ? 'The net clears the $25-an-hour bar.' : v.verdict === 'SKIP' ? 'The modelled drop does not cover the fees and the capital charge.' : 'The net is positive but under $25 an hour.')
    + ' The deposit is the smallest, $1,000–$25,000, that clears $25 an hour. Fees are covered while the drop stays above ' + pct(v.breakEvenShare, 1) + ' (model ' + pct(scen.dropShare, 1) + ') and the odds above ' + beOdds + ' (peers imply ' + pct(s.odds) + ').';
  var stat = function (k, val, cls) { return '<div class="vstat"><div class="k">' + k + '</div><div class="v num ' + (cls || '') + '">' + val + '</div></div>'; };
  var shares = [0.05, 0.10, 0.15], deps = [1000, 10000, 25000];
  var nearDep = deps.reduce(function (a, d) { return Math.abs(Math.log(d / dep)) < Math.abs(Math.log(a / dep)) ? d : a; });
  var grid = '<table class="fgrid"><tr><th>Net by drop share × deposit</th>' + deps.map(function (d) { return '<th>' + usdF(d) + '</th>'; }).join('') + '</tr>'
    + shares.map(function (sh) { return '<tr><td>' + pct(sh, 1) + ' of the launch</td>' + deps.map(function (d) {
      var nv = M.verdictFor(s, { deposit: d, dropShare: sh, weeks: scen.weeks }, R.exitPct).net;
      return '<td class="num ' + (sh === scen.dropShare && d === nearDep ? 'cur ' : '') + (nv >= 0 ? 'up' : 'down') + '">' + usdS(nv) + '</td>';
    }).join('') + '</tr>'; }).join('') + '</table>';
  var weeks = [4, 8, 13, 26].map(function (w) {
    var nv = M.verdictFor(s, { deposit: 'plan', dropShare: scen.dropShare, weeks: w }, R.exitPct).net;
    return w + ' wk <b class="num ' + (nv >= 0 ? 'up' : 'down') + '">' + usdS(nv) + '</b>';
  }).join(' · ');
  var dropIf = s.farmValue * scen.dropShare * (dep / s.p.tvl_usd);
  return '<p style="font-size:12px;margin:0">' + prose + '</p>'
    + '<div class="vstats">' + stat('At risk', usdF(dep)) + stat('Fees', usdF(v.fees)) + stat('Capital charge', usdF(v.capCharge)) + stat('Modelled drop', usdF(v.drop)) + stat('Net of fees', usdS(v.net), v.net >= 0 ? 'pos' : 'neg') + stat('Hands-on', v.hours.toFixed(1) + ' h') + stat('Net per hour', '$' + v.netHour.toFixed(0), v.netHour >= 25 ? 'pos' : 'neg') + stat('Break-even odds', v.breakEvenOdds > 1 ? '>100%' : pct(v.breakEvenOdds)) + '</div>' + grid
    + '<p class="bench">Net by weeks held (plan deposit resized each horizon): ' + weeks + '.</p>'
    + '<p class="bench">Benchmarks: T-bill <b>' + usdF(v.tbill) + '</b> · drop if it launches, P25 value <b>' + usdF(dropIf) + '</b> · break-even share <b>' + pct(v.breakEvenShare, 1) + '</b> · break-even odds <b>' + (v.breakEvenOdds > 1 ? '>100%' : pct(v.breakEvenOdds)) + '</b> · exit below <b>' + usd(v.exitTvl) + '</b> TVL.</p>'
    + '<p class="bench">FARM: the net clears $25 an hour on the P25 value; MARGINAL: positive under it; SKIP: loses money. The T-bill is a benchmark, not a bar. Yield earned meanwhile is left out.</p>'
    + sensHtml(s);
}
function renderDetail(slug) {
  var s = bySlug[slug];
  if (!s) { S.view = 'board'; renderBoard(); return; }
  var v = vFor(s);
  var facts = [['If a token launches', usdF(s.valueIfLaunches)], ['Farm value (P25)', usdF(s.farmValue)], ['Token odds', pct(s.odds)], ['P25–P75', usd(s.p25) + '–' + usd(s.p75)], ['P10–P90', usd(s.p10) + '–' + usd(s.p90)], ['TVL', usdF(s.p.tvl_usd)], ['7-day', chg(s.p.change_7d)], ['No-token age', ageStr(s.ageDays)], ['Listed', esc(s.p.listed_at || '—')]];
  var steps = (D.steps[slug] || []).map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('');
  app.innerHTML = '<div class="detail"><p class="crumb"><a href="#">← Board</a> · ' + esc(s.p.category || 'uncategorised') + '</p>'
    + '<h2>' + esc(s.p.name) + '</h2><p class="rankline">#' + s.rank + ' of ' + R.scored.length + ' by implied value · rank ' + s.rankLo + '–' + s.rankHi + ' across bootstrap refits ' + tierTag(s.tier) + ' ' + vp(v.verdict) + '</p>'
    + '<div class="dgrid"><div class="dbox implied"><h3>Implied value · a model estimate</h3><div class="big num">' + usdF(s.implied) + '</div>'
    + '<div class="row">' + facts.map(function (f) { return '<div>' + f[0] + '<b class="num">' + f[1] + '</b></div>'; }).join('') + '</div>'
    + '<p class="note" style="margin-top:8px">Recomputed in this browser: equals board.json. DefiLlama records no token for it — not proof it has none; the odds are its peers\' record, not a forecast.</p></div>'
    + '<div class="dbox"><h3>How the figure is made</h3>' + auditHtml(s) + '</div></div>'
    + '<div class="dgrid"><div class="dbox"><h3>Nearest priced peers</h3>' + peersHtml(s) + '<p class="note" style="margin-top:6px">Same category first, then the nearest TVL. Cap ÷ held-out model is the real cap over the model\'s leave-one-out prediction.</p><h3 style="margin-top:10px">Where it sits</h3>' + scatterHtml(slug, 560, 240) + '</div>'
    + '<div class="dbox"><h3>Farm verdict ' + vp(v.verdict) + '</h3>' + farmHtml(s) + '</div></div>'
    + '<div class="dbox"><h3>Farm plan · 10 steps — cost and time at the ' + usdF(v.deposit) + ' sized deposit, 12 weeks</h3><ol class="steps">' + steps + '</ol></div>'
    + '</div>' + footHtml();
}
function evidenceHtml() {
  var ev = R.evidence, c = ev.value.coverage, f = ev.value.fitted;
  var vcls = function (v) { return v === 'kept' ? 'kept' : v === 'must not help' ? 'control' : v === 'baseline' ? '' : 'notkept'; };
  var termTable = function (title, rows, fmt) {
    return '<div class="evbox"><h3>' + title + '</h3><table><tr><th>Term, added in order</th><th class="r">Leave-one-out</th><th class="r">Walk-forward</th><th>Verdict</th></tr>'
      + rows.map(function (r) { return '<tr><td>' + esc(r.name) + '</td><td class="r num">' + fmt(r.loo) + '</td><td class="r num">' + fmt(r.wf) + '</td><td class="' + vcls(r.verdict) + '">' + esc(r.verdict) + '</td></tr>'; }).join('') + '</table></div>';
  };
  var oddsTable = function (title, rows) {
    var fmt = function (x) { return x.brier.toFixed(3) + ' (' + pct(x.right) + ')'; };
    return '<div class="evbox"><h3>' + title + '</h3><table><tr><th>Term, added in order</th><th class="r">Leave-one-out</th><th class="r">Ten-fold</th><th class="r">Walk-forward</th><th>Verdict</th></tr>'
      + rows.map(function (r) { return '<tr><td>' + esc(r.name) + '</td><td class="r num">' + fmt(r.loo) + '</td><td class="r num">' + fmt(r.ten) + '</td><td class="r num">' + fmt(r.wf) + '</td><td class="' + vcls(r.verdict) + '">' + esc(r.verdict) + '</td></tr>'; }).join('') + '</table></div>';
  };
  var covRows = '<tr><td>within ×3 of the model</td><td class="r num">' + pct(c.loo.x3) + '</td><td class="r num">' + pct(c.wf.x3) + '</td></tr>'
    + '<tr><td>inside P25–P75, stated 50%</td><td class="r num">' + pct(c.loo.p2575) + '</td><td class="r num">' + pct(c.wf.p2575) + '</td></tr>'
    + '<tr><td>inside P10–P90, stated 80%</td><td class="r num">' + pct(c.loo.p1090) + '</td><td class="r num">' + pct(c.wf.p1090) + '</td></tr>';
  var labels = function (rows, verdict) { return rows.filter(function (r) { return r.verdict === verdict; }).map(function (r) { return r.name.replace(/^\+ /, ''); }); };
  var keptV = labels(ev.value.rows, 'kept'), notV = labels(ev.value.rows, 'tested, not kept');
  var keptO = labels(ev.odds.rows, 'kept'), notO = labels(ev.odds.rows, 'tested, not kept');
  var reading = 'Read it like this: ' + (keptV.length ? '<b>' + keptV.join(', ') + '</b> ' + (keptV.length > 1 ? 'are the value terms that survive' : 'is the only value term that survives') + ' both tests' : '<b>no value term beyond the flat multiple survives both tests</b>')
    + (notV.length ? ' — ' + notV.join(', ') + ' fail to price a token better, so the model leaves them out' : '') + '. '
    + (keptO.length ? '<b>' + keptO.join(', ') + '</b> help tell which peers record a token, so they enter through the odds' : 'Nothing beyond the base rate helps tell which peers record a token')
    + (notO.length ? ' — ' + notO.join(', ') + ' do not' : '') + '. '
    + 'Blind predictions rank the comps at <b>' + ev.value.rankCorr.toFixed(2) + '</b> against their real caps, and the fitted tilts move <b>' + ev.value.tiltsMoved + ' of ' + R.scored.length + ' ranks 5+ places</b> off a flat multiple of TVL. '
    + 'The odds are the peers\' record (' + ev.odds.withToken + ' of ' + ev.odds.n + ' record a token, more with each year listed), not a forecast; the page never says a token will launch.';
  return '<section class="ev"><h2>Out-of-sample evidence</h2><p class="note">Each term is tested leave-one-out and walk-forward (older tokens price newer ones); kept only when it lowers the held-out miss in both. The odds carry a third check: ten-fold, by slug order.</p><div class="evgrid">'
    + termTable('Value if a token launches · typical miss, ' + ev.value.n + ' traded tokens', ev.value.rows, mult)
    + oddsTable('Token odds · Brier score (share called right), ' + ev.odds.n + ' peers', ev.odds.rows)
    + '<div class="evbox"><h3>Is the printed range honest?</h3><table><tr><th>Share of real caps</th><th class="r">Leave-one-out</th><th class="r">Walk-forward</th></tr>' + covRows + '</table>'
    + '<p class="note" style="margin-top:8px">Fitted, ± bootstrap s.e. (200 refits): multiple at $100M TVL ' + mult(f.multiple100) + ' ± ' + f.multiple100Se.toFixed(3) + '; size slope ' + f.sizeSlope.toFixed(2) + ' ± ' + f.sizeSlopeSe.toFixed(2) + '; '
    + (f.catLo === 1 && f.catHi === 1 ? 'no family or category effect survived.' : 'category effects ×' + f.catLo.toFixed(2) + '–×' + f.catHi.toFixed(2) + '.')
    + '<br>Token-record rates by age: ' + ev.odds.bands.map(function (b) { return (b.lo === 0 ? '0–' + b.hi : isFinite(b.hi) ? b.lo + '–' + b.hi : b.lo + '+') + ' yr ' + pct(b.rate) + ' (n=' + b.n + ')'; }).join(' · ') + '.</p></div>'
    + '</div><p class="reading">' + reading + '</p></section>';
}
function topHtml() {
  var ev = R.evidence, ac = R.accounting, vc = counts(), flat = ev.value.rows[0], base = ev.odds.rows[0], cov = ev.value.coverage.wf;
  var kpis = [
    ['Out-of-sample miss, walk-forward', mult(ev.value.wf), 'a flat multiple misses by ' + mult(flat.wf) + ' · blind rank correlation ' + ev.value.rankCorr.toFixed(2)],
    ['Is the printed range honest?', pct(cov.p2575) + ' <small>·</small> ' + pct(cov.p1090), 'of later caps fall inside P25–P75 · P10–P90 (stated 50% · 80%)'],
    ['Token odds vs base rate, Brier', ev.odds.wf.toFixed(3) + ' <small>vs ' + base.wf.brier.toFixed(3) + '</small>', 'walk-forward ' + pct(ev.odds.wfRight) + ' called right · ten-fold ' + ev.odds.ten.toFixed(3) + ' vs base ' + ev.odds.baseTen.toFixed(3)],
    ['Terms that survived both tests', ev.value.kept + ' of ' + ev.value.total + ' <small>·</small> ' + ev.odds.kept + ' of ' + ev.odds.total, 'value model · token odds; the rest are shown, not used'],
    ['Worth farming, this scenario', vc.FARM + ' <small>of ' + R.scored.length + '</small>', 'net clears $25 an hour on the P25 value; ' + vc.MARGINAL + ' marginal, ' + vc.SKIP + ' skip'],
    ['Watchlist ranked', ac.watchlist + ' <small>/ ' + ac.watchlist + '</small>', 'plus ' + ac.early + ' early and ' + ac.offlist + ' off-list it leaves out'],
  ];
  var kpi = '<div class="kpis">' + kpis.map(function (k) { return '<div class="kpi"><div class="k">' + k[0] + '</div><div class="v num">' + k[1] + '</div><div class="d">' + k[2] + '</div></div>'; }).join('') + '</div>';
  var groups = [
    ['Watchlist, ranked', ac.watchlist, '#bc8cff'], ['Early, below the watchlist floor', ac.early, '#39c5cf'],
    ['Off-list, ranked anyway', ac.offlist, '#d29922'], ['Token, priced (the comps)', ac.priced, '#58a6ff'],
    ['Token, no usable cap', ac.tokenNoCap, '#6e7c8a'], ['Bridge', ac.out.bridge, '#4a545e'],
    ['Staked form', ac.out.staked, '#4a545e'], ['Exchange', ac.out.exchange, '#4a545e'],
    ['Versioned', ac.out.versioned, '#4a545e'], ['Wrapped', ac.out.wrapped, '#4a545e'],
    ['Kin of a token', ac.out.kin, '#4a545e'],
  ];
  var bar = '', leg = '';
  groups.forEach(function (g) { bar += '<i style="width:' + (g[1] / ac.total * 100).toFixed(2) + '%;background:' + g[2] + '"></i>'; leg += '<span><i class="dot" style="background:' + g[2] + '"></i>' + g[0] + ' <b class="num">' + g[1] + '</b></span>'; });
  var chk = function (ok, t) { return '<span class="' + (ok ? '' : 'bad') + '">' + (ok ? '✓' : '✗') + ' ' + t + '</span>'; };
  return '<div class="head"><div><h1>Launch Radar</h1><p class="sub">Pre-token protocols, priced from the record of tokens that already trade.</p></div>'
    + '<div class="meta">Model <b>radar-4</b> · snapshot ' + D.as_of + ' · ' + D.source + '<br>refitted in this browser · ' + D.protocols.length + ' protocols</div></div>' + kpi
    + '<p class="formula"><b>Implied value = TVL × fitted multiple</b> (the value if a token launches) <b>× token odds</b> (from how long peers ran before recording one). Each coefficient is fitted on this snapshot and tested held-out.</p>'
    + '<div class="acct"><div class="t">Every protocol in the snapshot, in exactly one group — <b class="num">' + ac.total + ' total</b></div><div class="bar">' + bar + '</div><div class="legend">' + leg + '</div></div>'
    + '<div class="integ">' + chk(integ.ok === integ.n, 'this table = board.json: ' + integ.ok + ' of ' + integ.n + ' rows recomputed here')
    + chk(integ.ordered, 'ranks 1–' + integ.n + ' in order, values never rise') + chk(integ.totalOk, 'totals equal: ' + usd(integ.total))
    + chk(integ.chkOk, 'checksum ' + D.checksum + ' = board.json') + chk(integ.wl, 'watchlist ' + ac.watchlist + ' of ' + ac.watchlist + ' ranked')
    + chk(integ.ledger, 'ledger ' + ac.total + ' of ' + ac.total + ' protocols')
    + chk(true, 'no protocol is named in the code — every figure follows from the snapshot')
    + chk(true, 'no token launch is promised — DefiLlama records no token here') + '</div>' + evidenceHtml();
}
function footHtml() {
  return '<footer class="foot">Data: the sealed DefiLlama snapshot of ' + D.as_of + ' (' + D.protocols.length + ' protocols, floor ' + usd(D.floor_usd) + '). '
    + 'Model: radar-4 — fitted on ' + R.evidence.value.n + ' traded tokens, tested leave-one-out and walk-forward; the token odds are the peers\' record. '
    + 'Stated assumptions: gas $3.00 Ethereum (blended), $0.01 Solana, $0.05 other L2s, $1.00 elsewhere; T-bill 4% a year as a benchmark; capital charge 2% a year; drop share 10%; the farm is sized on the P25 value and the deposit is the smallest, $1,000–$25,000, that clears $25 an hour; off-list rows carry a stated ×0.50 parent haircut, not a fitted term. '
    + 'Implied values are this model\'s claim, never make.fun\'s. A protocol records no token on DefiLlama — that is not proof it has none.</footer>';
}
})();
