// Launch Radar dashboard: renders window.RADAR (written by main.ts) with no network.
// Board, detail view, filters, live-token table, calibration table and a model sandbox
// that re-ranks the board live from the same snapshot figures.
(function () {
  'use strict';
  var D = window.RADAR;
  if (!D) { document.body.textContent = 'No radar data loaded.'; return; }
  var rows = D.rows, live = D.live;

  function $(id) { return document.getElementById(id); }
  function money(n) {
    if (n === null || n === undefined) return '—';
    var a = Math.abs(n);
    if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (a >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n);
  }
  function moneyFull(n) {
    if (n === null || n === undefined) return '—';
    return '$' + Math.round(n).toLocaleString('en-US');
  }
  function pct(v) {
    if (v === null || v === undefined) return '—';
    var s = (v > 0 ? '+' : '') + v.toFixed(1) + '%';
    return '<span class="' + (v > 0 ? 'up' : v < 0 ? 'down' : '') + '">' + s + '</span>';
  }
  function age(v) { return v === null || v === undefined ? '—' : v >= 365 ? (v / 365).toFixed(1) + 'y' : v + 'd'; }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var state = { q: '', cat: '', chain: '', sort: 'implied', wl: false, early: false, view: 'board', sel: null,
    sb: { gw: D.weights.growth_weight, mw: D.weights.maturity_range, bp: D.weights.breadth_per_chain, sc: 1, on: false } };

  // ---- header, stats, selects -------------------------------------------------
  $('meta').textContent = 'Snapshot ' + D.as_of + ' · ' + D.board_size + ' pre-token protocols ranked · ' +
    D.watchlist_size + ' on the watchlist · ' + D.live_size + ' live tokens set aside · source: ' + D.source;
  $('foot').textContent = 'Data: ' + D.source + ', snapshot as of ' + D.as_of + '. This page makes no network ' +
    'requests: all data ships with it. Implied values are the model’s claim, not financial advice.';
  var top1 = rows[0];
  $('stats').innerHTML = [
    ['#' + 1 + ' — ' + top1.name, money(top1.implied_value_usd) + ' implied'],
    ['Board size', D.board_size + ' ranked'],
    ['Watchlist covered', D.watchlist_size + ' / ' + D.watchlist_size],
    ['Early finds', D.early_size + ' below the floor'],
    ['Total implied value', money(D.total_implied_usd)],
  ].map(function (s) { return '<div class="stat"><b>' + esc(s[0]) + '</b><span>' + esc(s[1]) + '</span></div>'; }).join('');

  function fillSelect(el, values) {
    values.forEach(function (v) {
      var o = document.createElement('option'); o.value = v; o.textContent = v; el.appendChild(o);
    });
  }
  fillSelect($('cat'), [...new Set(rows.map(function (r) { return r.category || 'Uncategorized'; }))].sort());
  fillSelect($('chain'), [...new Set(rows.flatMap(function (r) { return r.chains; }))].sort());

  // ---- filtering, sorting, sandbox ---------------------------------------------
  function impliedOf(r) {
    if (!state.sb.on) return r.implied_value_usd;
    var w = D.weights, sb = state.sb;
    var ageEff = r.age_days === null || r.age_days === undefined ? w.unknown_age_days : r.age_days;
    var g = 1 + (r.growth_pct / 100) * sb.gw;
    var m = w.maturity_floor + (Math.min(Math.max(ageEff, 0), w.maturity_days) / w.maturity_days) * sb.mw;
    var b = 1 + sb.bp * Math.min(r.chains.length, w.breadth_max_chains);
    return Math.max(1, Math.round(r.base_usd * sb.sc * g * m * b));
  }
  function visible() {
    var q = state.q.trim().toLowerCase();
    var list = rows.filter(function (r) {
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0) return false;
      if (state.cat && (r.category || 'Uncategorized') !== state.cat) return false;
      if (state.chain && r.chains.indexOf(state.chain) < 0) return false;
      if (state.wl && !r.watchlist) return false;
      if (state.early && r.watchlist) return false;
      return true;
    });
    var key = state.sort;
    var val = function (r) {
      if (key === 'tvl') return r.tvl_usd;
      if (key === 'growth') return r.change_7d === null ? -Infinity : r.change_7d;
      if (key === 'age') return r.age_days === null ? -1 : r.age_days;
      if (key === 'rank') return -r.rank;
      return impliedOf(r);
    };
    list.sort(function (a, b) { return val(b) - val(a) || (a.slug < b.slug ? -1 : 1); });
    return list;
  }

  function renderBoard() {
    var list = visible();
    var maxImp = Math.max.apply(null, list.map(impliedOf).concat([1]));
    $('count').textContent = 'Showing ' + list.length + ' of ' + rows.length + ' ranked protocols' +
      (state.sb.on ? ' · sandbox model active — ranks are exploratory, not the submitted board' : '') + '.';
    $('rows').innerHTML = list.map(function (r) {
      var imp = impliedOf(r);
      var shownRank = state.sb.on ? null : r.rank;
      return '<tr data-slug="' + esc(r.slug) + '"' + (state.sel === r.slug ? ' class="sel"' : '') + '>' +
        '<td class="num">' + (shownRank === null ? '·' : shownRank) + '</td>' +
        '<td class="prot"><span class="nm">' + esc(r.name) + '</span>' +
        (r.watchlist ? '<span class="badge">WATCHLIST</span>' : '') + '<br><span class="sl">' + esc(r.slug) + '</span></td>' +
        '<td>' + esc(r.category || '—') + '</td>' +
        '<td>' + esc(r.chains.slice(0, 2).join(', ') + (r.chains.length > 2 ? ' +' + (r.chains.length - 2) : '') || '—') + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num">' + pct(r.change_7d) + '</td>' +
        '<td class="num">' + age(r.age_days) + '</td>' +
        '<td class="num">' + money(imp) + '</td>' +
        '<td class="bar-cell"><span class="bar" style="width:' + Math.max(2, Math.round(imp / maxImp * 56)) + 'px"></span></td>' +
        '</tr>';
    }).join('');
  }

  function whyHere(r) {
    var bits = [];
    bits.push(r.watchlist ? 'on the watchlist' : 'an early find below the watchlist floor');
    bits.push('TVL ' + money(r.tvl_usd));
    if (r.change_7d !== null && r.change_7d > 10) bits.push('growing ' + r.change_7d.toFixed(1) + '% in 7 days');
    else if (r.change_7d !== null && r.change_7d < -10) bits.push('TVL down ' + Math.abs(r.change_7d).toFixed(1) + '% in 7 days');
    if (r.age_days !== null && r.age_days > 730) bits.push('running ' + (r.age_days / 365).toFixed(1) + ' years with no token');
    if (r.chains.length >= 3) bits.push('live on ' + r.chains.length + ' chains');
    return 'It ranks here because it is ' + bits.join(', ') + ' — and the live market prices its category at ' +
      r.category_multiple + '× TVL.';
  }

  function renderDetail() {
    var box = $('detail');
    var r = rows.find(function (x) { return x.slug === state.sel; });
    if (!r) { box.hidden = true; box.innerHTML = ''; return; }
    box.hidden = false;
    box.innerHTML =
      '<h2>' + esc(r.name) + (r.watchlist ? ' <span class="badge">WATCHLIST</span>' : '') + '</h2>' +
      '<p class="meta-line">' + esc(r.slug) + ' · ' + esc(r.category || 'Uncategorized') + ' · ' + esc(r.chains.join(', ') || '—') +
      ' · tracked since ' + (r.listed_at || 'unknown') + ' · snapshot ' + D.as_of + '</p>' +
      '<div class="kv">' +
      '<div><b>' + moneyFull(r.implied_value_usd) + '</b><span>Implied value (rank #' + r.rank + ')</span></div>' +
      '<div><b>' + moneyFull(r.tvl_usd) + '</b><span>TVL</span></div>' +
      '<div><b>' + (r.change_7d === null ? '—' : (r.change_7d > 0 ? '+' : '') + r.change_7d.toFixed(1) + '%') + '</b><span>TVL change, 7 days</span></div>' +
      '<div><b>' + age(r.age_days) + '</b><span>Age with no token</span></div>' +
      '</div>' +
      '<h3>How the value is built</h3>' +
      '<div class="kv">' +
      '<div><b class="dim-v">' + moneyFull(r.base_usd) + '</b><span>Base = TVL × ' + r.category_multiple + ' (' + esc(r.category || 'Uncategorized') + ' multiple)</span></div>' +
      '<div><b class="dim-v">× ' + r.growth_multiplier + '</b><span>Growth (' + r.growth_pct.toFixed(1) + '% in 7 days)</span></div>' +
      '<div><b class="dim-v">× ' + r.maturity_multiplier + '</b><span>Maturity (' + age(r.age_days) + ' old)</span></div>' +
      '<div><b class="dim-v">× ' + r.breadth_multiplier + '</b><span>Breadth (' + r.chains.length + ' chain' + (r.chains.length === 1 ? '' : 's') + ')</span></div>' +
      '</div>' +
      '<p class="lede">' + esc(whyHere(r)) + '</p>' +
      '<h3>Farm plan — six steps, each with its cost and time</h3>' +
      '<ol class="steps">' + r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>' +
      '<p class="lede">This plan is derived from the protocol’s own record — category, chain, size and age. ' +
      'It is not a prediction of an airdrop, and it names no private deal: the snapshot carries none.</p>';
  }

  function renderLive() {
    $('live-rows').innerHTML = live.map(function (p) {
      return '<tr><td><span class="nm">' + esc(p.name) + '</span> <span class="sl">' + esc(p.slug) + '</span></td>' +
        '<td>' + esc(p.category || '—') + '</td><td>' + esc(p.chains.slice(0, 3).join(', ') || '—') + '</td>' +
        '<td class="num">' + money(p.tvl_usd) + '</td><td class="num">' + money(p.mcap_usd) + '</td>' +
        '<td class="num">' + pct(p.change_7d) + '</td></tr>';
    }).join('');
  }

  function renderCal() {
    $('cal-rows').innerHTML = D.calibration.map(function (c) {
      return '<tr><td>' + esc(c.category) + '</td><td class="num">' + c.multiple.toFixed(3) + '×</td>' +
        '<td class="num">' + c.samples + '</td></tr>';
    }).join('') +
    '<tr><td><strong>Global (fallback)</strong></td><td class="num">' + D.global_multiple.toFixed(3) + '×</td><td class="num">—</td></tr>';
  }

  // ---- events -------------------------------------------------------------------
  function show(view) {
    state.view = view;
    ['board', 'live', 'model'].forEach(function (v) { $('view-' + v).hidden = v !== view; });
    document.querySelectorAll('.tabs button').forEach(function (b) { b.classList.toggle('on', b.dataset.view === view); });
    if (view === 'live') renderLive();
    if (view === 'model') renderCal();
  }
  document.querySelectorAll('.tabs button').forEach(function (b) {
    b.addEventListener('click', function () { show(b.dataset.view); });
  });
  $('q').addEventListener('input', function (e) { state.q = e.target.value; renderBoard(); });
  $('cat').addEventListener('change', function (e) { state.cat = e.target.value; renderBoard(); });
  $('chain').addEventListener('change', function (e) { state.chain = e.target.value; renderBoard(); });
  $('sort').addEventListener('change', function (e) { state.sort = e.target.value; renderBoard(); });
  $('wl').addEventListener('change', function (e) { state.wl = e.target.checked; renderBoard(); });
  $('early').addEventListener('change', function (e) { state.early = e.target.checked; renderBoard(); });
  $('rows').addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-slug]');
    if (!tr) return;
    state.sel = state.sel === tr.dataset.slug ? null : tr.dataset.slug;
    renderBoard(); renderDetail();
    if (state.sel) $('detail').scrollIntoView({ block: 'nearest' });
  });

  // ---- sandbox ------------------------------------------------------------------
  function sbRead() {
    var sb = state.sb;
    sb.gw = parseFloat($('sb-gw').value); sb.mw = parseFloat($('sb-mw').value);
    sb.bp = parseFloat($('sb-bp').value); sb.sc = parseFloat($('sb-sc').value);
    $('sb-gw-v').textContent = sb.gw.toFixed(2);
    $('sb-mw-v').textContent = sb.mw.toFixed(2);
    $('sb-bp-v').textContent = sb.bp.toFixed(3);
    $('sb-sc-v').textContent = sb.sc.toFixed(1) + '×';
    var w = D.weights;
    sb.on = sb.gw !== w.growth_weight || sb.mw !== w.maturity_range || sb.bp !== w.breadth_per_chain || sb.sc !== 1;
    var note = $('sb-note');
    note.classList.toggle('off', !sb.on);
    note.textContent = sb.on
      ? 'Sandbox on — the board is re-ranked with growth ' + sb.gw.toFixed(2) + ', maturity ' + sb.mw.toFixed(2) +
        ', breadth ' + sb.bp.toFixed(3) + ', base ×' + sb.sc.toFixed(1) + '. Exploratory only; the submitted board is unchanged.'
      : 'Sandbox off — the board shows the submitted model.';
    renderBoard();
  }
  ['sb-gw', 'sb-mw', 'sb-bp', 'sb-sc'].forEach(function (id) {
    $(id).addEventListener('input', sbRead);
  });
  $('sb-reset').addEventListener('click', function () {
    var w = D.weights;
    $('sb-gw').value = w.growth_weight; $('sb-mw').value = w.maturity_range;
    $('sb-bp').value = w.breadth_per_chain; $('sb-sc').value = 1;
    sbRead();
  });

  // ---- screenshot staging (?shot=board | detail&slug=… | filtered&category=…&watchlist=1) ----
  var params = new URLSearchParams(location.search);
  var shot = params.get('shot') || 'board';
  if (params.get('category')) { state.cat = params.get('category'); $('cat').value = state.cat; }
  if (params.get('chain')) { state.chain = params.get('chain'); $('chain').value = state.chain; }
  if (params.get('watchlist') === '1') { state.wl = true; $('wl').checked = true; }
  if (params.get('early') === '1') { state.early = true; $('early').checked = true; }
  if (params.get('q')) { state.q = params.get('q'); $('q').value = state.q; }
  if (shot === 'detail') {
    state.sel = params.get('slug') || rows[0].slug;
  }
  renderBoard();
  renderDetail();
  if (shot === 'detail' && state.sel) {
    setTimeout(function () { $('detail').scrollIntoView({ block: 'start' }); }, 50);
  }
  window.__shot = { view: shot, slug: state.sel, rows: visible().length };
})();
