/* 홈트 시간표 — 졸라맨 그리기와 애니메이션
   각도: 화면 절대각(도). 0 = 아래, 90 = 오른쪽(앞), 180 = 위, -90 = 왼쪽(뒤)
   좌표: viewBox 0 -24 200 184, 바닥 y = 150 */
(function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const L = { torso: 48, neck: 6, headR: 9, upper: 24, fore: 22, thigh: 32, shin: 30, foot: 9 };
  const FLOOR = 150;

  const rad = a => a * Math.PI / 180;
  const dir = a => [Math.sin(rad(a)), Math.cos(rad(a))];
  const add = (p, a, len) => { const d = dir(a); return [p[0] + d[0] * len, p[1] + d[1] * len]; };
  const shortest = (a, b) => ((((b - a) % 360) + 540) % 360) - 180;
  const ease = u => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);

  /* 자세 → 관절 좌표 (바닥·가운데 맞춤 전) */
  function joints(p, view) {
    const front = view === 'front';
    const hip = p.hip.slice();
    const neck = add(hip, p.torso, L.torso * (p.tl == null ? 1 : p.tl));
    const head = add(neck, p.head == null ? p.torso : p.head, L.neck + L.headR);
    const up = add([0, 0], p.torso, 1), side = add([0, 0], p.torso - 90, 1); // side = 몸의 오른쪽(정면)
    const sh = (p.shrug || 0) - 3;
    let shF, shB, hiF, hiB;
    if (front) {
      shF = [neck[0] + side[0] * 11 + up[0] * sh, neck[1] + side[1] * 11 + up[1] * sh];
      shB = [neck[0] - side[0] * 11 + up[0] * sh, neck[1] - side[1] * 11 + up[1] * sh];
      hiF = [hip[0] + side[0] * 7, hip[1] + side[1] * 7];
      hiB = [hip[0] - side[0] * 7, hip[1] - side[1] * 7];
    } else {
      shF = [neck[0] + up[0] * (sh + 3), neck[1] + up[1] * (sh + 3)]; shB = shF.slice();
      hiF = hip.slice(); hiB = hip.slice();
    }
    const elF = add(shF, p.armF[0], L.upper), haF = add(elF, p.armF[1], L.fore);
    const elB = add(shB, p.armB[0], L.upper), haB = add(elB, p.armB[1], L.fore);
    const knF = add(hiF, p.legF[0], L.thigh), anF = add(knF, p.legF[1], L.shin);
    const knB = add(hiB, p.legB[0], L.thigh), anB = add(knB, p.legB[1], L.shin);
    let toF, toB;
    if (front) { toF = [anF[0] + side[0] * 5, anF[1] + side[1] * 5]; toB = [anB[0] - side[0] * 5, anB[1] - side[1] * 5]; }
    else {
      const fa = p.footF == null ? p.legF[1] + 90 : p.footF;
      const fb = p.footB == null ? p.legB[1] + 90 : p.footB;
      toF = add(anF, fa, L.foot); toB = add(anB, fb, L.foot);
    }
    return { hip, neck, head, shF, elF, haF, shB, elB, haB, hiF, knF, anF, toF, hiB, knB, anB, toB };
  }

  const LEGS = ['hiF', 'knF', 'anF', 'toF', 'hiB', 'knB', 'anB', 'toB'];
  const hidden = (ex, k) => ex && ex.hide && ex.hide.includes('legs') && LEGS.includes(k);

  function lowestY(j, ex) {
    let m = j.head[1] + L.headR;
    for (const k in j) if (k !== 'head' && !hidden(ex, k) && j[k][1] > m) m = j[k][1];
    return m;
  }
  function shiftJoints(j, dx, dy) {
    const o = {};
    for (const k in j) o[k] = [j[k][0] + dx, j[k][1] + dy];
    return o;
  }

  function lerpPose(a, b, u) {
    const e = ease(Math.max(0, Math.min(1, u)));
    const ang = (x, y) => x + shortest(x, y) * e;
    const num = (x, y) => x + (y - x) * e;
    const pair = (x, y) => [ang(x[0], y[0]), ang(x[1], y[1])];
    const o = {
      hip: [num(a.hip[0], b.hip[0]), num(a.hip[1], b.hip[1])],
      torso: ang(a.torso, b.torso),
      armF: pair(a.armF, b.armF), armB: pair(a.armB, b.armB),
      legF: pair(a.legF, b.legF), legB: pair(a.legB, b.legB),
      lift: num(a.lift || 0, b.lift || 0),
      tl: num(a.tl == null ? 1 : a.tl, b.tl == null ? 1 : b.tl),
      shrug: num(a.shrug || 0, b.shrug || 0),
      t: b.t, breath: b.breath,
    };
    const ha = a.head == null ? a.torso : a.head, hb = b.head == null ? b.torso : b.head;
    o.head = ang(ha, hb);
    for (const k of ['footF', 'footB']) {
      if (a[k] != null || b[k] != null) {
        const fa = a[k] != null ? a[k] : (k === 'footF' ? a.legF[1] : a.legB[1]) + 90;
        const fb = b[k] != null ? b[k] : (k === 'footF' ? b.legF[1] : b.legB[1]) + 90;
        o[k] = ang(fa, fb);
      }
    }
    return o;
  }

  function poseAt(ex, time) {
    const ps = ex.poses, n = ps.length;
    let total = 0;
    for (const p of ps) total += p.t;
    let tau = ((time % total) + total) % total;
    for (let k = 1; k <= n; k++) {
      const to = ps[k % n], dur = to.t;
      if (tau < dur || k === n) return { pose: lerpPose(ps[k - 1], to, dur ? tau / dur : 1), breath: to.breath };
      tau -= dur;
    }
    return { pose: ps[0], breath: ps[0].breath };
  }

  /* 자세 하나를 화면 좌표로: 바닥에 붙이고 운동 전체 기준으로 가운데 맞춤 */
  function placed(ex, pose) {
    const j = joints(pose, ex.view);
    const dy = FLOOR - (pose.lift || 0) - lowestY(j, ex);
    return shiftJoints(j, centerDx(ex), dy);
  }
  function centerDx(ex) {
    if (ex._dx != null) return ex._dx;
    let lo = Infinity, hi = -Infinity;
    for (const p of ex.poses) {
      const j = joints(p, ex.view);
      for (const k in j) { if (hidden(ex, k)) continue; const r = k === 'head' ? L.headR : 3; lo = Math.min(lo, j[k][0] - r); hi = Math.max(hi, j[k][0] + r); }
    }
    for (const pr of ex.props || []) {
      if (pr && pr.type === 'chair' && pr.joint) {
        const j = joints(ex.poses[pr.pose || 0], ex.view)[pr.joint];
        lo = Math.min(lo, j[0] - 18); hi = Math.max(hi, j[0] + 18);
      }
    }
    ex._dx = isFinite(lo) ? 100 - (lo + hi) / 2 : 0;
    return ex._dx;
  }

  /* ---------- SVG ---------- */
  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  const line = (e, a, b) => { e.setAttribute('x1', a[0].toFixed(1)); e.setAttribute('y1', a[1].toFixed(1)); e.setAttribute('x2', b[0].toFixed(1)); e.setAttribute('y2', b[1].toFixed(1)); };
  const poly = (e, pts) => e.setAttribute('points', pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' '));

  function build(svg, ex) {
    svg.innerHTML = '';
    const P = {};
    if (!ex.noFloor) P.floor = el('line', { x1: 8, y1: FLOOR + 3, x2: 192, y2: FLOOR + 3, class: 'fig-floor' }, svg);
    const props = (ex.props || []).map(p => (typeof p === 'string' ? { type: p } : p));
    P.static = el('g', { class: 'fig-prop' }, svg);
    for (const pr of props) {
      if (pr.type === 'mat') el('rect', { x: 22, y: FLOOR, width: 156, height: 3, rx: 1.5, class: 'fig-mat' }, P.static);
      if (pr.type === 'wall') {
        const j = placed(ex, ex.poses[pr.pose || 0])[pr.joint || 'hip'];
        const x = j[0] - (pr.gap == null ? 5 : pr.gap);
        el('line', { x1: x, y1: 18, x2: x, y2: FLOOR + 3, class: 'fig-wall' }, P.static);
      }
      if (pr.type === 'chair') {
        const j = placed(ex, ex.poses[pr.pose || 0])[pr.joint || 'hip'];
        const y = j[1] + (pr.dy || 0) + 2, x = j[0] + (pr.dx || 0);
        const g = el('g', { class: 'fig-chair' }, P.static);
        el('line', { x1: x - 16, y1: y, x2: x + 16, y2: y }, g);
        el('line', { x1: x - 13, y1: y, x2: x - 13, y2: FLOOR + 3 }, g);
        el('line', { x1: x + 13, y1: y, x2: x + 13, y2: FLOOR + 3 }, g);
        const bx = pr.back === 'right' ? x + 16 : x - 16;
        if (pr.back !== 'none') el('line', { x1: bx, y1: y, x2: bx, y2: y - 26 }, g);
      }
    }
    const gb = el('g', { class: 'fig-back' }, svg);
    P.armB = el('polyline', {}, gb); P.legB = el('polyline', {}, gb);
    const gf = el('g', { class: 'fig-body' }, svg);
    P.torso = el('polyline', {}, gf);
    P.legF = el('polyline', {}, gf);
    P.head = el('circle', { r: L.headR }, gf);
    P.armF = el('polyline', {}, gf);
    const dbs = props.some(p => p.type === 'db') ? ['B', 'F'] : props.some(p => p.type === 'db1') ? ['F'] : [];
    P.db = dbs.map(s => ({ s, g: el('g', { class: 'fig-db' }, svg) }));
    for (const d of P.db) { d.bar = el('line', {}, d.g); d.p1 = el('line', { class: 'plate' }, d.g); d.p2 = el('line', { class: 'plate' }, d.g); }
    if (ex.view === 'front') gb.setAttribute('class', 'fig-body');
    svg._parts = P; svg._ex = ex;
    return P;
  }

  function draw(svg, ex, pose) {
    const P = svg._ex === ex && svg._parts ? svg._parts : build(svg, ex);
    const j = placed(ex, pose);
    poly(P.armB, [j.shB, j.elB, j.haB]);
    const legs = !(ex.hide && ex.hide.includes('legs'));
    poly(P.legB, legs ? [j.hiB, j.knB, j.anB, j.toB] : []);
    poly(P.torso, ex.view === 'front' ? (legs ? [j.hiB, j.hip, j.hiF, j.hip, j.neck, j.shB, j.neck, j.shF] : [j.hip, j.neck, j.shB, j.neck, j.shF]) : [j.hip, j.neck, j.shF]);
    poly(P.legF, legs ? [j.hiF, j.knF, j.anF, j.toF] : []);
    poly(P.armF, [j.shF, j.elF, j.haF]);
    P.head.setAttribute('cx', j.head[0].toFixed(1)); P.head.setAttribute('cy', j.head[1].toFixed(1));
    for (const d of P.db) {
      const hand = j['ha' + d.s], elb = j['el' + d.s];
      let dx = hand[0] - elb[0], dy = hand[1] - elb[1];
      const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
      const px = -dy, py = dx; // 아래팔에 수직
      const a = [hand[0] - px * 8, hand[1] - py * 8], b = [hand[0] + px * 8, hand[1] + py * 8];
      line(d.bar, a, b);
      line(d.p1, [a[0] - dx * 4, a[1] - dy * 4], [a[0] + dx * 4, a[1] + dy * 4]);
      line(d.p2, [b[0] - dx * 4, b[1] - dy * 4], [b[0] + dx * 4, b[1] + dy * 4]);
    }
  }

  function render(svg, ex, time) {
    const { pose, breath } = poseAt(ex, time);
    draw(svg, ex, pose);
    return breath;
  }

  const BREATH = { in: '들이쉬기', out: '내쉬기', hold: '호흡 유지' };
  const reduce = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function nameCard(el0, name) {
    el0.innerHTML = '';
    const d = document.createElement('div');
    d.className = 'fig-card';
    d.textContent = (name || '?').trim().charAt(0);
    el0.appendChild(d);
  }

  function mount(host, ex, opts) {
    opts = opts || {};
    if (!ex || !ex.poses || ex.poses.length < 2) { nameCard(host, ex && ex.name); return { stop() {} }; }
    host.innerHTML = '';
    const svg = el('svg', { viewBox: '0 -24 200 184', class: 'fig', role: 'img', 'aria-label': ex.name + ' 동작' });
    host.appendChild(svg);
    let lab = null, last = '';
    if (opts.showBreath) { lab = document.createElement('div'); lab.className = 'fig-breath'; host.appendChild(lab); }
    const t0 = performance.now() - (opts.offset || 0) * 1000;
    let raf = 0, alive = true;
    const frame = now => {
      if (!alive) return;
      const b = render(svg, ex, (now - t0) / 1000);
      if (lab && b !== last) { last = b; lab.textContent = BREATH[b] || ''; lab.dataset.breath = b; }
      raf = requestAnimationFrame(frame);
    };
    if (reduce()) { const b = render(svg, ex, ex.poses[0].t); if (lab) lab.textContent = BREATH[b]; }
    else raf = requestAnimationFrame(frame);
    return { stop() { alive = false; cancelAnimationFrame(raf); } };
  }

  /* 썸네일: 화면에 보일 때만 움직임 */
  function observe(container, lookup) {
    const live = new Map();
    const io = new IntersectionObserver(entries => {
      for (const en of entries) {
        const host = en.target;
        if (en.isIntersecting) {
          if (!live.has(host)) live.set(host, mount(host, lookup(host.dataset.ex), {}));
        } else if (live.has(host)) {
          live.get(host).stop(); live.delete(host);
        }
      }
    }, { rootMargin: '80px' });
    container.querySelectorAll('[data-ex]').forEach(h => {
      const ex = lookup(h.dataset.ex);
      if (ex && ex.poses) { const svg = el('svg', { viewBox: '0 -24 200 184', class: 'fig' }); h.innerHTML = ''; h.appendChild(svg); render(svg, ex, 0); }
      else nameCard(h, ex && ex.name);
      io.observe(h);
    });
    return { disconnect() { io.disconnect(); live.forEach(x => x.stop()); live.clear(); } };
  }

  window.Figure = { L, FLOOR, joints, lerpPose, poseAt, placed, render, mount, observe, BREATH };
})();
