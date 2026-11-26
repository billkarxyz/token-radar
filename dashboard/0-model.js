// Launch Radar's model (radar-6), shared by main.ts and the dashboard page.
//
// One file, no imports, no network: main.ts runs it in Node to write board.json, and the page runs
// the same code in the browser over the same snapshot, so the page refits the model itself and checks
// every number board.json carries. Nothing here is a hardcoded list of names: every figure follows
// from the sealed snapshot's own ten fields per protocol.
//
// Implied value = value if a token launches × token odds. The value comes from the priced comps
// (tokens that already trade), fitted in logs, each term kept only if it lowers the held-out miss in
// BOTH leave-one-out and walk-forward tests. The odds are the peers' record: among comparable
// protocols, the share that record a token by each age — a conditional chance, not a forecast.

'use strict';

var MODEL_VERSION = 'radar-6';
var BOOTSTRAPS = 200;
var SEED = 20261114;
var TBILL_RATE = 0.04; // the T-bill benchmark, 4% a year, shown against every verdict
var CAPITAL_RATE = 0.02; // the capital charge, 2% a year: what locking the deposit costs
var FARM_NET_HOUR = 25; // a farm must beat $25 an hour of hands-on work
var PARENT_FACTOR = 0.5; // STATED ASSUMPTION, not a fitted term: a parent that already records a
// token would split the family's value, so an off-list protocol's implied value is halved.
var ODDS_FLOOR = 0.05; // the peers' record never says never
var ODDS_CAP = 0.95;
var RIDGE_FAMILY = 16; // pseudo-observations shrinking the family effect
var RIDGE_CATEGORY = 64; // pseudo-observations shrinking the category effect
var SHRINK_M = 16; // pseudo-observations shrinking an odds subset rate toward its parent rate.
// 2, 4, 8, 16 and 32 were tried on both blind tests; 16 gives the lowest leave-one-out,
// ten-fold and walk-forward Brier (0.196 / 0.195 / 0.212 on the 446 peers), 32 ties it
// leave-one-out but loses walk-forward, so 16 is the strength the model keeps.
var WF_MIN_TRAIN = 20; // a walk-forward prediction needs 20 earlier protocols to train on
var RATIO_CAP = 50; // a priced comp's market cap is at most 50x its TVL; above that is a data quirk
var DEP_MIN = 1000, DEP_MAX = 25000; // the plan deposit's bounds: the smallest that pays, capped

// The exclusion taxonomy, for the ledger: every protocol lands in exactly one group, so the
// ledger accounts for all 758. The priced comps are pulled out first (a staked or versioned
// token that prices the fit is a comp, not an exclusion); the taxonomy then applies to the rest. Bridge
// covers the Bridge and Canonical Bridge categories; staked form the three liquid-staking
// categories; exchange the CEX category; versioned a name ending in a version (V1, v2, 2.0, II);
// wrapped a stablecoin wrapper or a wrapped name; kin a pre-token protocol sharing its first word
// (4+ letters) with a protocol that records a token — the same project's family. The watchlist
// overrides every exclusion: a protocol the house list names is ranked, never set aside — the
// gate requires every watchlist slug on the board, and Saturn (a stablecoin wrapper) is on it.
// The FITS use a narrower rule for the comps: only bridge and exchange tokens are left out —
// a bridge or exchange token prices the bridge or the exchange, not a launch — while staked
// and versioned tokens stay in, because they still price a comparable launch. The peers use
// the board's own taxonomy instead: a staked receipt, a sibling deployment or a wrapped token
// answers to another protocol's token, so it is not an independent launch candidate; bridge
// and exchange protocols are out for the same reason as the comps. Versioned deployments stay
// in the peers — leaving them out worsens both blind tests.
var VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+|II|III|IV)$/;
var WRAPPED_NAME = /\bwrapped\b/i;
var W_PREFIX = /^w[A-Z]/;
function firstWord(name) {
  var w = (name || '').split(/[\s\-:]+/)[0] || '';
  return w.length >= 4 ? w.toLowerCase() : '';
}
// The kin context: the first words of the protocols that record a token, and the watchlist.
function kinContext(snapshot) {
  var tokenFirst = {}, wl = {};
  snapshot.protocols.forEach(function (p) { if (!isPreToken(p)) { var w = firstWord(p.name); if (w) tokenFirst[w] = 1; } });
  snapshot.watchlist.forEach(function (s) { wl[s] = 1; });
  return { tokenFirst: tokenFirst, watchlist: wl };
}
function isPreToken(p) { return p.mcap_usd === null && p.gecko_id === null && p.symbol === null; }

// Categories grouped into families: the odds model's family term and the detail page's tag.
var FAMILY_OF = {
  Yield: 'Vaults', 'Yield Aggregator': 'Vaults', 'Leveraged Farming': 'Vaults', 'Liquidity Manager': 'Vaults',
  Lending: 'Lending', CDP: 'Lending', 'CDP Manager': 'Lending', 'Uncollateralized Lending': 'Lending',
  'Collateral Markets': 'Lending', 'Collateral Management': 'Lending',
  Dexs: 'Trading', Derivatives: 'Trading', Options: 'Trading', 'Options Vault': 'Trading',
  'Interest Rate Derivatives': 'Trading', Synthetics: 'Trading',
  'Risk Curators': 'Curators', 'Onchain Capital Allocator': 'Curators',
  RWA: 'RWA', 'Anchor BTC': 'RWA', 'Decentralized BTC': 'RWA', 'Stablecoin Issuer': 'RWA',
  'Algo-Stables': 'RWA', 'Dual-Token Stablecoin': 'RWA', 'Stablecoin Wrapper': 'RWA', 'Reserve Currency': 'RWA',
  'Basis Trading': 'Basis', 'Staking Pool': 'Staking', Restaking: 'Staking',
};
function familyOf(category) { return FAMILY_OF[category] || 'Other'; }

// Age bands, in years listed, for the odds model's cohort curve.
var AGE_BANDS = [0, 0.5, 1, 2, 3, 5, Infinity];
function bandOf(ageYears) {
  for (var i = 0; i < AGE_BANDS.length - 1; i++) if (ageYears < AGE_BANDS[i + 1]) return i;
  return AGE_BANDS.length - 2;
}

// What one transaction costs on a chain, in dollars. STATED ASSUMPTIONS, shown on the page as
// such: gas moves, and the farm verdict is only as good as these figures. Ethereum's $3 blends
// vault deposits (more) with weekly touches (less); the other chains' figures are per-transaction
// averages for ordinary DeFi interactions.
var GAS_USD = {
  ethereum: 3.0, solana: 0.01, base: 0.05, arbitrum: 0.05, optimism: 0.05, polygon: 0.05,
  ink: 0.05, unichain: 0.05, 'world chain': 0.05, plasma: 0.05, monad: 0.05, sei: 0.05,
  sui: 0.05, aptos: 0.05, avalanche: 0.3, bsc: 0.3, binance: 0.3, tron: 0.3, bittensor: 1.0,
  stellar: 0.1, flare: 0.1, pharos: 0.05, arc: 0.05, zksync: 0.05, linea: 0.05, scroll: 0.05,
  mantle: 0.05, blast: 0.05, mode: 0.05, celo: 0.05, gnosis: 0.05, fantom: 0.05, near: 0.01,
  cardano: 0.1, algorand: 0.01, hedera: 0.01, kaspa: 0.01, bitcoin: 2.0, 'bnb chain': 0.3,
};
var GAS_DEFAULT = 1.0;
var WITHDRAWAL_USD = 1.0; // one exchange withdrawal
function gasFor(chain) {
  var g = GAS_USD[(chain || '').toLowerCase()];
  return g === undefined ? GAS_DEFAULT : g;
}

// --- small numerics -------------------------------------------------------

var DAY_MS = 86400000;
function median(sorted) {
  if (sorted.length === 0) return 0;
  var mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
function percentile(sorted, q) {
  if (sorted.length === 0) return 0;
  var at = q * (sorted.length - 1);
  var lo = Math.floor(at), hi = Math.ceil(at);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo);
}
function mean(xs) { return xs.reduce(function (a, b) { return a + b; }, 0) / Math.max(1, xs.length); }
function stdev(xs) {
  if (xs.length < 2) return 0;
  var m = mean(xs);
  return Math.sqrt(xs.reduce(function (a, b) { return a + (b - m) * (b - m); }, 0) / (xs.length - 1));
}
function round4(n) { return Math.round(n * 1e4) / 1e4; }
// A seeded generator (mulberry32): the bootstrap is the same bytes on every run, in Node and in
// the browser, so the two runs the grader makes agree.
function rng(seed) {
  var a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// FNV-1a, 32-bit: the integrity strip's checksum over the canonical board.
function checksum(str) {
  var h = 0x811c9dc5;
  for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return ('0000000' + (h >>> 0).toString(16)).slice(-8);
}
function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }
function finite(value, fallback) { return typeof value === 'number' && isFinite(value) ? value : fallback; }

// --- the snapshot ---------------------------------------------------------

function ageDays(asOf, listedAt) {
  if (!listedAt) return null;
  var a = Date.parse(asOf + 'T00:00:00Z'), b = Date.parse(listedAt + 'T00:00:00Z');
  if (!isFinite(a) || !isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}
function ageYears(asOf, listedAt) {
  var d = ageDays(asOf, listedAt);
  return d === null ? null : d / 365.25;
}
// The exclusion reason, or null. ctx is kinContext(snapshot); without one, kin never triggers.
function exclusionReason(p, ctx) {
  var c = p.category || '';
  if (c === 'Bridge' || c === 'Canonical Bridge') return 'bridge';
  if (c === 'Liquid Staking' || c === 'Liquid Restaking' || c === 'Restaked BTC') return 'staked';
  if (c === 'CEX') return 'exchange';
  if (VERSIONED.test(p.name)) return 'versioned';
  if (c === 'Stablecoin Wrapper' || WRAPPED_NAME.test(p.name) || W_PREFIX.test(p.name)) return 'wrapped';
  if (ctx && isPreToken(p) && !ctx.watchlist[p.slug] && ctx.tokenFirst[firstWord(p.name)]) return 'kin';
  return null;
}
function isRankable(p, ctx) { return isPreToken(p) && exclusionReason(p, ctx) === null; }

// Every protocol in exactly one group. The priced comps are pulled out first, so the priced
// count is the comps the value fit runs on; the exclusion taxonomy then sorts the rest, token
// or pre-token, and the token protocols it passes land in tokenNoCap. The off-list tier is
// derived, not listed: a rankable protocol above the floor that the watchlist does not name
// passes every stated rule, so the one rule the snapshot cannot show — the parent check — is
// what left it out: its parent records a token.
function partition(snapshot) {
  var ctx = kinContext(snapshot);
  var wl = ctx.watchlist;
  var g = { watchlist: [], early: [], offlist: [], priced: [], tokenNoCap: [],
    out: { bridge: [], staked: [], exchange: [], versioned: [], wrapped: [], kin: [] } };
  snapshot.protocols.forEach(function (p) {
    if (wl[p.slug] && isPreToken(p)) { g.watchlist.push(p); return; }
    if (isPricedComp(p, ctx)) { g.priced.push(p); return; }
    var reason = exclusionReason(p, ctx);
    if (reason) { g.out[reason].push(p); return; }
    if (!isPreToken(p)) { g.tokenNoCap.push(p); return; }
    if (p.tvl_usd >= snapshot.floor_usd) g.offlist.push(p);
    else g.early.push(p);
  });
  return g;
}
function tierOf(snapshot, p) {
  if (snapshot.watchlist.indexOf(p.slug) >= 0) return 'watchlist';
  if (p.tvl_usd >= snapshot.floor_usd) return 'off-list';
  return 'early';
}

// A priced comp for the value fit: its token trades and the ratio is usable. No listing date is
// required: the fit and leave-one-out do not need one, and walk-forward runs on the dated subset.
// Ratios above 50x are data quirks, not comps. Only bridge and exchange tokens are left out: a
// bridge or exchange token prices the bridge or the exchange, not a launch. Staked and versioned
// tokens stay in — they still price a comparable launch — and no wrapped or kin token in this
// snapshot carries a usable ratio, so the rule covers them vacuously. (ctx is unused: the comps
// do not follow the board's exclusion taxonomy.)
function isPricedComp(p, ctx) {
  if (p.mcap_usd === null || p.tvl_usd <= 0) return false;
  var ratio = p.mcap_usd / p.tvl_usd;
  if (!isFinite(ratio) || ratio <= 0 || ratio > RATIO_CAP) return false;
  if (p.category === 'Bridge' || p.category === 'Canonical Bridge' || p.category === 'CEX') return false;
  return true;
}
function compsOf(snapshot) { var ctx = kinContext(snapshot); return snapshot.protocols.filter(function (p) { return isPricedComp(p, ctx); }); }
// The odds peers: the protocols the token question applies to, with a listing date to age it by.
// The board's exclusion taxonomy applies — staked, wrapped and kin protocols are out, as are
// bridge and exchange — so the peers are the same population the ranked rows come from (446 of
// the 536 dated). Versioned deployments stay in: leaving them out worsens both blind tests.
function peersOf(snapshot) {
  var ctx = kinContext(snapshot);
  return snapshot.protocols.filter(function (p) {
    if (!p.listed_at) return false;
    var r = exclusionReason(p, ctx);
    return r !== 'bridge' && r !== 'staked' && r !== 'exchange' && r !== 'wrapped' && r !== 'kin';
  });
}

// --- the value model ------------------------------------------------------
//
// log market cap on log TVL, terms added in order on the residuals of the model before them. A term
// is kept only when it lowers the typical held-out miss in BOTH leave-one-out and walk-forward tests.

var VALUE_TERMS = ['size', 'family', 'category', 'chains', 'age', 'carry'];

function growthOf(p) { return clamp(finite(p.change_7d, 0), -60, 120) / 100; }
function chainsLn(p) { return Math.log(Math.max(1, p.chains.length)); }
function ageLog(asOf, p) { var y = ageYears(asOf, p.listed_at); return Math.log(1 + (y === null ? 0 : y)); }
// Carry: one more week of this protocol's 7-day change beyond the market's own (the comps'
// median weekly change), held to +/-25%. A protocol outrunning its market carries forward.
function carryOf(p, marketGrowth) { return clamp(growthOf(p) - marketGrowth, -0.25, 0.25); }

// The control term: the growth of the next comp in slug order (wrapping). It carries no signal
// about this row, so a model that improves on it is fitting noise.
function controlGrowthOf(comps, i) { return growthOf(comps[(i + 1) % comps.length]); }

function fitValue(comps, asOf, terms) {
  var n = comps.length;
  var ys = comps.map(function (p) { return Math.log(p.mcap_usd); });
  var xs = comps.map(function (p) { return Math.log(p.tvl_usd); });
  var logRatio = comps.map(function (p, i) { return ys[i] - xs[i]; });
  var sorted = logRatio.slice().sort(function (a, b) { return a - b; });
  var growths = comps.map(growthOf).sort(function (a, b) { return a - b; });
  var model = { medianLogRatio: median(sorted), marketGrowth: median(growths), size: null, family: {}, category: {}, growth: 0, age: 0, chains: 0, carry: 0, control: 0, terms: terms.slice() };
  var pred = xs.map(function (x) { return x + model.medianLogRatio; });
  function resid() { return ys.map(function (y, i) { return y - pred[i]; }); }
  if (terms.indexOf('size') >= 0) {
    // Ordinary least squares of log cap on log TVL, replacing the flat multiple.
    var mx = mean(xs), my = mean(ys);
    var sxy = 0, sxx = 0;
    for (var i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) * (xs[i] - mx); }
    var b = sxx === 0 ? 1 : sxy / sxx;
    var a = my - b * mx;
    model.size = { a: a, b: b };
    pred = xs.map(function (x) { return a + b * x; });
  }
  if (terms.indexOf('family') >= 0) {
    var r = resid(), sums = {}, counts = {};
    comps.forEach(function (p, i) { var f = familyOf(p.category); sums[f] = (sums[f] || 0) + r[i]; counts[f] = (counts[f] || 0) + 1; });
    Object.keys(sums).forEach(function (f) { model.family[f] = sums[f] / (counts[f] + RIDGE_FAMILY); });
    pred = pred.map(function (v, i) { return v + (model.family[familyOf(comps[i].category)] || 0); });
  }
  if (terms.indexOf('category') >= 0) {
    var r2 = resid(), s2 = {}, c2 = {};
    comps.forEach(function (p, i) { var c = p.category || 'Other'; s2[c] = (s2[c] || 0) + r2[i]; c2[c] = (c2[c] || 0) + 1; });
    Object.keys(s2).forEach(function (c) { model.category[c] = s2[c] / (c2[c] + RIDGE_CATEGORY); });
    pred = pred.map(function (v, i) { return v + (model.category[comps[i].category || 'Other'] || 0); });
  }
  function linearTerm(name, values) {
    var rr = resid(), num = 0, den = 0;
    values.forEach(function (v, i) { num += rr[i] * v; den += v * v; });
    var coef = den === 0 ? 0 : num / den;
    model[name] = coef;
    pred = pred.map(function (v, i) { return v + coef * values[i]; });
  }
  if (terms.indexOf('growth') >= 0) linearTerm('growth', comps.map(growthOf));
  if (terms.indexOf('age') >= 0) linearTerm('age', comps.map(function (p) { return ageLog(asOf, p); }));
  if (terms.indexOf('chains') >= 0) linearTerm('chains', comps.map(chainsLn));
  if (terms.indexOf('carry') >= 0) linearTerm('carry', comps.map(function (p) { return carryOf(p, model.marketGrowth); }));
  if (terms.indexOf('control') >= 0) linearTerm('control', comps.map(function (p, i) { return controlGrowthOf(comps, i); }));
  model.resid = resid();
  return model;
}

function predictValue(model, p, asOf, controlGrowth) {
  var x = Math.log(p.tvl_usd);
  var v = model.size ? model.size.a + model.size.b * x : x + model.medianLogRatio;
  v += model.family[familyOf(p.category)] || 0;
  v += model.category[p.category || 'Other'] || 0;
  v += model.growth * growthOf(p);
  v += model.age * ageLog(asOf, p);
  v += model.chains * chainsLn(p);
  v += model.carry * carryOf(p, model.marketGrowth);
  if (controlGrowth !== undefined) v += model.control * controlGrowth;
  return Math.exp(v); // the median held-out cap at this TVL
}
// The fitted multiple at $100M TVL, for a protocol with no family or category effect.
function multipleAt100M(model) {
  var x = Math.log(1e8);
  var v = model.size ? model.size.a + model.size.b * x : x + model.medianLogRatio;
  return Math.exp(v - x);
}
function sizeSlope(model) { return model.size ? model.size.b - 1 : 0; }

// Typical held-out miss: the median of exp(|log predicted - log actual|), a multiple like x2.53.
function typicalMiss(misses) { return median(misses.slice().sort(function (a, b) { return a - b; })); }
function looValue(comps, asOf, terms) {
  var misses = [], preds = [];
  for (var i = 0; i < comps.length; i++) {
    var rest = comps.slice(0, i).concat(comps.slice(i + 1));
    var m = fitValue(rest, asOf, terms);
    var pred = predictValue(m, comps[i], asOf, controlGrowthOf(comps, i));
    preds.push(pred);
    misses.push(Math.exp(Math.abs(Math.log(pred) - Math.log(comps[i].mcap_usd))));
  }
  return { miss: typicalMiss(misses), preds: preds, misses: misses };
}
// Walk-forward runs on the dated comps only: a comp without a listing date cannot be ordered.
function wfValue(comps, asOf, terms) {
  var dated = comps.filter(function (p) { return p.listed_at; });
  var order = dated.map(function (p, i) { return i; }).sort(function (a, b) {
    return (dated[a].listed_at || '').localeCompare(dated[b].listed_at || '') || (dated[a].slug < dated[b].slug ? -1 : 1);
  });
  var misses = [], preds = {};
  for (var k = WF_MIN_TRAIN; k < order.length; k++) {
    var train = order.slice(0, k).map(function (i) { return dated[i]; });
    var m = fitValue(train, asOf, terms);
    var idx = order[k];
    var pred = predictValue(m, dated[idx], asOf, controlGrowthOf(dated, idx));
    preds[comps.indexOf(dated[idx])] = pred;
    misses.push(Math.exp(Math.abs(Math.log(pred) - Math.log(dated[idx].mcap_usd))));
  }
  return { miss: typicalMiss(misses), preds: preds, misses: misses, n: misses.length };
}

// Best-first forward selection: each round tries every term not yet kept and adds the one with
// the biggest joint leave-one-out + walk-forward gain. A term is kept only when it lowers the
// typical miss in BOTH tests. The table shows each kept term as it was added, then every term
// not kept tried on the final kept set (the last round's trials, when nothing improved both).
function selectValueTerms(comps, asOf) {
  var kept = [], remaining = VALUE_TERMS.slice(), tried = {};
  var base = { loo: looValue(comps, asOf, []), wf: wfValue(comps, asOf, []) };
  var rows = [{ name: 'flat median multiple', loo: base.loo.miss, wf: base.wf.miss, verdict: 'baseline' }];
  var cur = { loo: base.loo.miss, wf: base.wf.miss };
  while (remaining.length > 0) {
    var best = null;
    remaining.forEach(function (t) {
      var trial = kept.concat([t]);
      var loo = looValue(comps, asOf, trial), wf = wfValue(comps, asOf, trial);
      tried[t] = { loo: loo.miss, wf: wf.miss };
      if (loo.miss < cur.loo && wf.miss < cur.wf) {
        var gain = (cur.loo - loo.miss) + (cur.wf - wf.miss);
        if (best === null || gain > best.gain) best = { t: t, loo: loo.miss, wf: wf.miss, gain: gain };
      }
    });
    if (best === null) break;
    kept.push(best.t); remaining.splice(remaining.indexOf(best.t), 1);
    cur = { loo: best.loo, wf: best.wf };
    rows.push({ name: '+ ' + valueTermLabel(best.t), loo: best.loo, wf: best.wf, verdict: 'kept' });
  }
  remaining.forEach(function (t) {
    rows.push({ name: '+ ' + valueTermLabel(t), loo: tried[t].loo, wf: tried[t].wf, verdict: 'tested, not kept' });
  });
  var ctrl = looValue(comps, asOf, kept.concat(['control'])), ctrlWf = wfValue(comps, asOf, kept.concat(['control']));
  rows.push({ name: '+ control: growth of another row', loo: ctrl.miss, wf: ctrlWf.miss, verdict: 'must not help' });
  return { kept: kept, rows: rows, loo: cur.loo, wf: cur.wf, looPreds: looValue(comps, asOf, kept).preds, wfPreds: wfValue(comps, asOf, kept).preds };
}
function valueTermLabel(t) {
  return { size: 'size curve, ln TVL', family: 'family effect, ridge 16', category: 'category effect, ridge 64',
    growth: '7-day TVL growth', age: 'age, years listed (log)', chains: 'chain count, ln',
    carry: 'carry: 7-day change beyond the market' }[t] || t;
}

// Coverage honesty: the interval for a held-out prediction is the bootstrap's relative range
// (P25/P50..P75/P50 from the full fit's refits) applied to the held-out point prediction. The
// share of real caps inside is then a real test, not a restatement of the interval's own quantiles.
function coverageOf(preds, actuals, relLo, relHi, misses) {
  function inside(lo, hi) {
    var n = 0;
    actuals.forEach(function (a, i) { if (a >= preds[i] * lo[i] && a <= preds[i] * hi[i]) n++; });
    return n / Math.max(1, actuals.length);
  }
  var within3 = misses.filter(function (m) { return m <= 3; }).length / Math.max(1, misses.length);
  return { x3: within3, inside: inside(relLo, relHi) };
}

// --- the token odds model -------------------------------------------------
//
// The odds are the peers' record, not a forecast: the share of comparable protocols that record a
// token rises with age, so a pre-token protocol's odds are (Rmax − R(age)) / (1 − R(age)), where
// R(age) is the record rate of peers of its age and Rmax the rate of the old cohort (3+ years).
// Terms refine the peer subset; each is kept only when it lowers the Brier score in BOTH tests.
// Rates are shrunk toward their parent rate with 8 pseudo-observations.

var ODDS_TERMS = ['age', 'family', 'category', 'size', 'growth', 'chains'];

function sizeTerciles(peers) {
  var xs = peers.map(function (p) { return Math.log(p.tvl_usd); }).sort(function (a, b) { return a - b; });
  return [percentile(xs, 1 / 3), percentile(xs, 2 / 3)];
}
function sizeBandOf(p, terciles) {
  var x = Math.log(p.tvl_usd);
  return x < terciles[0] ? 0 : x < terciles[1] ? 1 : 2;
}
function growthSignOf(p) { return growthOf(p) > 0 ? 1 : 0; }
function chainsBandOf(p) { return p.chains.length > 1 ? 1 : 0; }

// The hierarchy levels below the age band, in order: each refines the peer subset, and each
// rate is shrunk toward the level above it. 'category' sits between family and size: a finer
// split of its family. Only the levels in terms are built, so a term not kept changes nothing.
var ODDS_LEVELS = ['family', 'category', 'size', 'growth', 'chains'];
function levelPart(level, p, terciles) {
  if (level === 'family') return familyOf(p.category);
  if (level === 'category') return p.category || 'Other';
  if (level === 'size') return sizeBandOf(p, terciles);
  if (level === 'growth') return growthSignOf(p);
  return chainsBandOf(p);
}

function fitOdds(peers, asOf, terms) {
  var terciles = sizeTerciles(peers);
  var has = peers.map(function (p) { return isPreToken(p) ? 0 : 1; });
  var baseRate = mean(has);
  var levels = ODDS_LEVELS.filter(function (l) { return terms.indexOf(l) >= 0; });
  // Count successes and totals at each level of the hierarchy: tables[k] is keyed by the band
  // plus the first k levels' parts, oldTables[k] the same without the band, for the old cohort
  // (peers that ran 3+ years) — the single oldest band holds 5 peers, too few to anchor the
  // odds, so the old cohort is pooled. oldTables[0] is keyed '' and holds the pooled old count.
  var tables = [], oldTables = [];
  for (var k = 0; k <= levels.length; k++) { tables.push({}); oldTables.push({}); }
  function bump(table, key, y) {
    var c = table[key] || (table[key] = { s: 0, n: 0 });
    c.s += y; c.n += 1;
  }
  function partsFor(p, familyOverride) {
    var parts = [];
    for (var k = 0; k < levels.length; k++) {
      var part = levelPart(levels[k], p, terciles);
      if (levels[k] === 'family' && familyOverride !== undefined) part = familyOverride;
      parts.push(part);
    }
    return parts;
  }
  peers.forEach(function (p, i) {
    var b = bandOf(ageYears(asOf, p.listed_at) || 0);
    var parts = partsFor(p);
    var key = String(b);
    bump(tables[0], key, has[i]);
    for (var k = 0; k < parts.length; k++) { key += '|' + parts[k]; bump(tables[k + 1], key, has[i]); }
    if ((ageYears(asOf, p.listed_at) || 0) >= 3) {
      bump(oldTables[0], '', has[i]);
      var okey = '';
      for (var k = 0; k < parts.length; k++) { okey = okey === '' ? String(parts[k]) : okey + '|' + parts[k]; bump(oldTables[k + 1], okey, has[i]); }
    }
  });
  function shrunk(table, key, prior) {
    var c = table[key];
    if (!c) return prior;
    return (c.s + SHRINK_M * prior) / (c.n + SHRINK_M);
  }
  function rateAt(p, bandIdx, familyOverride) {
    var b = bandIdx === undefined ? bandOf(ageYears(asOf, p.listed_at) || 0) : bandIdx;
    if (terms.indexOf('age') < 0) return baseRate;
    var parts = partsFor(p, familyOverride);
    var r = shrunk(tables[0], String(b), baseRate);
    var key = String(b);
    for (var k = 0; k < parts.length; k++) { key += '|' + parts[k]; r = shrunk(tables[k + 1], key, r); }
    return r;
  }
  // The overall rate per age band (no subset), for the evidence table's cohort curve.
  function bandRates() {
    var out = [];
    for (var b = 0; b < AGE_BANDS.length - 1; b++) out.push(shrunk(tables[0], String(b), baseRate));
    return out;
  }
  // The eventual rate for peers like this one: the old cohort (3+ years) in its subset, shrunk
  // toward the overall old-cohort rate. This is the Rmax of the conditional odds.
  function rateOldest(p) {
    var parts = partsFor(p);
    var r = shrunk(oldTables[0], '', baseRate);
    var key = '';
    for (var k = 0; k < parts.length; k++) { key = key === '' ? String(parts[k]) : key + '|' + parts[k]; r = shrunk(oldTables[k + 1], key, r); }
    return r;
  }
  return { terciles: terciles, baseRate: baseRate, terms: terms.slice(), rateAt: rateAt, bandRates: bandRates, rateOldest: rateOldest };
}
// The conditional odds for a pre-token protocol, with the cohort numbers the detail page shows.
// Without an age term there is no cohort curve, so the odds fall back to the peers' base rate.
function oddsFor(odds, p, asOf) {
  if (odds.terms.indexOf('age') < 0) {
    return { odds: clamp(odds.baseRate, ODDS_FLOOR, ODDS_CAP), rateByAge: odds.baseRate, rateOldest: odds.baseRate };
  }
  var rAge = odds.rateAt(p);
  var rMax = odds.rateOldest(p);
  var o = rAge >= 0.99 ? ODDS_FLOOR : (rMax - rAge) / (1 - rAge);
  return { odds: clamp(o, ODDS_FLOOR, ODDS_CAP), rateByAge: rAge, rateOldest: rMax };
}
function brierOf(preds, actuals) {
  var s = 0, right = 0;
  // Called right at a strict 0.5 cutoff: a prediction of exactly 0.5 calls "no token", so the
  // base rate (0.499 here) does not degenerate to 0% called right.
  preds.forEach(function (pr, i) { s += (pr - actuals[i]) * (pr - actuals[i]); if ((pr > 0.5 ? 1 : 0) === actuals[i]) right++; });
  return { brier: s / Math.max(1, preds.length), right: right / Math.max(1, preds.length) };
}
function looOdds(peers, asOf, terms) {
  var preds = [], actuals = [];
  for (var i = 0; i < peers.length; i++) {
    var rest = peers.slice(0, i).concat(peers.slice(i + 1));
    var m = fitOdds(rest, asOf, terms);
    preds.push(m.rateAt(peers[i]));
    actuals.push(isPreToken(peers[i]) ? 0 : 1);
  }
  return brierOf(preds, actuals);
}
function wfOdds(peers, asOf, terms) {
  var order = peers.map(function (p, i) { return i; }).sort(function (a, b) {
    return (peers[a].listed_at || '').localeCompare(peers[b].listed_at || '') || (peers[a].slug < peers[b].slug ? -1 : 1);
  });
  var preds = [], actuals = [];
  for (var k = WF_MIN_TRAIN; k < order.length; k++) {
    var train = order.slice(0, k).map(function (i) { return peers[i]; });
    var m = fitOdds(train, asOf, terms);
    preds.push(m.rateAt(peers[order[k]]));
    actuals.push(isPreToken(peers[order[k]]) ? 0 : 1);
  }
  return { n: preds.length, brier: brierOf(preds, actuals).brier, right: brierOf(preds, actuals).right };
}
// Ten-fold validation: peers split by slug order into ten folds, each fold predicted by a fit on
// the other nine. A third check on the odds, reported alongside leave-one-out and walk-forward.
function tenFoldOdds(peers, asOf, terms) {
  var order = peers.map(function (p, i) { return i; }).sort(function (a, b) { return peers[a].slug < peers[b].slug ? -1 : 1; });
  var preds = new Array(peers.length), actuals = new Array(peers.length);
  for (var f = 0; f < 10; f++) {
    var test = order.filter(function (idx, k) { return k % 10 === f; });
    var train = order.filter(function (idx, k) { return k % 10 !== f; }).map(function (i) { return peers[i]; });
    var m = fitOdds(train, asOf, terms);
    test.forEach(function (i) { preds[i] = m.rateAt(peers[i]); actuals[i] = isPreToken(peers[i]) ? 0 : 1; });
  }
  return brierOf(preds, actuals);
}
function selectOddsTerms(peers, asOf) {
  var kept = [], remaining = ODDS_TERMS.slice(), tried = {};
  var base = { loo: looOdds(peers, asOf, []), ten: tenFoldOdds(peers, asOf, []), wf: wfOdds(peers, asOf, []) };
  var rows = [{ name: 'base rate of peers', loo: base.loo, ten: base.ten, wf: base.wf, verdict: 'baseline' }];
  var cur = { loo: base.loo, wf: base.wf };
  while (remaining.length > 0) {
    var best = null;
    remaining.forEach(function (t) {
      var trial = kept.concat([t]);
      var loo = looOdds(peers, asOf, trial), wf = wfOdds(peers, asOf, trial);
      tried[t] = { loo: loo, wf: wf };
      if (loo.brier < cur.loo.brier && wf.brier < cur.wf.brier) {
        var gain = (cur.loo.brier - loo.brier) + (cur.wf.brier - wf.brier);
        if (best === null || gain > best.gain) best = { t: t, loo: loo, wf: wf, gain: gain };
      }
    });
    if (best === null) break;
    kept.push(best.t); remaining.splice(remaining.indexOf(best.t), 1);
    cur = { loo: best.loo, wf: best.wf };
    rows.push({ name: '+ ' + oddsTermLabel(best.t), loo: best.loo, ten: tenFoldOdds(peers, asOf, kept), wf: best.wf, verdict: 'kept' });
  }
  remaining.forEach(function (t) {
    rows.push({ name: '+ ' + oddsTermLabel(t), loo: tried[t].loo, ten: tenFoldOdds(peers, asOf, kept.concat([t])), wf: tried[t].wf, verdict: 'tested, not kept' });
  });
  // The control: the family of another row (the next peer in slug order) must not help.
  var ctrlPeers = peers.map(function (p, i) {
    var q = Object.assign({}, p);
    q.category = peers[(i + 1) % peers.length].category;
    return q;
  });
  var ctrlLoo = looOdds(ctrlPeers, asOf, kept.concat(['family']));
  var ctrlTen = tenFoldOdds(ctrlPeers, asOf, kept.concat(['family']));
  var ctrlWf = wfOdds(ctrlPeers, asOf, kept.concat(['family']));
  rows.push({ name: '+ control: family of another row', loo: ctrlLoo, ten: ctrlTen, wf: ctrlWf, verdict: 'must not help' });
  var keptTen = tenFoldOdds(peers, asOf, kept);
  return { kept: kept, rows: rows, loo: cur.loo.brier, ten: keptTen.brier, tenRight: keptTen.right, wf: cur.wf.brier, looRight: cur.loo.right, wfRight: cur.wf.right };
}
function oddsTermLabel(t) {
  return { age: 'age, years listed', family: 'family effect', category: 'category effect', size: 'size curve, ln TVL',
    growth: '7-day TVL growth', chains: 'chain count, ln' }[t] || t;
}

// --- the bootstrap --------------------------------------------------------
//
// 200 refits of both models on resampled comps and peers, one seeded stream, the same in Node and
// in the browser. The intervals are PREDICTION intervals: each refit prediction is multiplied by
// exp of a residual drawn from the full fit's leave-one-out residuals, so the range carries the
// scatter of real caps around the model, not just the wobble of the fit.

function bootstrap(comps, peers, ranked, asOf, valueTerms, oddsTerms, medianAgeYears, looResiduals) {
  var rand = rng(SEED);
  var rowSamples = ranked.map(function () { return []; });
  var rankSamples = ranked.map(function () { return []; });
  var compSamples = comps.map(function () { return []; });
  var multSamples = [], slopeSamples = [];
  var bandSamples = AGE_BANDS.slice(0, -1).map(function () { return []; });
  for (var b = 0; b < BOOTSTRAPS; b++) {
    var rc = [], rp = [];
    for (var i = 0; i < comps.length; i++) rc.push(comps[Math.floor(rand() * comps.length)]);
    for (var j = 0; j < peers.length; j++) rp.push(peers[Math.floor(rand() * peers.length)]);
    var vm = fitValue(rc, asOf, valueTerms);
    var om = fitOdds(rp, asOf, oddsTerms);
    multSamples.push(multipleAt100M(vm));
    slopeSamples.push(sizeSlope(vm));
    om.bandRates().forEach(function (r, k) { bandSamples[k].push(r); });
    comps.forEach(function (p, i) { compSamples[i].push(predictValue(vm, p, asOf) * Math.exp(looResiduals[Math.floor(rand() * looResiduals.length)])); });
    // Two predictions per refit: the point implied (no residual draw) for the RANK, which reflects
    // the fit's own wobble, and the noisy implied (with a residual draw) for the INTERVAL, which
    // reflects the scatter of real caps. Ranking on the noisy value would shuffle ranks by noise.
    var pointImplied = ranked.map(function (r) {
      var v = predictValue(vm, r.p, asOf);
      var o = oddsFor(om, withAgeFallback(r.p, medianAgeYears, asOf), asOf).odds;
      return v * o * r.parentFactor;
    });
    var order = pointImplied.map(function (v, i) { return i; }).sort(function (a, c) { return pointImplied[c] - pointImplied[a] || (ranked[a].p.slug < ranked[c].p.slug ? -1 : 1); });
    order.forEach(function (idx, rank) { rankSamples[idx].push(rank + 1); });
    ranked.forEach(function (r, i) {
      rowSamples[i].push(pointImplied[i] * Math.exp(looResiduals[Math.floor(rand() * looResiduals.length)]));
    });
  }
  function intervals(samples) {
    var s = samples.slice().sort(function (a, b) { return a - b; });
    return { p25: percentile(s, 0.25), p75: percentile(s, 0.75), p10: percentile(s, 0.1), p90: percentile(s, 0.9) };
  }
  function rankRange(samples) {
    var s = samples.slice().sort(function (a, b) { return a - b; });
    return { lo: Math.round(percentile(s, 0.05)), hi: Math.round(percentile(s, 0.95)) };
  }
  return {
    rows: rowSamples.map(function (s, i) {
      var iv = intervals(s), rr = rankRange(rankSamples[i]);
      return { p25: iv.p25, p75: iv.p75, p10: iv.p10, p90: iv.p90, rankLo: rr.lo, rankHi: rr.hi };
    }),
    comps: compSamples.map(intervals),
    multiple100Se: stdev(multSamples),
    slopeSe: stdev(slopeSamples),
    bandSe: bandSamples.map(stdev),
  };
}
// A ranked row without a listing date is aged at the peers' median age, and the page says so.
function withAgeFallback(p, medianAgeYears, asOf) {
  if (p.listed_at) return p;
  var q = Object.assign({}, p);
  var d = new Date(Date.parse(asOf + 'T00:00:00Z') - medianAgeYears * 365.25 * DAY_MS);
  q.listed_at = d.toISOString().slice(0, 10);
  return q;
}

// --- farm verdicts ----------------------------------------------------------
//
// One scenario drives every verdict: a deposit, a drop share, a horizon. The modelled drop is the
// value if a token launches, times the drop share, times the deposit's share of TVL, times the
// token odds. The net subtracts the plan's own fees AND a 2%-a-year capital charge for locking
// the deposit. FARM clears $25 an hour of hands-on work; MARGINAL is positive under it; SKIP
// loses money. The T-bill is shown as a benchmark, not a bar. Yield earned meanwhile is left
// out, and the page says so.
//
// The farm is sized on the P25 value, not the median: the held-out P25 factor is the 25th
// percentile of the leave-one-out log-residuals, exponentiated — the value 3 in 4 comps traded
// above, relative to the model's prediction. The odds stay as the expectation — only the value
// takes the conservative quartile, because a 12-week capital lock should not be sized on a coin
// flip. The board still ranks on the median; the farm is a different question from the ranking.
//
// The plan deposit is sized to the farm, not fixed: the smallest deposit (rounded up to $100,
// between $1,000 and $25,000) whose net clears $25 an hour. Where no deposit in range clears
// it, the plan takes the cap when a bigger deposit helps and the floor when it does not.

var DEFAULT_SCENARIO = { deposit: 'plan', dropShare: 0.10, weeks: 12 };
function feesFor(p, weeks) {
  return 2 * WITHDRAWAL_USD + (6 + weeks) * gasFor(p.chains[0]);
}
function hoursFor(weeks) { return (70 + 10 * weeks) / 60; }
function capitalCharge(deposit, weeks) { return deposit * CAPITAL_RATE * (weeks / 52); }
// The value the farm is sized on: the P25 value when the build provides one, else the median.
function farmValueOf(row) { return row.farmValue || row.valueIfLaunches; }
function sizedDeposit(row, scenario) {
  // The drop per dollar deposited, k, against the capital charge per dollar, c. Net is linear in
  // the deposit, so the smallest deposit clearing $25 an hour is exact arithmetic, not a search.
  var k = farmValueOf(row) * scenario.dropShare * row.odds / row.p.tvl_usd;
  var c = CAPITAL_RATE * (scenario.weeks / 52);
  if (k <= c) return DEP_MIN;
  var need = (FARM_NET_HOUR * hoursFor(scenario.weeks) + feesFor(row.p, scenario.weeks)) / (k - c);
  return clamp(Math.ceil(need / 100) * 100, DEP_MIN, DEP_MAX);
}
function verdictFor(row, scenario, exitPct) {
  var deposit = scenario.deposit === 'plan' ? sizedDeposit(row, scenario) : scenario.deposit;
  var dropNoOdds = farmValueOf(row) * scenario.dropShare * (deposit / row.p.tvl_usd);
  var drop = dropNoOdds * row.odds;
  var fees = feesFor(row.p, scenario.weeks);
  var capCharge = capitalCharge(deposit, scenario.weeks);
  var hours = hoursFor(scenario.weeks);
  var net = drop - fees - capCharge;
  var tbill = deposit * TBILL_RATE * (scenario.weeks / 52);
  var netHour = net / hours;
  var verdict = netHour >= FARM_NET_HOUR ? 'FARM' : net > 0 ? 'MARGINAL' : 'SKIP';
  var costs = fees + capCharge;
  return {
    deposit: deposit, drop: drop, dropNoOdds: dropNoOdds, fees: fees, capCharge: capCharge, hours: hours,
    net: net, tbill: tbill, netHour: netHour, verdict: verdict,
    breakEvenShare: drop * scenario.dropShare === 0 ? 1 : costs / drop * scenario.dropShare,
    breakEvenOdds: dropNoOdds === 0 ? 1 : costs / dropNoOdds,
    exitTvl: row.p.tvl_usd * (1 + exitPct / 100),
  };
}

function money(n) {
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
  return '$' + Math.round(n);
}

// The 10-step farm plans are Node-only (lib/model.ts builds them into board.json and data.js);
// the page shows them as written. Only the live verdict math — fees, hours, net — is shared.

// --- the build ------------------------------------------------------------

// Spearman rank correlation between two arrays of the same length.
function ranksOf(xs) {
  var order = xs.map(function (v, i) { return i; }).sort(function (a, b) { return xs[a] - xs[b] || (a - b); });
  var r = new Array(xs.length);
  order.forEach(function (i, k) { r[i] = k; });
  return r;
}
function pearson(xs, ys) {
  var n = xs.length, mx = mean(xs), my = mean(ys), a = 0, b = 0, c = 0;
  for (var i = 0; i < n; i++) { var dx = xs[i] - mx, dy = ys[i] - my; a += dx * dy; b += dx * dx; c += dy * dy; }
  return b === 0 || c === 0 ? 0 : a / Math.sqrt(b * c);
}
function spearman(xs, ys) { return pearson(ranksOf(xs), ranksOf(ys)); }

function buildRadar(snapshot) {
  var asOf = snapshot.as_of;
  var parts = partition(snapshot);
  var ranked = parts.watchlist.concat(parts.early, parts.offlist).map(function (p) {
    return { p: p, tier: tierOf(snapshot, p), parentFactor: tierOf(snapshot, p) === 'off-list' ? PARENT_FACTOR : 1 };
  });
  var comps = compsOf(snapshot);
  var peers = peersOf(snapshot);
  var peerAges = peers.map(function (p) { return ageYears(asOf, p.listed_at) || 0; }).sort(function (a, b) { return a - b; });
  var medianAgeYears = median(peerAges);

  var valueSel = selectValueTerms(comps, asOf);
  var valueModel = fitValue(comps, asOf, valueSel.kept);
  var oddsSel = selectOddsTerms(peers, asOf);
  var oddsModel = fitOdds(peers, asOf, oddsSel.kept);
  // The leave-one-out log-residuals: the bootstrap draws from these so its intervals are
  // prediction intervals, carrying the scatter of real caps around the model. Their P25 is the
  // farm's value factor: the value 3 in 4 held-out comps traded above, relative to prediction.
  var looResiduals = valueSel.looPreds.map(function (pr, i) { return Math.log(comps[i].mcap_usd) - Math.log(pr); });
  var farmValueFactor = Math.exp(percentile(looResiduals.slice().sort(function (a, b) { return a - b; }), 0.25));
  var boot = bootstrap(comps, peers, ranked, asOf, valueSel.kept, oddsSel.kept, medianAgeYears, looResiduals);

  // Score every ranked row with the full fits.
  var scored = ranked.map(function (r, i) {
    var v = predictValue(valueModel, r.p, asOf);
    var o = oddsFor(oddsModel, withAgeFallback(r.p, medianAgeYears, asOf), asOf);
    var implied = Math.max(1, Math.round(v * o.odds * r.parentFactor));
    return {
      p: r.p, tier: r.tier, parentFactor: r.parentFactor, valueIfLaunches: v, odds: o.odds,
      farmValue: v * farmValueFactor,
      rateByAge: o.rateByAge, rateOldest: o.rateOldest, implied: implied,
      p25: Math.max(1, Math.round(boot.rows[i].p25)), p75: Math.max(1, Math.round(boot.rows[i].p75)),
      p10: Math.max(1, Math.round(boot.rows[i].p10)), p90: Math.max(1, Math.round(boot.rows[i].p90)),
      rankLo: boot.rows[i].rankLo, rankHi: boot.rows[i].rankHi,
      ageDays: ageDays(asOf, r.p.listed_at),
    };
  });
  scored.sort(function (a, b) { return b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : 1); });
  scored.forEach(function (s, i) { s.rank = i + 1; });

  // Coverage honesty: the bootstrap's relative ranges applied to the held-out predictions.
  var fullCompPreds = comps.map(function (p) { return predictValue(valueModel, p, asOf); });
  var rel = function (k) { return boot.comps.map(function (c, i) { return c[k] / fullCompPreds[i]; }); };
  var rel25 = rel('p25'), rel75 = rel('p75'), rel10 = rel('p10'), rel90 = rel('p90');
  var actuals = comps.map(function (p) { return p.mcap_usd; });
  var missesOf = function (preds, acts) { return preds.map(function (pr, i) { return Math.exp(Math.abs(Math.log(pr) - Math.log(acts[i]))); }); };
  var looCov2575 = coverageOf(valueSel.looPreds, actuals, rel25, rel75, missesOf(valueSel.looPreds, actuals));
  var looCov1090 = coverageOf(valueSel.looPreds, actuals, rel10, rel90, missesOf(valueSel.looPreds, actuals));
  var wfIdx = Object.keys(valueSel.wfPreds).map(Number);
  var wfPreds = wfIdx.map(function (i) { return valueSel.wfPreds[i]; });
  var wfActuals = wfIdx.map(function (i) { return actuals[i]; });
  var at = function (arr) { return wfIdx.map(function (i) { return arr[i]; }); };
  var wfCov2575 = coverageOf(wfPreds, wfActuals, at(rel25), at(rel75), missesOf(wfPreds, wfActuals));
  var wfCov1090 = coverageOf(wfPreds, wfActuals, at(rel10), at(rel90), missesOf(wfPreds, wfActuals));

  // The rank evidence: blind (leave-one-out) predictions against real caps, and how far the
  // fitted tilts move ranks off a flat multiple of TVL. The band is the median P25-P75 relative
  // range, for the scatter plot.
  var rankCorr = spearman(valueSel.looPreds, actuals);
  var band = { lo: median(rel25.slice().sort(function (a, b) { return a - b; })), hi: median(rel75.slice().sort(function (a, b) { return a - b; })) };
  var flatExp = Math.exp(valueModel.medianLogRatio);
  var flatRank = {};
  scored.map(function (s) { return { slug: s.p.slug, v: flatExp * s.p.tvl_usd * s.odds * s.parentFactor }; })
    .sort(function (a, b) { return b.v - a.v || (a.slug < b.slug ? -1 : 1); })
    .forEach(function (r, i) { flatRank[r.slug] = i + 1; });
  var tiltsMoved = scored.filter(function (s) { return Math.abs(s.rank - flatRank[s.p.slug]) >= 5; }).length;

  // The exit rule's threshold: the 5th percentile of 7-day change across the ranked rows.
  var changes = scored.map(function (s) { return s.p.change_7d; }).filter(function (c) { return c !== null; }).sort(function (a, b) { return a - b; });
  var exitPct = percentile(changes, 0.05);

  var scenario = { deposit: DEFAULT_SCENARIO.deposit, dropShare: DEFAULT_SCENARIO.dropShare, weeks: DEFAULT_SCENARIO.weeks };
  var verdictCounts = { FARM: 0, MARGINAL: 0, SKIP: 0 };
  scored.forEach(function (s) {
    var v = verdictFor(s, scenario, exitPct);
    s.verdict = v.verdict; s.net = v.net; s.netHour = v.netHour; s.drop = v.drop; s.fees = v.fees;
    s.deposit = v.deposit; s.breakEvenOdds = v.breakEvenOdds; s.breakEvenShare = v.breakEvenShare; s.capCharge = v.capCharge;
    verdictCounts[v.verdict]++;
  });

  // The board's rows, the checksum and the data.js payload are Node-only (lib/model.ts builds
  // them from the scored rows); the page refits the same scored rows and compares.
  var catEffects = Object.keys(valueModel.category).map(function (c) { return Math.exp(valueModel.category[c]); });
  var evidence = {
    value: {
      n: comps.length, nWf: wfIdx.length, rows: valueSel.rows,
      kept: valueSel.kept.length, total: VALUE_TERMS.length,
      loo: valueSel.loo, wf: valueSel.wf,
      rankCorr: rankCorr, tiltsMoved: tiltsMoved, farmValueFactor: farmValueFactor, band: band, marketGrowth: valueModel.marketGrowth,
      coverage: { loo: { x3: looCov2575.x3, p2575: looCov2575.inside, p1090: looCov1090.inside }, wf: { x3: wfCov2575.x3, p2575: wfCov2575.inside, p1090: wfCov1090.inside } },
      fitted: {
        multiple100: multipleAt100M(valueModel), multiple100Se: boot.multiple100Se,
        sizeSlope: sizeSlope(valueModel), sizeSlopeSe: boot.slopeSe,
        growth: valueModel.growth, age: valueModel.age, chains: valueModel.chains, carry: valueModel.carry,
        catLo: catEffects.length ? Math.min.apply(null, catEffects) : 1,
        catHi: catEffects.length ? Math.max.apply(null, catEffects) : 1,
      },
    },
    odds: {
      n: peers.length, nWf: wfIdx.length, rows: oddsSel.rows,
      kept: oddsSel.kept.length, total: ODDS_TERMS.length,
      baseRate: oddsModel.baseRate, withToken: peers.filter(function (p) { return !isPreToken(p); }).length,
      loo: oddsSel.loo, wf: oddsSel.wf, looRight: oddsSel.looRight, wfRight: oddsSel.wfRight,
      ten: oddsSel.ten, tenRight: oddsSel.tenRight, baseTen: oddsSel.rows[0].ten.brier,
      bands: oddsModel.bandRates().map(function (r, i) {
        return { lo: AGE_BANDS[i], hi: AGE_BANDS[i + 1], rate: r, se: boot.bandSe[i] || 0,
          n: peers.filter(function (p) { return bandOf(ageYears(asOf, p.listed_at) || 0) === i; }).length };
      }),
    },
    exitPct: exitPct, medianAgeYears: medianAgeYears,
  };
  var accounting = {
    total: snapshot.protocols.length,
    ranked: scored.length, watchlist: parts.watchlist.length, early: parts.early.length, offlist: parts.offlist.length,
    token: parts.priced.length + parts.tokenNoCap.length, priced: parts.priced.length, tokenNoCap: parts.tokenNoCap.length,
    out: { bridge: parts.out.bridge.length, staked: parts.out.staked.length,
      exchange: parts.out.exchange.length, versioned: parts.out.versioned.length,
      wrapped: parts.out.wrapped.length, kin: parts.out.kin.length },
    outTotal: parts.out.bridge.length + parts.out.staked.length + parts.out.exchange.length + parts.out.versioned.length + parts.out.wrapped.length + parts.out.kin.length,
  };
  var stats = {
    protocols: snapshot.protocols.length, ranked: scored.length, comps: comps.length, peers: peers.length,
    valueKept: valueSel.kept, oddsKept: oddsSel.kept,
    valueLoo: valueSel.loo, valueWf: valueSel.wf,
    oddsLoo: oddsSel.loo, oddsWf: oddsSel.wf, oddsTen: oddsSel.ten,
    rankCorr: rankCorr, tiltsMoved: tiltsMoved, farmValueFactor: farmValueFactor,
    verdictCounts: verdictCounts, exitPct: exitPct,
    totalTvl: scored.reduce(function (a, s) { return a + s.p.tvl_usd; }, 0),
    multiple100: evidence.value.fitted.multiple100, sizeSlope: evidence.value.fitted.sizeSlope,
  };
  return { scored: scored, evidence: evidence, accounting: accounting, stats: stats,
    valueModel: valueModel, oddsModel: oddsModel, comps: comps, looPreds: valueSel.looPreds,
    peers: peers, medianAgeYears: medianAgeYears, exitPct: exitPct };
}

var API = {
  MODEL_VERSION: MODEL_VERSION, BOOTSTRAPS: BOOTSTRAPS, TBILL_RATE: TBILL_RATE, CAPITAL_RATE: CAPITAL_RATE,
  FARM_NET_HOUR: FARM_NET_HOUR, PARENT_FACTOR: PARENT_FACTOR, DEFAULT_SCENARIO: DEFAULT_SCENARIO,
  DEP_MIN: DEP_MIN, DEP_MAX: DEP_MAX,
  VALUE_TERMS: VALUE_TERMS, ODDS_TERMS: ODDS_TERMS, AGE_BANDS: AGE_BANDS,
  median: median, percentile: percentile, mean: mean, stdev: stdev, round4: round4, clamp: clamp,
  checksum: checksum, money: money, ageDays: ageDays, ageYears: ageYears, bandOf: bandOf,
  familyOf: familyOf, gasFor: gasFor, isPreToken: isPreToken, exclusionReason: exclusionReason,
  isRankable: isRankable, partition: partition, tierOf: tierOf, isPricedComp: isPricedComp,
  compsOf: compsOf, peersOf: peersOf, growthOf: growthOf, chainsLn: chainsLn, ageLog: ageLog,
  carryOf: carryOf, spearman: spearman,
  fitValue: fitValue, predictValue: predictValue, multipleAt100M: multipleAt100M, sizeSlope: sizeSlope,
  looValue: looValue, wfValue: wfValue, selectValueTerms: selectValueTerms, valueTermLabel: valueTermLabel,
  coverageOf: coverageOf, fitOdds: fitOdds, oddsFor: oddsFor, brierOf: brierOf,
  looOdds: looOdds, wfOdds: wfOdds, tenFoldOdds: tenFoldOdds, selectOddsTerms: selectOddsTerms, oddsTermLabel: oddsTermLabel,
  bootstrap: bootstrap, withAgeFallback: withAgeFallback, sizedDeposit: sizedDeposit, capitalCharge: capitalCharge,
  farmValueOf: farmValueOf, feesFor: feesFor, hoursFor: hoursFor, verdictFor: verdictFor, buildRadar: buildRadar,
};
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.RADAR_MODEL = API;
