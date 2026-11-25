# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/billkarxyz/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/billkarxyz/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: it reads a sealed snapshot of every protocol on DefiLlama, ranks the 196 pre-token protocols by what their launch would be worth, and gives each one a farm plan with costs, times, and what a position could be worth.

The model (radar-4) is fitted, not calibrated by hand. The value if a token launches comes from the 92 priced comps — log market cap on log TVL — and every candidate term (size curve, family and category effects, chain count, 7-day growth, age, carry, plus a control term that must not help) is kept only when it lowers the held-out miss in BOTH leave-one-out and walk-forward tests; on this snapshot the size curve and the category effect survive (walk-forward miss ×2.01, against ×3.91 for a flat multiple; leave-one-out ×3.10, against ×4.65). The token odds come from the 383 peers' record: the share that record a token by each age, Brier-scored held-out against the base rate (walk-forward 0.223 vs 0.260, ten-fold 0.207 vs 0.252) — the odds are the peers' record, never a forecast. Every row carries bootstrap intervals from 200 refits (P25–P75, P10–P90, rank range), and the page prints a coverage table that says whether those ranges are honest. The board accounts for every one of the snapshot's 758 protocols in exactly one group (40 watchlist + 138 early + 18 off-list ranked; 92 priced comps + 154 token, no usable cap; 316 set aside — 87 bridge, 90 staked form, 56 exchange, 76 versioned, 1 wrapped, 6 kin of a token), and each farm verdict is costed: a modelled drop, sized on the P25 value, net of the plan's own fees and a 2%-a-year capital charge, against a $25-an-hour bar, with the deposit sized to the farm ($1,000–$25,000) — 70 FARM, 46 MARGINAL, 80 SKIP.

The dashboard is a static page that refits the same model in the browser and checks every number board.json carries (integrity strip: rows recomputed, ranks, totals, checksum, watchlist, ledger). It has a KPI strip, the out-of-sample evidence tables, a log-log scatter of cap on TVL (traded tokens, board rows, P25–P75 band), verdict/tier/deposit/drop-share/horizon/search/category/chain filters, a sortable board with break-even odds and inline expandable farm plans, a detail view for every protocol (how-the-figure-is-made audit trail, nearest priced peers, where-it-sits scatter, farm verdict with net-of-fees math, what-moves-the-value sensitivity, net by weeks held, 10-step costed plan), and CSV + JSON export.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json|directory>
```

Node 22.18 or later, standard library only. The program writes `board.json`, `data.js`, `dashboard/`, `screenshots/` and `dossier.json` into the output directory. It runs twice and writes the same bytes both times.

---

<sub>Entered on [make.fun](https://make.fun/?ref=e4ex6rz8&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
