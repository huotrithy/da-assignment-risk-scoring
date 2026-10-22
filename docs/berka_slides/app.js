(() => {
  'use strict';

  /* ---------------- data (from berka/output/summary.json + metric_iv.csv) ---------------- */
  const WOE_BINS = [ // min_balance quintiles: [label, loans, bad]
    ['≤ 500', 159, 42], ['500 – 900', 121, 13], ['900 – 9.9k', 129, 19], ['9.9k – 18.3k', 136, 1], ['> 18.3k', 137, 1]];
  const TOTAL_BAD = 76, TOTAL_GOOD = 606;
  const IV = [ // metric, IV, noise threshold (chance + 2 SD)
    ['months_with_neg_balance', 2.035, .073], ['neg_balance_share', 1.801, .127], ['sanction_count', 1.547, .100],
    ['min_balance', 1.441, .136], ['cash_share', .934, .131], ['n_disponents', .906, .063], ['balance_slope', .558, .155],
    ['payment_to_inflow', .348, .146], ['loan_amount', .314, .148], ['avg_balance', .258, .130],
    ['amount_to_annual_inflow', .229, .131], ['txn_per_month', .131, .141], ['has_card', .123, .065],
    ['tenure_months', .102, .141], ['outflow_to_inflow', .093, .143], ['district_urban_ratio', .084, .139],
    ['income_source_types', .070, .059], ['district_unemployment', .064, .153], ['age', .021, .146],
    ['loan_duration', .020, .149], ['monthly_statement', .017, .049], ['district_salary', .014, .142],
    ['inflow_per_month', .013, .139], ['is_female', .004, .055]];
  const CRIT = [ // name, sub, color, judgment %, data %
    ['Payment Behavior', 'overdraft conduct (proxy)', '#ff5d6c', 35, 51.3], ['Income & Capacity', 'income is a proxy', '#5ab0ff', 25, 5.1],
    ['Transaction Behavior', 'how the account is used', '#22d3a0', 20, 21.6], ['Account Relationship', 'ties to the bank', '#f5c542', 10, 14.6],
    ['Demographics & Loan', 'light adjustment', '#b48cff', 10, 7.4]];
  const AUC = [ // label, sub, mean, hero
    ['Data-derived weights', 'this deck', .914, true], ['Equal weights', 'same points', .904], ['Judgment 35/25/20/10/10', 'same points', .893],
    ['Logistic regression', 'reference ceiling', .923], ['Best single metric', 'min_balance alone', .673], ['Coin flip', '', .5]];
  const CTEST = [ // label, sub, AUC change, share of folds where variant beats baseline, verdict
    ['drop', 'Payment Behavior', '', -.022, 13, 'Keep'], ['drop', 'Income & Capacity', '', .006, 65, 'Droppable; keep (policy)'],
    ['drop', 'Transaction Behavior', '', -.073, 1, 'Essential'], ['drop', 'Account Relationship', '', -.026, 1, 'Keep'],
    ['drop', 'Demographics & Loan', '', .003, 42, 'Free to drop'],
    ['add', 'Cash-flow stability', 'volatility, liquidity', .007, 69, 'Small gain, optional'],
    ['add', 'Existing commitments', 'standing orders (undated)', .001, 51, 'No gain'], ['add', 'Both new', '', .007, 59, 'No real gain']];
  const GRADES = [ // grade, range, loans, bad, color
    ['A', '≥ 750', 89, 0, '#22d3a0'], ['B', '680–749', 105, 0, '#7bd88f'], ['C', '600–679', 175, 3, '#f5c542'],
    ['D', '500–599', 201, 18, '#ff9f43'], ['E', '< 500', 112, 55, '#ff5d6c']];

  /* ---------------- helpers ---------------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const slides = $$('.slide');
  const isStatic = /[?&]static/.test(location.search); // ?static = no animation (screenshots, PDF export)
  if (isStatic) document.documentElement.classList.add('static');
  const reduce = isStatic || matchMedia('(prefers-reduced-motion: reduce)').matches;
  let timers = [], rafs = [], idx = -1;
  const later = (fn, ms) => { timers.push(setTimeout(fn, reduce ? 0 : ms)); };
  const ease = t => 1 - Math.pow(1 - t, 4);
  function tween(from, to, ms, fn, done) {
    if (reduce) { fn(to); done && done(); return; }
    const t0 = performance.now();
    const step = now => {
      const k = Math.max(0, Math.min(1, (now - t0) / ms));
      fn(from + (to - from) * ease(k));
      if (k < 1) rafs.push(requestAnimationFrame(step)); else done && done();
    };
    rafs.push(requestAnimationFrame(step));
  }
  function rng(seed) { // mulberry32: deterministic, so the dots are the same every visit
    return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  const N = 682, COLS = 38;
  const order = (() => { const r = rng(7), a = [...Array(N).keys()];
    for (let i = N - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; })();

  /* ---------------- per-slide animations ---------------- */
  const enter = {
    dots1() { buildDots('dots1'); const bad = order.slice(0, 76); const els = $('#dots1').children;
      bad.forEach((n, i) => later(() => els[n].classList.add('bad'), 2200 + i * 40)); },

    dots2() { buildDots('dots2'); const els = $('#dots2').children;
      order.slice(0, 26).forEach((n, i) => later(() => els[n].classList.add('bad', 'pulse'), 2000 + i * 60));
      order.slice(26, 76).forEach((n, i) => later(() => els[n].classList.add('amb'), 3700 + i * 25)); },

    woe() {
      const box = $('#woe'); box.innerHTML = '';
      const rows = WOE_BINS.map(([lab, n, b]) => {
        const g = n - b, woe = Math.log(((g + .5) / (TOTAL_GOOD + .5)) / ((b + .5) / (TOTAL_BAD + .5)));
        return { lab, n, b, woe, rate: b / n };
      });
      const max = Math.max(...rows.map(r => Math.abs(r.woe)));
      rows.forEach((r, i) => {
        const row = document.createElement('div'); row.className = 'wrow reveal'; row.style.setProperty('--i', 2 + i * .6);
        row.innerHTML = `<div class="lab">${r.lab}<small>${(r.rate * 100).toFixed(1)}% bad · ${r.b}/${r.n}</small></div>
          <div class="wtrack"><div class="wbar ${r.woe >= 0 ? 'pos' : 'neg'}"></div></div><div class="wval">0.00</div>`;
        box.appendChild(row);
        const bar = $('.wbar', row), val = $('.wval', row);
        later(() => { bar.style.width = (Math.abs(r.woe) / max * 46) + '%';
          tween(0, r.woe, 1300, v => { val.textContent = (v >= 0 ? '+' : '') + v.toFixed(2); val.style.color = r.woe >= 0 ? 'var(--teal)' : 'var(--red)'; }); }, 900 + i * 220);
      });
    },

    iv() {
      const box = $('#ivchart'); box.innerHTML = '';
      const sc = v => Math.sqrt(v / 2.1) * 100;
      IV.forEach(([name, iv, thr], i) => {
        const keep = iv > thr, row = document.createElement('div'); row.className = 'ivrow';
        row.innerHTML = `<div class="n">${name}</div><div class="ivtrack"><div class="ivbar ${keep ? 'keep' : 'drop'}"></div><div class="ivmark" style="left:${sc(thr)}%"></div></div><div class="ivval">${iv.toFixed(2)}</div>`;
        box.appendChild(row);
        later(() => { $('.ivbar', row).style.width = Math.max(sc(iv), .6) + '%'; }, 500 + i * 45);
      });
      const cap = document.createElement('div'); cap.className = 'muted'; cap.style.cssText = 'font-size:.9em;margin-top:6px;text-align:right';
      cap.textContent = 'Information Value (square-root scale so small bars stay visible)'; box.appendChild(cap);
    },

    weights() {
      const box = $('#wbars'); box.innerHTML = ''; let mode = 'judgment';
      const label = $('#wLabel'), btn = $('#wBtn');
      const rows = CRIT.map(([name, sub, c, j, d], i) => {
        const el = document.createElement('div'); el.className = 'wb reveal'; el.style.cssText = `--i:${2 + i * .5};--c:${c}`;
        el.innerHTML = `<div class="nm">${name}<small>${sub}</small></div><div class="wtrk"><div class="wghost" style="left:0"></div><div class="wfill"><span>0%</span></div></div>`;
        box.appendChild(el); return { el, j, d, fill: $('.wfill', el), txt: $('.wfill span', el), ghost: $('.wghost', el), cur: 0 };
      });
      const show = m => { mode = m;
        label.textContent = m === 'data' ? 'showing: data-derived (white tick = judgment)' : 'showing: judgment (white tick = data-derived)';
        rows.forEach(r => { const to = m === 'data' ? r.d : r.j, other = m === 'data' ? r.j : r.d;
          r.fill.style.width = (to / 60 * 100) + '%'; r.ghost.style.left = (other / 60 * 100) + '%';
          tween(r.cur, to, 1300, v => { r.txt.textContent = v.toFixed(v % 1 ? 1 : 0) + '%'; }); r.cur = to; }); };
      btn.onclick = () => show(mode === 'data' ? 'judgment' : 'data');
      later(() => show('judgment'), 1000);
      later(() => show('data'), 3200); // the reveal: judgment morphs into the measured weights
    },

    gauge() {
      const range = $('#gRange');
      const set = s => { s = Math.round(s); range.value = s; renderGauge(s); };
      range.oninput = () => renderGauge(+range.value);
      later(() => tween(300, 640, 1800, set, () => tween(640, 600, 900, set)), 700);
    },

    auc() {
      const box = $('#aucs'); box.innerHTML = '';
      AUC.forEach(([lab, sub, v, hero], i) => {
        const el = document.createElement('div'); el.className = 'arow reveal' + (hero ? ' hero' : ''); el.style.setProperty('--i', 1 + i * .8);
        el.innerHTML = `<div class="nm">${lab}<small>${sub}</small></div><div class="atrk"><div class="afill"></div></div><div class="aval">0.000</div>`;
        box.appendChild(el);
        later(() => { $('.afill', el).style.width = ((v - .5) / .5 * 100 || 1) + '%';
          tween(.5, v, 1300, x => { $('.aval', el).textContent = x.toFixed(3); }); }, 800 + i * 280);
      });
    },

    ctest() {
      const box = $('#ctest'); box.innerHTML = '';
      const sep = t => { const e = document.createElement('div'); e.className = 'csep'; e.textContent = t; box.appendChild(e); };
      CTEST.forEach(([kind, name, sub, d, win, verdict], i) => {
        if (i === 0) sep('Drop one criterion'); if (i === 5) sep('Add a new criterion');
        const el = document.createElement('div'); el.className = 'crow reveal'; el.style.setProperty('--i', 2 + i * .35);
        const cls = Math.abs(d) < .01 ? 'tiny ' + (d >= 0 ? 'pos' : 'neg') : (d >= 0 ? 'pos' : 'neg');
        el.innerHTML = `<div class="nm">${kind === 'add' ? '+ ' : '− '}${name}<small>${sub}</small></div><div class="ctrk"><div class="cbar ${cls}"></div></div><div class="cv"><span>0.000</span><small>${verdict} · ${win}% folds</small></div>`;
        box.appendChild(el);
        later(() => { $('.cbar', el).style.width = (Math.abs(d) / .08 * 50) + '%';
          tween(0, d, 1200, v => { $('.cv span', el).textContent = (v >= 0 ? '+' : '') + v.toFixed(3); }); }, 900 + i * 220);
      });
    },

    scale() {
      const r = $('#sRange');
      const draw = s => { s = Math.round(s); r.value = s;
        const pd = 1 / (1 + 20 * Math.pow(2, (s - 600) / 50));
        $('#m1').style.left = (s - 300) / 550 * 100 + '%'; $('#v1').textContent = s;
        $('#m2').style.left = (s - 300) / 550 * 100 + '%'; $('#v2').textContent = Math.round((s - 300) / 550 * 1000);
        $('#m3').style.left = pd * 100 + '%'; $('#v3').textContent = (pd * 100 < 1 ? (pd * 100).toFixed(2) : (pd * 100).toFixed(1)) + '%'; };
      r.oninput = () => draw(+r.value);
      later(() => tween(300, 800, 2200, draw, () => tween(800, 600, 1000, draw)), 900);
    },

    grades() {
      const box = $('#gradechart'); box.innerHTML = '';
      GRADES.forEach(([g, rng_, n, b, c], i) => {
        const rate = b / n, col = document.createElement('div'); col.className = 'gcol reveal'; col.style.cssText = `--i:${1 + i * .5};--c:${c}`;
        col.innerHTML = `<div class="gbar"><span class="gpct">0%</span><div class="glab"><b>${g}</b><small>${rng_}</small><br><small>${b} / ${n}</small></div></div>`;
        box.appendChild(col);
        later(() => { $('.gbar', col).style.height = Math.max(rate / .5 * 100, 1.5) + '%';
          tween(0, rate * 100, 1400, v => { $('.gpct', col).textContent = v.toFixed(v < 10 && v > 0 ? 1 : 0) + '%'; }); }, 900 + i * 300);
      });
    }
  };

  function buildDots(id) {
    const box = document.getElementById(id); box.innerHTML = '';
    for (let i = 0; i < 684; i++) { const e = document.createElement('i');
      e.style.setProperty('--d', ((i % COLS) + Math.floor(i / COLS)) * 22 + 300);
      if (i >= N) e.style.display = 'none'; box.appendChild(e); }
  }

  function renderGauge(s) {
    $('#gFill').style.strokeDasharray = `${(s - 300) / 550 * 100} 100`;
    const odds = 20 * Math.pow(2, (s - 600) / 50), pd = 1 / (1 + odds);
    const g = s >= 750 ? 'A' : s >= 680 ? 'B' : s >= 600 ? 'C' : s >= 500 ? 'D' : 'E';
    $('#gScore').textContent = s; $('#gGrade').textContent = g;
    $('#gGrade').style.color = { A: '#22d3a0', B: '#7bd88f', C: '#f5c542', D: '#ff9f43', E: '#ff5d6c' }[g];
    $('#gOdds').textContent = (odds >= 10 ? Math.round(odds) : odds.toFixed(1)) + ' : 1';
    $('#gPd').textContent = (pd * 100 < 1 ? (pd * 100).toFixed(2) : (pd * 100).toFixed(1)) + '%';
  }

  function runCounters(slide) {
    $$('[data-count]', slide).forEach(el => {
      const to = +el.dataset.count, dec = +(el.dataset.dec || 0), suf = el.dataset.suf || '';
      el.textContent = (0).toFixed(dec) + suf;
      later(() => tween(0, to, 1600, v => { el.textContent = v.toFixed(dec) + suf; }), 700);
    });
  }

  /* ---------------- navigation ---------------- */
  const dotsNav = $('#dotsnav'), bar = $('#bar'), counter = $('#counter');
  slides.forEach((_, i) => { const d = document.createElement('i'); d.onclick = () => go(i); dotsNav.appendChild(d); });

  function go(n) {
    n = Math.max(0, Math.min(slides.length - 1, n)); if (n === idx) return;
    timers.forEach(clearTimeout); rafs.forEach(cancelAnimationFrame); timers = []; rafs = [];
    slides.forEach((s, i) => { s.classList.toggle('active', i === n); s.classList.toggle('prev', i < n); });
    idx = n;
    $$('.dotsnav i').forEach((d, i) => d.classList.toggle('on', i === n));
    bar.style.width = ((n + 1) / slides.length * 100) + '%';
    counter.textContent = `${n + 1} / ${slides.length}`;
    history.replaceState(null, '', '#' + (n + 1));
    const s = slides[n]; runCounters(s);
    const fn = enter[s.dataset.enter]; fn && fn();
  }
  const next = () => go(idx + 1), prev = () => go(idx - 1);
  const toggleWhy = () => document.body.classList.toggle('show-why');

  $('#next').onclick = next; $('#prev').onclick = prev; $('#whyBtn').onclick = toggleWhy;
  addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' && (e.key.startsWith('Arrow'))) return; // let the slider use arrows
    const k = e.key;
    if (['ArrowRight', 'PageDown', ' ', 'Enter'].includes(k)) { e.preventDefault(); next(); }
    else if (['ArrowLeft', 'PageUp', 'Backspace'].includes(k)) { e.preventDefault(); prev(); }
    else if (k === 'Home') go(0); else if (k === 'End') go(slides.length - 1);
    else if (k === 'e' || k === 'E') toggleWhy();
    else if (k === 'f' || k === 'F') document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.();
    else if (k === 'Escape') document.body.classList.remove('show-why');
  });
  let sx = null;
  addEventListener('touchstart', e => { sx = e.touches[0].clientX; }, { passive: true });
  addEventListener('touchend', e => { if (sx == null) return; const dx = e.changedTouches[0].clientX - sx;
    if (Math.abs(dx) > 60) dx < 0 ? next() : prev(); sx = null; });
  addEventListener('hashchange', () => go((parseInt(location.hash.slice(1)) || 1) - 1));

  /* ---------------- animated background ---------------- */
  (function bg() {
    const cv = $('#bg'), cx = cv.getContext('2d'); let W, H, P = [], mx = .5, my = .5;
    const resize = () => { const r = devicePixelRatio || 1; W = cv.width = innerWidth * r; H = cv.height = innerHeight * r; cx.setTransform(1, 0, 0, 1, 0, 0);
      P = Array.from({ length: Math.round(innerWidth * innerHeight / 22000) }, () => ({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - .5) * .35 * r, vy: (Math.random() - .5) * .35 * r })); };
    addEventListener('resize', resize); resize();
    addEventListener('mousemove', e => { mx = e.clientX / innerWidth; my = e.clientY / innerHeight; });
    const draw = () => {
      cx.clearRect(0, 0, W, H); const r = devicePixelRatio || 1, L = 150 * r;
      for (const p of P) { p.x += p.vx + (mx - .5) * .15; p.y += p.vy + (my - .5) * .15;
        if (p.x < 0) p.x = W; if (p.x > W) p.x = 0; if (p.y < 0) p.y = H; if (p.y > H) p.y = 0; }
      for (let i = 0; i < P.length; i++) { const a = P[i];
        cx.fillStyle = 'rgba(120,200,255,.55)'; cx.beginPath(); cx.arc(a.x, a.y, 1.6 * r, 0, 6.3); cx.fill();
        for (let j = i + 1; j < P.length; j++) { const b = P[j], d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < L) { cx.strokeStyle = `rgba(120,200,255,${(1 - d / L) * .16})`; cx.lineWidth = r; cx.beginPath(); cx.moveTo(a.x, a.y); cx.lineTo(b.x, b.y); cx.stroke(); } } }
      if (!reduce) requestAnimationFrame(draw);
    };
    draw();
  })();

  go((parseInt(location.hash.slice(1)) || 1) - 1);
})();
