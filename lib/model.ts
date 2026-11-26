// The token radar's Node side (radar-5): the snapshot in, the ranked board out.
//
// The model itself lives in dashboard/0-model.js, one file shared with the page, so the program
// that writes board.json and the page that refits it run the same code. This file is the Node
// side only: the snapshot's shape, the board's rows (with the farm plans, which are Node-only
// so the shared file stays inside the dossier's text budget), the gate's own checks, and the
// data.js the page reads.

import MODEL from '../dashboard/0-model.js';

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** One row of board.json: the ranked board's row, built here from the model's scored rows. */
export type BoardRow = Record<string, unknown> & {
  rank: number;
  slug: string;
  name: string;
  implied_value_usd: number;
  farm_steps: string[];
};

/** Everything the dashboard needs: the snapshot, the board's implied values, the farm plans. */
export type RadarData = Record<string, unknown>;

/** One scored row from the shared model. */
export interface ScoredRow {
  p: SnapshotProtocol;
  tier: string;
  parentFactor: number;
  valueIfLaunches: number;
  odds: number;
  farmValue: number;
  rateByAge: number;
  rateOldest: number;
  implied: number;
  p25: number;
  p75: number;
  p10: number;
  p90: number;
  rankLo: number;
  rankHi: number;
  ageDays: number | null;
  rank: number;
  verdict: string;
  net: number;
  netHour: number;
  drop: number;
  fees: number;
  deposit: number;
  breakEvenOdds: number;
  breakEvenShare: number;
  capCharge: number;
}

/** What the shared build returns: the scored rows, the evidence, the run's statistics. */
export interface SharedBuild {
  scored: ScoredRow[];
  evidence: Record<string, unknown>;
  accounting: Record<string, unknown>;
  stats: Record<string, unknown>;
  exitPct: number;
}

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION: string = MODEL.MODEL_VERSION as string;

const sharedBuildRadar = MODEL.buildRadar as (snapshot: Snapshot) => SharedBuild;
const gasFor = MODEL.gasFor as (chain: string) => number;
const checksumOf = MODEL.checksum as (s: string) => string;
const money = MODEL.money as (n: number) => string;
const DEFAULT_SCENARIO = MODEL.DEFAULT_SCENARIO as { deposit: 'plan' | number; dropShare: number; weeks: number };

// --- the farm plans (Node-only: the page shows them as written in data.js) ------

function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

function riskFor(p: SnapshotProtocol): string {
  const c = (p.category || '').toLowerCase();
  if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Strategy risk: a lending position can be liquidated if the collateral falls, so borrow less than half of what the pool allows and keep the health factor high.';
  if (c.indexOf('dex') >= 0) return 'Strategy risk: a liquidity position loses to impermanent loss when the pair moves apart, so prefer the stable pair if the pool offers one.';
  if (c.indexOf('yield') >= 0 || c.indexOf('leveraged') >= 0) return 'Strategy risk: a vault stacks other protocols beneath it, so any of them can fail; read the strategy page and avoid vaults whose yield is mostly paid in an unlisted token.';
  if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Strategy risk: a curator vault follows one manager\'s allocation, so check what it holds and whether withdrawals have ever been paused.';
  if (c.indexOf('rwa') >= 0 || c.indexOf('stable') >= 0) return 'Strategy risk: a real-world-asset token depends on its issuer and its custodian, so read who holds the backing and how redemptions work.';
  if (c.indexOf('derivative') >= 0 || c.indexOf('basis') >= 0) return 'Strategy risk: a basis or derivatives position depends on funding rates that flip, so size it to survive a week of negative funding.';
  if (c.indexOf('insurance') >= 0) return 'Strategy risk: cover pays only on the events the policy names, so read the exclusions before buying.';
  if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Strategy risk: a staking receipt can depeg from the asset it claims, so check its price against the underlying before depositing.';
  return 'Strategy risk: read the protocol\'s docs for one page on how it makes its yield and what can break, and farm only what you can afford to lock.';
}

function actionFor(p: SnapshotProtocol, deposit: number, chain: string): string {
  const c = (p.category || '').toLowerCase();
  const d = '$' + Math.round(deposit).toLocaleString('en-US');
  if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply ' + d + ' of USDC to ' + p.name + ' on ' + chain + ' and keep the position open, borrowing a small amount against it once a month.';
  if (c.indexOf('dex') >= 0) return 'Provide ' + d + ' of liquidity to ' + p.name + '\'s main pool on ' + chain + ' and keep the position open, swapping through the pool once a week.';
  if (c.indexOf('yield') >= 0 || c.indexOf('leveraged') >= 0) return 'Deposit ' + d + ' into ' + p.name + '\'s highest-TVL vault on ' + chain + ' and keep the shares, compounding the yield.';
  if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit ' + d + ' into a ' + p.name + ' vault on ' + chain + ' and keep the shares, rebalancing once a month if the vault allows it.';
  if (c.indexOf('rwa') >= 0 || c.indexOf('stable') >= 0) return 'Mint ' + d + ' of the protocol\'s yield asset on ' + chain + ' and hold it, claiming the yield once.';
  if (c.indexOf('derivative') >= 0 || c.indexOf('basis') >= 0) return 'Deposit ' + d + ' of USDC as margin on ' + p.name + ' and open one small position, closing it after a week.';
  if (c.indexOf('prediction') >= 0) return 'Fund ' + d + ' and place one market position on ' + p.name + ', then one more in a different market.';
  if (c.indexOf('insurance') >= 0) return 'Buy ' + d + ' of cover from ' + p.name + ' on ' + chain + ' and keep the policy active through one renewal.';
  if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Stake ' + d + ' of the chain\'s staking asset through ' + p.name + ' and keep the receipt token, using it once in a lending pool.';
  return 'Deposit ' + d + ' of USDC into ' + p.name + ' on ' + chain + ' and keep the position open, using the app once a week.';
}

interface FarmStep {
  title: string;
  text: string;
  cost: string;
  time: string;
}

/** The 10-step costed farm plan for one protocol at the default scenario, at the sized deposit. */
function farmSteps(p: SnapshotProtocol, scenario: { deposit: 'plan' | number; dropShare: number; weeks: number }, exitPct: number, deposit: number): FarmStep[] {
  const chain = chainOf(p);
  const gas = gasFor(chain);
  const weeks = scenario.weeks;
  const d = '$' + Math.round(deposit).toLocaleString('en-US');
  const exit = money(p.tvl_usd * (1 + exitPct / 100));
  const tx = (n: number): string => '$' + (n * gas).toFixed(2) + ' (' + n + ' transaction' + (n === 1 ? '' : 's') + ' at about $' + gas + ' on ' + chain + ')';
  const second = p.chains.length > 1 ? ' A second deployment on ' + p.chains[1] + ' shows activity on more than one chain.' : '';
  return [
    { title: 'SETUP', text: 'Set up an EVM wallet (a hardware-backed account is best) used only for this farm and withdraw about $5 of ' + chain + ' gas to it from an exchange.', cost: '$1.00 (one exchange withdrawal)', time: '10 min hands-on' },
    { title: 'VERIFY', text: 'Reach ' + p.name + ' from its DefiLlama page or its official accounts, bookmark the app and match the contract addresses against its docs. Never sign an approval from a link sent in a DM.', cost: 'free', time: '5 min hands-on' },
    { title: 'FUND', text: chain === 'Ethereum' ? 'Withdraw ' + d + ' of USDC straight to Ethereum from an exchange that supports it.' : 'Withdraw ' + d + ' of USDC straight to ' + chain + ' from an exchange that supports it, or move it from Ethereum with a large bridge that lists ' + chain + '.', cost: '$1.00 (one exchange withdrawal)', time: '10 min hands-on; wait 2-20 minutes to arrive' },
    { title: 'RISK', text: riskFor(p), cost: 'free (reading only; the deposit is the capital at risk)', time: '10 min hands-on' },
    { title: 'CORE', text: actionFor(p, deposit, chain) + ' Start with a $100 test, then size up to the full ' + d + '.', cost: tx(3), time: '15 min hands-on' },
    { title: 'DEEPEN', text: 'Hold the receipt token, or post it where ' + p.name + ' lists a points boost (a lending market or an LP), but never loop it more than once.' + second, cost: tx(2), time: '10 min hands-on' },
    { title: 'CADENCE', text: 'Touch the position once a week (a top-up, a claim, a vote) so the wallet shows steady use rather than one deposit.', cost: tx(weeks), time: '5 min a week for ' + weeks + ' weeks hands-on' },
    { title: 'WATCH', text: 'Exit rule, checked weekly: withdraw if TVL prints below ' + exit + ' (' + exitPct.toFixed(1) + '% from today\'s ' + money(p.tvl_usd) + ', a weekly fall worse than 95% of this snapshot\'s protocols); also if withdrawals are paused or the team says a snapshot has already been taken.', cost: 'free', time: '5 min a week for ' + weeks + ' weeks hands-on' },
    { title: 'RECORD', text: 'Keep a ledger from the first transaction: date, transaction hash, asset, amount and dollar value of every top-up, claim and withdrawal. A claim may ask the wallet to prove its history, and a drop is taxable income in many places at its value on the day it arrives.', cost: 'free', time: '5 min hands-on' },
    { title: 'CLAIM', text: 'Claim only from the protocol\'s own page once a token is announced; never pay to claim, and check the claim contract address against the official announcement first.', cost: tx(1), time: '10 min hands-on' },
  ];
}

/** One farm step as a single string, inside the gate's 20-600 character window. */
function stepText(step: FarmStep): string {
  let s = step.title + ': ' + step.text + ' COST ' + step.cost + '. TIME ' + step.time + '.';
  if (s.length > 600) s = s.slice(0, 596) + '...';
  if (s.length < 20) s += ' Hold the position and check the protocol\'s own page.';
  return s;
}

/** The build: the shared model scores the snapshot; this wrapper writes the board rows, the checksum and the dashboard's data. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData; stats: Record<string, unknown> } {
  const r = sharedBuildRadar(snapshot);
  const scenario = { deposit: DEFAULT_SCENARIO.deposit, dropShare: DEFAULT_SCENARIO.dropShare, weeks: DEFAULT_SCENARIO.weeks };
  const steps: Record<string, string[]> = {};
  const board: BoardRow[] = r.scored.map((s) => {
    const ss = farmSteps(s.p, scenario, r.exitPct, s.deposit).map(stepText);
    steps[s.p.slug] = ss;
    return {
      rank: s.rank, slug: s.p.slug, name: s.p.name, category: s.p.category, chains: s.p.chains,
      tvl_usd: s.p.tvl_usd, change_7d: s.p.change_7d, mcap_usd: s.p.mcap_usd, listed_at: s.p.listed_at,
      gecko_id: s.p.gecko_id, symbol: s.p.symbol, token_status: 'pre-token', age_days: s.ageDays,
      implied_value_usd: s.implied, tier: s.tier, parent_factor: s.parentFactor,
      value_if_launches_usd: Math.round(s.valueIfLaunches), token_odds: Math.round(s.odds * 10000) / 10000,
      farm_value_usd: Math.round(s.farmValue),
      p25_usd: s.p25, p75_usd: s.p75, p10_usd: s.p10, p90_usd: s.p90,
      rank_lo: s.rankLo, rank_hi: s.rankHi, verdict: s.verdict,
      deposit_usd: s.deposit, capital_charge_usd: Math.round(s.capCharge),
      break_even_odds: Math.round(s.breakEvenOdds * 10000) / 10000,
      break_even_drop_share: Math.round(s.breakEvenShare * 10000) / 10000,
      net_of_fees_usd: Math.round(s.net), net_per_hour_usd: Math.round(s.netHour * 10000) / 10000,
      farm_steps: ss,
    };
  });
  const boardChecksum = checksumOf(board.map((x) => x.slug + ':' + x.implied_value_usd).join(','));
  const totalImplied = board.reduce((a, x) => a + x.implied_value_usd, 0);
  const radar: RadarData = {
    as_of: snapshot.as_of, source: snapshot.source, floor_usd: snapshot.floor_usd, model_version: MODEL_VERSION,
    protocols: snapshot.protocols, watchlist: snapshot.watchlist,
    board: board.map((x) => ({ slug: x.slug, implied_value_usd: x.implied_value_usd })),
    steps,
    checksum: boardChecksum, totalImplied,
    totalTvl: r.stats.totalTvl as number,
  };
  const stats = { ...r.stats, totalImplied, checksum: boardChecksum };
  return { board, radar, stats };
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.trim().length < 20 || s.trim().length > 600) return `${r.slug} has a farm step of ${s.trim().length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
