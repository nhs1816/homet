/* 홈트 시간표 — 맞춤 루틴 만들기 (DOM 없음, EXERCISES 필요)
   Planner.make(opts, seed) → { days: { mon: [시간표 항목], ... } }
   opts = { goal: 'muscle'|'fitness'|'health', days: ['mon',...], minutes: 20|30|45,
            db: { has: bool, kg: number }, chair: bool, level: 1|2|3, avoid: ['knee','back','wrist','bp','reflux'] } */
(function () {
  'use strict';
  const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

  /* 역할별 운동 (앞쪽일수록 먼저 추천) */
  const ROLES = {
    squat: ['squat', 'goblet-squat', 'wide-squat', 'sumo-deadlift', 'jump-squat', 'wall-sit'],
    hinge: ['glute-bridge', 'romanian-deadlift', 'single-leg-bridge', 'single-leg-deadlift', 'db-swing'],
    single: ['reverse-lunge', 'step-up', 'db-lunge', 'side-lunge', 'forward-lunge', 'curtsy-lunge', 'db-step-up', 'bulgarian-split-squat', 'pistol-squat'],
    push: ['knee-push-up', 'incline-push-up', 'push-up', 'floor-press', 'shoulder-press', 'wide-push-up', 'chair-dip', 'diamond-push-up', 'pike-push-up', 'decline-push-up', 'arnold-press', 'archer-push-up'],
    pull: ['one-arm-row', 'superman', 'bent-over-row', 'reverse-snow-angel', 'prone-cobra', 'reverse-fly', 'ytw-raise'],
    arms: ['db-curl', 'lateral-raise', 'hammer-curl', 'triceps-kickback', 'front-raise', 'overhead-triceps', 'concentration-curl', 'shrug', 'floor-fly', 'pullover'],
    core: ['dead-bug', 'plank', 'bird-dog', 'side-plank', 'crunch', 'heel-touch', 'bicycle-crunch', 'reverse-crunch', 'plank-shoulder-tap', 'russian-twist', 'scissor-kick', 'leg-raise', 'mountain-climber', 'hollow-hold', 'v-up', 'plank-up-down', 'side-plank-hip-dip'],
    acc: ['calf-raise', 'clamshell', 'fire-hydrant', 'donkey-kick', 'db-calf-raise', 'single-leg-calf-raise'],
    cardio: ['jumping-jack', 'mountain-climber', 'bear-crawl', 'inchworm', 'burpee', 'squat-to-press', 'man-maker'],
  };

  /* 몸 상태별로 빼는 운동 */
  const AVOID = {
    knee: ['jump-squat', 'forward-lunge', 'curtsy-lunge', 'side-lunge', 'bulgarian-split-squat', 'db-lunge', 'wall-sit', 'burpee', 'man-maker', 'jumping-jack', 'pistol-squat'],
    back: ['romanian-deadlift', 'single-leg-deadlift', 'sumo-deadlift', 'bent-over-row', 'db-swing', 'man-maker', 'superman', 'v-up', 'leg-raise', 'russian-twist', 'scissor-kick', 'hollow-hold', 'burpee', 'inchworm'],
    wrist: ['push-up', 'knee-push-up', 'incline-push-up', 'decline-push-up', 'wide-push-up', 'diamond-push-up', 'pike-push-up', 'chair-dip', 'plank-shoulder-tap', 'mountain-climber', 'burpee', 'bear-crawl', 'inchworm', 'man-maker', 'bird-dog', 'donkey-kick', 'fire-hydrant', 'archer-push-up', 'plank-up-down'],
    bp: ['decline-push-up', 'pike-push-up', 'wall-sit', 'hollow-hold', 'man-maker', 'burpee', 'v-up'],
    reflux: ['decline-push-up', 'pike-push-up', 'inchworm', 'burpee', 'leg-raise', 'v-up', 'hollow-hold', 'reverse-crunch', 'crunch', 'bicycle-crunch', 'man-maker', 'jump-squat'],
  };
  const AVOID_LABEL = { knee: '무릎', back: '허리', wrist: '손목', bp: '혈압(숨 참기 주의)', reflux: '역류성 식도염' };

  const GOAL = {
    muscle: { label: '근육 늘리기', sets: 3, reps: 10, rest: 75, sec: 30 },
    fitness: { label: '체력·체중 관리', sets: 3, reps: 15, rest: 45, sec: 40 },
    health: { label: '건강 유지', sets: 2, reps: 12, rest: 60, sec: 30 },
  };

  function template(goal, kind, k) {
    if (kind === 'upper') return ['push', 'pull', 'push', 'pull', 'arms', 'core', 'arms', 'core'];
    if (kind === 'lower') return ['squat', 'hinge', 'single', 'acc', 'core', 'single', 'core'];
    const a = k % 2 ? 'hinge' : 'squat', b = k % 2 ? 'squat' : 'hinge';
    if (goal === 'fitness') return [a, 'push', 'pull', 'cardio', 'single', 'core', b, 'core', 'acc'];
    return [a, 'push', 'pull', 'single', 'core', b, 'arms', 'core', 'acc'];
  }
  function kinds(n) {
    if (n >= 5) return ['upper', 'lower', 'upper', 'lower', 'full'].concat(Array(n - 5).fill('full'));
    if (n === 4) return ['upper', 'lower', 'upper', 'lower'];
    return Array(n).fill('full');
  }

  function seconds(it) { return it.sets * ((it.type === 'time' || it.mode === 'amrap' ? it.sec : it.reps * 3) + it.rest); }
  function estimate(items) { let s = 0; for (const it of items) s += seconds(it); return Math.round(s / 60); }

  function make(opts, seed) {
    seed = seed || 0;
    const byId = {};
    for (const e of window.EXERCISES) byId[e.id] = e;
    const g = GOAL[opts.goal] || GOAL.muscle;
    const level = opts.level || 2;
    const hasDb = !!(opts.db && opts.db.has);
    const kg = hasDb && opts.db.kg ? opts.db.kg : null;
    const avoid = new Set();
    for (const a of opts.avoid || []) for (const id of AVOID[a] || []) avoid.add(id);
    const needsChair = e => (e.props || []).some(p => p && p.type === 'chair');
    const usable = e => e && !avoid.has(e.id) && (hasDb || e.equip !== '아령') && (opts.chair || !needsChair(e));

    // 역할별 후보: 난이도 맞는 것만, 없으면 한 단계 위까지
    const pool = {};
    for (const r in ROLES) {
      let list = ROLES[r].map(id => byId[id]).filter(usable);
      let ok = list.filter(e => e.level <= level);
      if (!ok.length) ok = list.filter(e => e.level <= level + 1);
      if (level === 3) ok = ok.filter(e => e.level >= 2).concat(ok.filter(e => e.level < 2));
      pool[r] = ok;
    }

    const toItem = e => {
      const it = { exId: e.id, name: e.name, type: e.type, sets: g.sets, rest: g.rest };
      if (e.type === 'time') it.sec = level === 1 ? Math.min(g.sec, 20) : g.sec;
      else {
        let reps = g.reps;
        if (ROLES.acc.includes(e.id) || ROLES.core.includes(e.id)) reps = Math.max(reps, e.defaults.reps || reps);
        if (kg && kg <= 6 && e.equip === '아령' && ['하체', '등', '전신'].includes(e.part)) reps = Math.max(reps, 15);
        it.reps = reps;
        if (opts.mode === 'amrap') { it.mode = 'amrap'; it.sec = level === 1 ? 30 : 45; }
      }
      if (e.equip === '아령' && kg) it.kg = kg;
      return it;
    };

    const cnt = {};
    const pick = (role, used) => {
      const list = pool[role];
      if (!list || !list.length) return null;
      const off = (seed * 7 + role.length * seed) % list.length;
      for (let t = 0; t < list.length; t++) {
        const e = list[(off + (cnt[role] || 0) + t) % list.length];
        if (!used.has(e.id)) { cnt[role] = (cnt[role] || 0) + t + 1; return e; }
      }
      return null;
    };

    const days = {};
    for (const d of DAYS) days[d] = [];
    const chosen = DAYS.filter(d => (opts.days || []).includes(d));
    const ks = kinds(chosen.length);
    const budget = (opts.minutes || 30) * 60;
    chosen.forEach((d, k) => {
      const items = [], used = new Set();
      let total = 0;
      for (const role of template(opts.goal, ks[k], k)) {
        if (items.length >= 8) break;
        const e = pick(role, used);
        if (!e) continue;
        const it = toItem(e);
        if (items.length >= 3 && total + seconds(it) > budget) break;
        items.push(it); used.add(e.id); total += seconds(it);
      }
      days[d] = items;
    });
    return { days };
  }

  /* 운동 중 바꾸기 후보: 같은 역할, 가진 도구·몸 상태로 거름 */
  function alternatives(exId, opts) {
    opts = opts || {};
    const byId = {};
    for (const e of window.EXERCISES) byId[e.id] = e;
    if (!byId[exId]) return [];
    const avoid = new Set();
    for (const a of opts.avoid || []) for (const id of AVOID[a] || []) avoid.add(id);
    const hasDb = !!(opts.db && opts.db.has);
    const needsChair = e => (e.props || []).some(p => p && p.type === 'chair');
    const out = [], seen = new Set([exId]);
    for (const r in ROLES) {
      if (!ROLES[r].includes(exId)) continue;
      for (const id of ROLES[r]) {
        const e = byId[id];
        if (!e || seen.has(id) || avoid.has(id) || (!hasDb && e.equip === '아령') || (!opts.chair && needsChair(e))) continue;
        seen.add(id); out.push(e);
      }
    }
    return out;
  }

  window.Planner = { ROLES, AVOID, AVOID_LABEL, GOAL, make, estimate, alternatives };
})();
