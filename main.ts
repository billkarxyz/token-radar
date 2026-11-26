// A token-radar-01 entry (Node 22, standard library only).
//
// The program reads the sealed snapshot from /input/snapshot.json (or --input <file|dir>), scores every
// pre-token protocol with the fitted model in dashboard/0-model.js (radar-5), writes the ranked board to
// /output/board.json, and copies this repository's dashboard/ and screenshots/ to /output. Last, it
// writes /output/dossier.json, the summary the judge reads, with the vendored make.fun library.
//
// The dashboard is a static page, no framework and no network: dashboard/index.html, dashboard/styles.css,
// dashboard/app.js and dashboard/0-model.js read /output/data.js, which this program writes from the
// same snapshot. The page refits the model itself over that data and checks every number board.json
// carries, so the page's code and the board's data are visibly the same arithmetic.
//
// What makes this entry's radar different from the starter's (radar-1) and from radar-2:
//   - the value model is fitted, not calibrated by hand: a base multiple plus a size curve plus a
//     ridge-shrunk category effect, each candidate term kept only when it lowers the held-out miss
//     in BOTH leave-one-out and walk-forward tests, with a control term that must not help;
//   - the token odds come from the peers' record: the share of comparable protocols that record a
//     token by each age, Brier-scored held-out against the base rate, never a forecast;
//   - every row carries bootstrap intervals (200 refits) and a rank range, and the page prints a
//     coverage table that says whether those ranges are honest;
//   - the board accounts for every one of the snapshot's 758 protocols in exactly one group, and
//     the page's integrity strip recomputes the board and checks its totals and checksum;
//   - each farm verdict is costed: a modelled drop net of the plan's own fees and a 2%-a-year
//     capital charge, against a $25-an-hour bar (the T-bill is a benchmark, not a bar), with the
//     deposit sized to the farm and a 10-step plan carrying a cost and a time per step.
//   - radar-4 widens the priced comps (no listing date required, ratio cap 50x), adds a carry
//     term and ten-fold odds validation, and reports the rank correlation and how far the fitted
//     tilts move ranks off a flat multiple of TVL.
//   - radar-5 widens the priced comps to 104 and the odds peers to 536 on one rule (bridge and
//     exchange tokens left out, staked and versioned kept), keeps a third value term (7-day
//     growth), and tests a category odds term — it fails both blind tests, so it stays out.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** The scorer's own caps (reference/gate.json): the text cap shapes the bytes, the rest refuse. */
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** --name <value> out of the arguments, or the fallback. */
function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`token radar: no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input\n`);
  process.exit(2);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const { board, radar, stats } = buildRadar(snapshot);
const issue = boardIssue(board, snapshot);
if (issue !== null) {
  process.stderr.write(`token radar: the model wrote a board the gate refuses: ${issue}\n`);
  process.exit(1);
}

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(out, 'data.js'), dataScript(radar));

/** Copy one directory's regular files into `to`, skipping names that start with a dot. */
function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < 3) {
  process.stderr.write(`token radar: screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view\n`);
  process.exit(1);
}
for (const name of shots) {
  if (!IMAGE_NAME.test(name)) {
    process.stderr.write(`token radar: screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters\n`);
    process.exit(1);
  }
}

// The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
writeFileSync(join(out, 'dossier.json'), buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: { max_files: 400, max_bytes: 4_194_304 } }));

// The server-side dossier gate (reference/gate.json) is 1.5 MiB, but buildDossier only refuses
// over 4 MiB: a dossier past the server gate scores valid 0 with no judge score (v3, 2,017,207
// bytes). Refuse here so an oversize dossier can never pass local checks silently.
const DOSSIER_SERVER_MAX_BYTES = 1_572_864;
const dossierSize = statSync(join(out, 'dossier.json')).size;
if (dossierSize > DOSSIER_SERVER_MAX_BYTES) {
  process.stderr.write(`token radar: dossier.json is ${dossierSize} bytes, over the server gate of ${DOSSIER_SERVER_MAX_BYTES} bytes (1.5 MiB): shrink the screenshots in screenshots/\n`);
  process.exit(1);
}

process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${stats.comps} priced comps, ${stats.peers} odds peers)\n` +
    `token radar: value terms kept: ${(stats.valueKept as string[]).join(', ') || 'none'}; odds terms kept: ${(stats.oddsKept as string[]).join(', ') || 'none'}\n` +
    `token radar: held-out miss walk-forward x${(stats.valueWf as number).toFixed(2)} (leave-one-out x${(stats.valueLoo as number).toFixed(2)}); odds Brier walk-forward ${(stats.oddsWf as number).toFixed(3)} (ten-fold ${(stats.oddsTen as number).toFixed(3)})\n` +
    `token radar: blind rank correlation ${(stats.rankCorr as number).toFixed(2)}; the tilts move ${stats.tiltsMoved} of ${board.length} ranks 5+ places off a flat multiple\n` +
    `token radar: verdicts ${JSON.stringify(stats.verdictCounts)}; total implied $${(stats.totalImplied as number).toLocaleString('en-US')}; checksum ${stats.checksum}\n` +
    `token radar: wrote ${join(out, 'board.json')}, ${join(out, 'data.js')}, ${join(out, 'dashboard')} (4 files), ${join(out, 'screenshots')} (${shots.length} images) and ${join(out, 'dossier.json')}\n`,
);
