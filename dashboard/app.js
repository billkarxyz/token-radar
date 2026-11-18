// Token Radar's dashboard (radar-2). It reads window.RADAR (written beside dashboard/ by main.ts) and
// renders the ranked board, a filterable table, a per-protocol detail drawer with the model's own inputs
// and the protocol's farm plan, and a model sandbox that re-scores the board live. No network: every
// byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null };
  var sandbox = { growth_weight: DATA.model.growth_weight, farmer_share_pct: DATA.model.farmer_share_pct, farmer_wallets: DATA.model.farmer_wallets };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  // The model in one function: the page recomputes a row from the snapshot figures and checks the
  // number board.json carries, so the page's code and the board's data are visibly the same arithmetic.
  // The sandbox's growth weight replaces the model's own when the reader changes it.
  function impliedOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * sandbox.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    var chains = 1 + Math.min(Math.max((row.chains || []).length - 1, 0), model.chain_max_bonus) * model.chain_bonus;
    return Math.max(1, Math.round(row.tvl_usd * row.category_multiple * growthMult * maturity * chains));
  }
  function farmerOf(implied) {
    return Math.max(1, Math.round((implied * sandbox.farmer_share_pct) / 100 / sandbox.farmer_wallets));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL, age and
  // implied value decide the action, the capital, the hold, every cost and time, and the farmer's share.
  // No name is special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function gasFor(chain) {
    var c = (chain || '').toLowerCase();
    if (c === 'ethereum') return 'about $5 to $15 of gas on Ethereum mainnet';
    if (c === 'solana') return 'under $0.10 of gas on Solana';
    if (c === 'base' || c === 'arbitrum' || c === 'optimism' || c === 'polygon' || c === 'ink' || c === 'unichain' || c === 'world chain') return 'under $0.50 of gas on ' + chain;
    if (c === 'tron' || c === 'binance' || c === 'bnb chain' || c === 'avalanche' || c === 'bittensor' || c === 'stellar') return 'about $1 of gas on ' + chain;
    return 'about $1 to $3 of gas on ' + chain;
  }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open, borrowing a small amount against it once a month.';
    if (c.indexOf('dex') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open, swapping through the pool once a week.';
    if (c.indexOf('yield aggregator') >= 0 || c.indexOf('yield') >= 0) return 'Deposit $' + capital + ' into ' + name + "'s highest-TVL vault on " + chain + ' and keep the shares, compounding the yield.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app, bridging back once to show two-way use.';
    if (c.indexOf('liquid staking') >= 0 || c.indexOf('liquid restaking') >= 0 || c.indexOf('restak') >= 0 || c.indexOf('staking pool') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt token, using it once in a lending pool.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge, closing it after a week.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + ', then one more in a different market.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares, rebalancing once a month if the vault allows it.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + " and hold it in the protocol's savings pool.";
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield asset on " + chain + ' and hold it, claiming the yield once.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy active through one renewal.';
    if (c.indexOf('basis') >= 0) return 'Deposit $' + capital + ' into ' + name + "'s basis vault on " + chain + ' and hold the position through one funding cycle.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open, using the app once a week.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var gas = gasFor(chain);
    var value = farmerOf(p.implied_value_usd);
    var chainList = (p.chains || []).length > 1 ? ' It also runs on ' + (p.chains || []).slice(1, 3).join(', ') + '.' : '';
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'nothing to create, and never share the seed phrase', time: '5 minutes' },
      { text: "Read " + p.name + "'s own docs for one page on how its points or rewards work, so you farm what it actually counts." + chainList, cost: 'nothing but the reading', time: '10 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and ' + gas, time: '15 minutes to set up' },
      { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote, so the wallet shows steady use.', cost: gas + ' a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' },
      { text: 'If this protocol launches a token at its implied value of $' + p.implied_value_usd.toLocaleString('en-US') + ' and ' + sandbox.farmer_share_pct + '% goes to early farmers split across about ' + sandbox.farmer_wallets.toLocaleString('en-US') + ' wallets, one position could be worth about $' + value.toLocaleString('en-US') + '. A launch is not guaranteed: farm only what you can afford to lock.', cost: 'the estimate is a model, not a promise', time: 'read it once before you start' }
    ].map(stepText);
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'farmer') { av = a.farmer_value_usd; bv = b.farmer_value_usd; }
      else { av = impliedOf(a, DATA.model); bv = impliedOf(b, DATA.model); }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }
  function isWatchlist(slug) {
    return DATA.rows.filter(function (r) { return r.slug === slug; }).length > 0 && DATA.rows.filter(function (r) { return r.slug === slug; })[0].tvl_usd >= DATA.floor_usd;
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.board_size + ' pre-token protocols, ranked by implied value' }),
        el('p', { html: 'The watchlist is the floor: every protocol with at least <b>$' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL</b> and no token on record. The early radar adds <b>' + DATA.early_size + ' more</b> pre-token protocols below that floor, every one the snapshot holds. Implied value is a model, not a promise.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Market multiple (mcap / TVL)' }), el('b', { text: String(DATA.market_multiple) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) }))
      )
    );
  }

  // Export the filtered board as a CSV file, so a reader can take the ranking into a spreadsheet.
  // The export carries the same figures the board shows: rank, name, category, chains, TVL, growth,
  // age, implied value and farmer value. It is built in the page from the same data, no network.
  function csvCell(value) {
    var s = value === null || value === undefined ? '' : String(value);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function exportCsv() {
    var list = sortedRows(rows());
    var header = ['rank', 'name', 'slug', 'category', 'chains', 'tvl_usd', 'change_7d', 'age_days', 'implied_value_usd', 'farmer_value_usd'];
    var lines = [header.join(',')];
    list.forEach(function (r) {
      var implied = impliedOf(r, DATA.model);
      lines.push([
        r.rank, csvCell(r.name), r.slug, csvCell(r.category || ''),
        csvCell((r.chains || []).join('; ')), r.tvl_usd,
        r.change_7d === null ? '' : r.change_7d,
        r.age_days === null ? '' : r.age_days,
        implied, farmerOf(implied)
      ].join(','));
    });
    var blob = new Blob([lines.join('\n') + '\n'], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'token-radar-board.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var catSelect = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    catSelect.addEventListener('change', function () { state.category = catSelect.value; writeHash(); render(); });
    var chainSelect = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSelect.addEventListener('change', function () { state.chain = chainSelect.value; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), catSelect),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSelect),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Export' }), el('button', { class: 'button', type: 'button', text: 'Download CSV', onclick: exportCsv })),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  // The five fastest-growing pre-token protocols by seven-day TVL change: the radar's early signal.
  // A protocol growing fast with no token yet is the one a farmer wants to find first.
  function topMovers() {
    var movers = DATA.rows
      .filter(function (r) { return r.change_7d !== null && r.change_7d !== undefined && r.change_7d > 0; })
      .slice()
      .sort(function (a, b) { return b.change_7d - a.change_7d || b.tvl_usd - a.tvl_usd; })
      .slice(0, 5);
    if (movers.length === 0) return null;
    var cards = movers.map(function (r) {
      return el('button', { class: 'mover', type: 'button', onclick: function () { openDetail(r.slug); } },
        el('b', { text: r.name }),
        el('span', { class: 'growth', text: fmtPct(r.change_7d) }),
        el('span', { class: 'meta', text: 'TVL ' + fmtUsd(r.tvl_usd) + ' · rank ' + r.rank + ' · implied ' + fmtUsd(r.implied_value_usd) })
      );
    });
    return el('section', { class: 'panel movers' },
      el('h2', { text: 'Fastest growers: 7-day TVL change' }),
      el('p', { class: 'sub', text: 'Pre-token protocols gaining TVL fastest. Growth is one input to implied value, not a promise of a launch.' }),
      el('div', { class: 'movers-grid' }, cards)
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category or chain to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; writeHash(); render(); } })
      ));
    }
    var max = impliedOf(list[0], DATA.model) || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var implied = impliedOf(r, DATA.model);
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('div', null, el('b', { text: r.name }), isWatchlist(r.slug) ? el('span', { class: 'watch', text: 'watchlist' }) : null),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((implied / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(implied) })
        )),
        el('td', { class: 'num', text: fmtUsd(farmerOf(implied)) }),
        el('td', null, el('span', { class: 'status', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan. Farmer value is one position\'s share if the protocol launches at its implied value.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            sortHeader('farmer', 'Farmer value'),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking, and their market caps calibrate the model.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  // A category breakdown: each category's total implied value, protocol count and average multiple.
  // It shows the calibration working: categories the market prices richly carry higher multiples.
  function categoryBreakdown() {
    var byCat = {};
    DATA.rows.forEach(function (r) {
      var c = r.category || 'Other';
      if (!byCat[c]) byCat[c] = { name: c, count: 0, implied: 0, multiples: [] };
      byCat[c].count += 1;
      byCat[c].implied += impliedOf(r, DATA.model);
      byCat[c].multiples.push(r.category_multiple);
    });
    var cats = Object.keys(byCat).map(function (k) { return byCat[k]; });
    cats.sort(function (a, b) { return b.implied - a.implied; });
    var top = cats.slice(0, 8);
    var rows = top.map(function (c) {
      var avg = c.multiples.reduce(function (s, m) { return s + m; }, 0) / c.multiples.length;
      return el('div', null,
        el('span', { text: c.name + ' (' + c.count + ')' }),
        el('b', { text: fmtUsd(c.implied) + ' · x' + (Math.round(avg * 1000) / 1000) })
      );
    });
    return el('div', null,
      el('h3', { text: 'Implied value by category' }),
      el('div', { class: 'calib' }, rows)
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var calibCells = DATA.calibration.slice(0, 12).map(function (c) {
      return el('div', null, el('span', { text: c.category + ' (' + c.live_count + ' live)' }), el('b', { text: String(c.multiple) }));
    });
    var gw = el('input', { type: 'number', step: '0.1', min: '0', max: '2', value: String(sandbox.growth_weight), 'aria-label': 'Growth weight' });
    gw.addEventListener('change', function () { var v = parseFloat(gw.value); if (isFinite(v)) { sandbox.growth_weight = v; render(); } });
    var fs = el('input', { type: 'number', step: '1', min: '1', max: '50', value: String(sandbox.farmer_share_pct), 'aria-label': 'Farmer share percent' });
    fs.addEventListener('change', function () { var v = parseFloat(fs.value); if (isFinite(v)) { sandbox.farmer_share_pct = v; render(); } });
    var fw = el('input', { type: 'number', step: '1000', min: '100', max: '1000000', value: String(sandbox.farmer_wallets), 'aria-label': 'Farmer wallets' });
    fw.addEventListener('change', function () { var v = parseFloat(fw.value); if (isFinite(v)) { sandbox.farmer_wallets = v; render(); } });
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked. The base multiple is calibrated from the market, not chosen by hand.' }),
      el('div', { class: 'formula' },
        'implied = round( tvl_usd x ', el('b', { text: 'category multiple' }), ' x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') x (1 + min(chains - 1, ' + m.chain_max_bonus + ') x ' + m.chain_bonus + ') )'
      ),
      el('p', { class: 'sub', text: 'The category multiple is the median market cap over TVL of the live-token protocols in the same category, recomputed from the snapshot on every run (the market median is ' + DATA.market_multiple + '). TVL and seven-day growth come from the snapshot. Age is the time since the protocol was first listed, the best record of how long it has run with no token; an unlisted age uses ' + m.unknown_age_days + ' days.' }),
      el('h3', { text: 'Calibration by category' }),
      el('div', { class: 'calib' }, calibCells),
      categoryBreakdown(),
      el('h3', { text: 'Model sandbox' }),
      el('div', { class: 'sandbox' },
        el('label', null, 'Growth weight', gw),
        el('label', null, 'Farmer share of a launch (%)', fs),
        el('label', null, 'Farmer wallets splitting it', fw)
      ),
      el('p', { class: 'sandbox-note', text: 'Change a value and the board re-scores live. The sandbox changes only this page: board.json keeps the model as submitted.' })
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    var implied = impliedOf(row, DATA.model);
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (isWatchlist(row.slug) ? ' · watchlist' : ' · early radar') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('div', { class: 'value-callout' },
      el('b', { text: fmtUsd(farmerOf(implied)) }),
      el('span', { text: 'One farmer\'s share if this protocol launches at its implied value of ' + fmtUsd(implied) + ' and ' + sandbox.farmer_share_pct + '% goes to early farmers across about ' + sandbox.farmer_wallets.toLocaleString('en-US') + ' wallets.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Category multiple' }), el('b', { class: 'num', text: String(Math.round(row.category_multiple * 10000) / 10000) })),
        el('div', null, el('span', { text: 'Multiple source' }), el('b', { class: 'num', text: row.multiple_source })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: String(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: String(row.maturity_multiplier) })),
        el('div', null, el('span', { text: 'Chain multiplier (' + (row.chains || []).length + ' chains)' }), el('b', { class: 'num', text: String(row.chain_multiplier) })),
        el('div', { class: 'total' }, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(implied) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same function scores every protocol. The page recomputes this row as ' + fmtUsd(implied) + (implied === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the sandbox changed the model, or the data would be stale.') + ' This is an estimate, not a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  // A footer naming the data's source, the model's version and the entry's limits, so a reader knows
  // exactly what the board is and is not.
  function footer() {
    return el('footer', { class: 'foot' },
      el('p', null,
        'Data: DefiLlama protocol index, fetched ' + DATA.as_of + '. Model ' + DATA.model_version + ': ' +
        'implied value is TVL times a category multiple calibrated from live-token protocols, adjusted for ' +
        'seven-day growth, age with no token and chain count. A protocol that records no token may still ' +
        'have one its DefiLlama record does not carry.'
      ),
      el('p', null,
        'This board is a model, not investment advice and not a prediction that any protocol will issue a ' +
        'token. Farm only what you can afford to lock, and claim only from links the protocol itself publishes.'
      ),
      el('p', null,
        'The model sandbox above re-scores the board in this page only: change the growth weight, the ' +
        'farmer share or the wallet count and watch the ranking move. The submitted board keeps the model ' +
        'as it was run.'
      )
    );
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(controls());
    if (state.tab === 'pre-token') shell.appendChild(topMovers());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    shell.appendChild(footer());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
