# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/billkarxyz/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/billkarxyz/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: it reads a sealed snapshot of every protocol on DefiLlama, ranks the 197 pre-token protocols by what their launch would be worth, and gives each one a farm plan with costs, times, and what a position could be worth.

The model (radar-2) calibrates its base multiple from the market instead of choosing one by hand: each category's multiple is the median market cap over TVL of its live-token protocols, recomputed from the snapshot on every run. Growth, maturity, and chain count adjust it from there. The board covers all 40 watchlist protocols and every other rankable pre-token protocol the snapshot holds, 157 early rows below the floor. The dashboard is a static page with search, category and chain filters, sorting, a detail view for every protocol, a live-token view, and a model sandbox that re-scores the board as you change the model.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json|directory>
```

Node 22.18 or later, standard library only. The program writes `board.json`, `data.js`, `dashboard/`, `screenshots/` and `dossier.json` into the output directory. It runs twice and writes the same bytes both times.

---

<sub>Entered on [make.fun](https://make.fun/?ref=e4ex6rz8&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
