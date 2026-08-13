/* Search Console reporting UI — dependency-free.
 *
 * Reads the local Postgres archive via /api, so it shows history Google itself
 * no longer holds, and costs nothing per view.
 */
(() => {
  const $ = (sel) => document.querySelector(sel);
  const view = () => $('#view');

  let days = 90;
  let route = { name: 'sites' };

  // ---------- helpers ----------
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString());
  const pos = (n) => (n == null ? '—' : Number(n).toFixed(1));

  /** Position is "lower is better", so a positive delta is an improvement. */
  const deltaHtml = (d, suffix = '') => {
    if (d == null || Number.isNaN(d)) return '<span class="flat">—</span>';
    const cls = d > 0 ? 'up' : d < 0 ? 'down' : 'flat';
    const sign = d > 0 ? '▲' : d < 0 ? '▼' : '·';
    return `<span class="${cls}">${sign} ${Math.abs(d).toLocaleString()}${suffix}</span>`;
  };

  async function api(path) {
    const res = await fetch(`/api${path}${path.includes('?') ? '&' : '?'}days=${days}`);
    if (res.status === 401) { showLogin(); throw new Error('unauthorised'); }
    if (!res.ok) throw new Error(`API ${res.status}`);
    return res.json();
  }

  // ---------- charts ----------
  /** Line chart. `invert` flips the Y axis for rank (lower = better = higher up). */
  function lineChart(points, key, { invert = false, height = 220 } = {}) {
    const vals = points.map((p) => p[key]).filter((v) => v != null);
    if (vals.length < 2) return '<div class="empty">Not enough history yet</div>';

    const W = 800, H = height, padL = 44, padR = 12, padT = 12, padB = 26;
    let min = Math.min(...vals), max = Math.max(...vals);
    if (min === max) { min -= 1; max += 1; }
    const range = max - min;
    min -= range * 0.08; max += range * 0.08;

    const x = (i) => padL + (i * (W - padL - padR)) / (points.length - 1);
    const y = (v) => {
      const t = (v - min) / (max - min);
      return invert ? padT + t * (H - padT - padB) : H - padB - t * (H - padT - padB);
    };

    let d = '', area = '', started = false;
    points.forEach((p, i) => {
      const v = p[key];
      if (v == null) return;
      d += `${started ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      started = true;
    });
    const firstI = points.findIndex((p) => p[key] != null);
    const lastI = points.length - 1 - [...points].reverse().findIndex((p) => p[key] != null);
    if (started) area = `${d}L${x(lastI).toFixed(1)},${H - padB}L${x(firstI).toFixed(1)},${H - padB}Z`;

    const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => {
      const v = min + t * (max - min);
      return `<line class="gridline" x1="${padL}" x2="${W - padR}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/>
              <text class="lbl" x="${padL - 6}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end">${
                key === 'position' ? v.toFixed(0) : Math.round(v).toLocaleString()}</text>`;
    }).join('');

    const labels = [0, Math.floor(points.length / 2), points.length - 1].map((i) =>
      `<text class="lbl" x="${x(i).toFixed(1)}" y="${H - 8}" text-anchor="${
        i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}">${points[i].date}</text>`).join('');

    return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      ${ticks}<path class="area" d="${area}"/><path class="line" d="${d}"/>${labels}</svg>`;
  }

  function barList(items, nameKey, valKey, colour = 'var(--accent)') {
    if (!items.length) return '<div class="empty">No data</div>';
    const max = Math.max(...items.map((i) => Number(i[valKey]) || 0)) || 1;
    return items.map((i) => `
      <div class="bar-row">
        <div class="name" title="${esc(i[nameKey])}">${esc(i[nameKey])}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${
          ((Number(i[valKey]) || 0) / max) * 100}%;background:${colour}"></div></div>
        <div class="n">${fmt(i[valKey])}</div>
      </div>`).join('');
  }

  function table(cols, rows, onRow) {
    if (!rows.length) return '<div class="empty">No data</div>';
    const head = cols.map((c) => `<th class="${c.num ? 'num' : ''}">${esc(c.label)}</th>`).join('');
    const body = rows.map((r, idx) => {
      const tds = cols.map((c) => `<td class="${c.num ? 'num' : ''} ${c.trunc ? 'trunc' : ''}" ${
        c.trunc ? `title="${esc(c.get(r))}"` : ''}>${c.html ? c.html(r) : esc(c.get(r))}</td>`).join('');
      return `<tr class="${onRow ? 'clickable' : ''}" data-idx="${idx}">${tds}</tr>`;
    }).join('');
    return `<div class="scroll"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
  }

  function wireRows(container, rows, handler) {
    container.querySelectorAll('tr.clickable').forEach((tr) => {
      tr.addEventListener('click', () => handler(rows[Number(tr.dataset.idx)]));
    });
  }

  // ---------- views ----------
  async function renderSites() {
    view().innerHTML = '<div class="spinner">Loading…</div>';
    $('#crumbs').innerHTML = '';
    const sites = await api('/sites');

    const totals = sites.reduce((a, s) => ({
      clicks: a.clicks + s.clicks, impressions: a.impressions + s.impressions,
      indexed: a.indexed + s.indexed, discovered: a.discovered + s.discovered,
    }), { clicks: 0, impressions: 0, indexed: 0, discovered: 0 });

    view().innerHTML = `
      <section class="grid stats">
        ${stat('Sites', sites.length)}
        ${stat('Clicks (28d)', fmt(totals.clicks))}
        ${stat('Impressions (28d)', fmt(totals.impressions))}
        ${stat('Indexed', `${fmt(totals.indexed)} <span class="muted" style="font-size:14px">/ ${fmt(totals.discovered)}</span>`)}
      </section>
      <section>
        <h2>Sites</h2>
        <div class="grid cards">${sites.map(siteCard).join('')}</div>
      </section>`;

    view().querySelectorAll('.card').forEach((el) => {
      el.addEventListener('click', () => go({ name: 'site', siteUrl: el.dataset.site }));
    });
  }

  const stat = (label, value, delta = '') =>
    `<div class="panel stat"><div class="label">${esc(label)}</div><div class="value">${value}</div>${
      delta ? `<div class="delta">${delta}</div>` : ''}</div>`;

  function siteCard(s) {
    const coverage = s.inspected ? Math.round((s.indexed / s.inspected) * 100) : null;
    return `<div class="card" data-site="${esc(s.siteUrl)}">
      <h3>${esc(s.domain)}</h3>
      <div class="sub">${esc(s.customer || '—')}${
        s.primaryLocation ? ` · ${esc(s.primaryLocation)}` : ' · <span class="badge warn">no location</span>'}</div>
      <div class="row"><span class="muted">Clicks (28d)</span><span>${fmt(s.clicks)} ${deltaHtml(s.clicksChange)}</span></div>
      <div class="row"><span class="muted">Impressions</span><span>${fmt(s.impressions)}</span></div>
      <div class="row"><span class="muted">Avg position</span><span>${pos(s.position)} ${deltaHtml(s.positionChange)}</span></div>
      <div class="row"><span class="muted">Indexed</span><span>${
        coverage == null ? '—' : `${coverage}% <span class="muted">(${s.indexed}/${s.inspected})</span>`}</span></div>
      <div class="row"><span class="muted">Queries</span><span>${fmt(s.queries)}</span></div>
    </div>`;
  }

  async function renderSite(siteUrl) {
    view().innerHTML = '<div class="spinner">Loading…</div>';
    const d = await api(`/site?siteUrl=${encodeURIComponent(siteUrl)}`);
    $('#crumbs').innerHTML = `<a id="back">Sites</a> / <span>${esc(d.profile.domain)}</span>`;
    $('#back').addEventListener('click', () => go({ name: 'sites' }));

    const notIndexed = d.problems.length;
    view().innerHTML = `
      <section class="grid stats">
        ${stat('Clicks', fmt(d.trend.reduce((a, t) => a + t.clicks, 0)))}
        ${stat('Impressions', fmt(d.trend.reduce((a, t) => a + t.impressions, 0)))}
        ${stat('Queries', fmt(d.topQueries.length))}
        ${stat('Not indexed', fmt(notIndexed))}
      </section>

      <section class="grid cols-2">
        <div class="panel"><h2>Clicks &amp; impressions</h2>${lineChart(d.trend, 'impressions')}</div>
        <div class="panel"><h2>Average position <span class="muted">(higher is better)</span></h2>${
          lineChart(d.trend, 'position', { invert: true })}</div>
      </section>

      <section class="grid cols-2">
        <div class="panel"><h2>Climbing</h2>${moversTable(d.climbers)}</div>
        <div class="panel"><h2>Falling</h2>${moversTable(d.fallers)}</div>
      </section>

      <section class="grid cols-2">
        <div class="panel"><h2>Index coverage</h2>${
          d.coverage.length ? barList(d.coverage.map((c) => ({
            name: c.coverage_state || c.verdict || 'unknown', count: c.count })), 'name', 'count')
            : '<div class="empty">Not inspected yet</div>'}</div>
        <div class="panel"><h2>Competitors seen in results</h2>${
          d.competitors.length ? barList(d.competitors, 'domain', 'appearances', 'var(--warn)')
            : '<div class="empty">No SERP data — add tracked queries to this site</div>'}</div>
      </section>

      <section class="panel"><h2>Top queries</h2><div id="q-table"></div></section>
      <section class="panel"><h2>Top pages</h2><div id="p-table"></div></section>
      ${notIndexed ? `<section class="panel"><h2>Pages not indexed</h2><div id="x-table"></div></section>` : ''}`;

    const qt = $('#q-table');
    qt.innerHTML = table([
      { label: 'Query', get: (r) => r.query, trunc: true },
      { label: 'Clicks', get: (r) => fmt(r.clicks), num: true },
      { label: 'Impressions', get: (r) => fmt(r.impressions), num: true },
      { label: 'Position', get: (r) => pos(r.position), num: true },
    ], d.topQueries, true);
    wireRows(qt, d.topQueries, (r) => go({ name: 'query', siteUrl, query: r.query }));

    $('#p-table').innerHTML = table([
      { label: 'Page', get: (r) => r.page, trunc: true },
      { label: 'Clicks', get: (r) => fmt(r.clicks), num: true },
      { label: 'Impressions', get: (r) => fmt(r.impressions), num: true },
      { label: 'Position', get: (r) => pos(r.position), num: true },
    ], d.topPages);

    if (notIndexed) {
      $('#x-table').innerHTML = table([
        { label: 'URL', get: (r) => r.url, trunc: true },
        { label: 'State', get: (r) => r.coverage_state || '—' },
        { label: 'Last crawl', get: (r) => (r.last_crawl_time || '—').slice(0, 10) },
      ], d.problems);
    }
  }

  const moversTable = (rows) => rows.length ? table([
    { label: 'Query', get: (r) => r.query, trunc: true },
    { label: 'Was', get: (r) => pos(r.before), num: true },
    { label: 'Now', get: (r) => pos(r.after), num: true },
    { label: 'Move', num: true, get: (r) => r.movement, html: (r) => deltaHtml(r.movement) },
  ], rows) : '<div class="empty">Not enough history yet</div>';

  async function renderQuery(siteUrl, q) {
    view().innerHTML = '<div class="spinner">Loading…</div>';
    const d = await api(`/query?siteUrl=${encodeURIComponent(siteUrl)}&query=${encodeURIComponent(q)}`);
    $('#crumbs').innerHTML = `<a id="back">Sites</a> / <a id="back2">${esc(siteUrl.replace('sc-domain:', ''))}</a> / <span>${esc(q)}</span>`;
    $('#back').addEventListener('click', () => go({ name: 'sites' }));
    $('#back2').addEventListener('click', () => go({ name: 'site', siteUrl }));

    const first = d.series.find((s) => s.position != null);
    const last = [...d.series].reverse().find((s) => s.position != null);
    view().innerHTML = `
      <section class="grid stats">
        ${stat('Clicks', fmt(d.series.reduce((a, s) => a + s.clicks, 0)))}
        ${stat('Impressions', fmt(d.series.reduce((a, s) => a + s.impressions, 0)))}
        ${stat('Position now', pos(last?.position))}
        ${stat('Movement', deltaHtml(first && last ? Number((first.position - last.position).toFixed(1)) : null))}
      </section>
      <section class="panel"><h2>Position over time <span class="muted">(higher is better)</span></h2>
        ${lineChart(d.series, 'position', { invert: true, height: 260 })}</section>
      <section class="panel"><h2>Impressions</h2>${lineChart(d.series, 'impressions')}</section>
      <section class="panel"><h2>Pages ranking for this query</h2>${table([
        { label: 'Page', get: (r) => r.page, trunc: true },
        { label: 'Impressions', get: (r) => fmt(r.impressions), num: true },
        { label: 'Position', get: (r) => pos(r.position), num: true },
      ], d.pages)}</section>`;
  }

  // ---------- routing ----------
  function go(next) {
    route = next;
    const p = new URLSearchParams();
    if (next.siteUrl) p.set('site', next.siteUrl);
    if (next.query) p.set('q', next.query);
    history.pushState(next, '', `/?${p}`);
    render();
  }

  function render() {
    const done = (p) => p.catch((e) => {
      if (e.message !== 'unauthorised') view().innerHTML = `<div class="empty">${esc(e.message)}</div>`;
    });
    if (route.name === 'site') return done(renderSite(route.siteUrl));
    if (route.name === 'query') return done(renderQuery(route.siteUrl, route.query));
    return done(renderSites());
  }

  function routeFromUrl() {
    const p = new URLSearchParams(location.search);
    const site = p.get('site'), q = p.get('q');
    return q && site ? { name: 'query', siteUrl: site, query: q }
      : site ? { name: 'site', siteUrl: site } : { name: 'sites' };
  }

  window.addEventListener('popstate', () => { route = routeFromUrl(); render(); });

  // ---------- auth ----------
  function showLogin() { $('#login').classList.remove('hidden'); $('#app').classList.add('hidden'); }
  function showApp() { $('#login').classList.add('hidden'); $('#app').classList.remove('hidden'); }

  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const res = await fetch('/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: $('#password').value }),
    });
    if (res.ok) { $('#login-error').classList.add('hidden'); showApp(); render(); }
    else $('#login-error').classList.remove('hidden');
  });

  $('#logout').addEventListener('click', async () => {
    await fetch('/logout', { method: 'POST' });
    location.reload();
  });

  $('#range').addEventListener('change', (e) => { days = Number(e.target.value); render(); });
  $('#home-link').addEventListener('click', () => go({ name: 'sites' }));

  // ---------- boot ----------
  (async () => {
    route = routeFromUrl();
    const res = await fetch('/api/sites?days=28');
    if (res.status === 401) return showLogin();
    showApp();
    render();
  })();
})();
