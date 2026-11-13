/* 홈트 시간표 — 저장·날짜·통계·운동 진행 (DOM 없음) */
(function () {
  'use strict';
  const KEY = 'homet.v1';
  const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

  function defaultState() {
    const schedule = {};
    for (const d of DAYS) schedule[d] = { note: '', items: [] };
    return {
      version: 1,
      settings: { weeklyGoal: 3, restSec: 60, sound: true, mode: 'reps', voice: true, tempo: 'normal', warmup: false },
      schedule,
      favorites: [],
      custom: [],
      sessions: [],
      body: [],
      activeRun: null,
      restWeeks: [],
      routines: [],
      activeRoutine: '',
    };
  }

  function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
  const isNum = x => typeof x === 'number' && isFinite(x);
  const DATE = /^\d{4}-\d{2}-\d{2}$/;
  function okItem(x) { return isObj(x) && typeof x.exId === 'string' && typeof x.name === 'string' && isNum(x.sets) && x.sets > 0 && isNum(x.rest) && x.rest >= 0; }
  function okSession(x) { return isObj(x) && typeof x.date === 'string' && DATE.test(x.date) && isNum(x.start) && isNum(x.end) && Array.isArray(x.items) && x.items.every(i => isObj(i) && typeof i.exId === 'string' && Array.isArray(i.sets)); }
  const BODY_KEYS = ['weight', 'muscle', 'fat'];
  function cleanBody(x) {
    if (!isObj(x) || typeof x.date !== 'string' || !DATE.test(x.date)) return null;
    const o = { date: x.date };
    for (const k of BODY_KEYS) if (isNum(x[k]) && x[k] > 0) o[k] = x[k];
    return Object.keys(o).length > 1 ? o : null;
  }
  function okSettings(x) { return isObj(x) && (x.weeklyGoal == null || (Number.isInteger(x.weeklyGoal) && x.weeklyGoal >= 1 && x.weeklyGoal <= 7)) && (x.restSec == null || (isNum(x.restSec) && x.restSec >= 0)); }

  function loadState(raw) {
    const s = defaultState();
    if (!raw) return s;
    let o;
    try { o = JSON.parse(raw); } catch (e) { return s; }
    if (!isObj(o)) return s;
    if (isObj(o.settings)) {
      const st = o.settings;
      if (Number.isInteger(st.weeklyGoal) && st.weeklyGoal >= 1 && st.weeklyGoal <= 7) s.settings.weeklyGoal = st.weeklyGoal;
      if (isNum(st.restSec) && st.restSec >= 0) s.settings.restSec = st.restSec;
      if (typeof st.sound === 'boolean') s.settings.sound = st.sound;
      if (st.mode === 'reps' || st.mode === 'amrap') s.settings.mode = st.mode;
      if (typeof st.voice === 'boolean') s.settings.voice = st.voice;
      if (st.tempo === 'slow' || st.tempo === 'normal' || st.tempo === 'fast') s.settings.tempo = st.tempo;
      if (typeof st.warmup === 'boolean') s.settings.warmup = st.warmup;
    }
    if (isObj(o.schedule)) {
      for (const d of DAYS) {
        const v = o.schedule[d];
        if (isObj(v)) s.schedule[d] = { note: typeof v.note === 'string' ? v.note : '', items: Array.isArray(v.items) ? v.items.filter(okItem) : [] };
      }
    }
    if (Array.isArray(o.favorites)) s.favorites = o.favorites.filter(x => typeof x === 'string');
    if (Array.isArray(o.custom)) s.custom = o.custom.filter(x => isObj(x) && typeof x.id === 'string' && typeof x.name === 'string');
    if (Array.isArray(o.sessions)) s.sessions = o.sessions.filter(okSession);
    if (Array.isArray(o.body)) s.body = o.body.map(cleanBody).filter(Boolean);
    if (isObj(o.activeRun)) s.activeRun = o.activeRun;
    if (Array.isArray(o.restWeeks)) s.restWeeks = o.restWeeks.filter(x => typeof x === 'string' && DATE.test(x));
    if (Array.isArray(o.routines)) s.routines = o.routines.filter(r => isObj(r) && typeof r.id === 'string' && typeof r.name === 'string' && isObj(r.schedule) && DAYS.every(d => isObj(r.schedule[d]) && Array.isArray(r.schedule[d].items)))
      .map(r => ({ id: r.id, name: r.name, schedule: Object.fromEntries(DAYS.map(d => [d, { note: typeof r.schedule[d].note === 'string' ? r.schedule[d].note : '', items: r.schedule[d].items.filter(okItem) }])) }));
    if (typeof o.activeRoutine === 'string') s.activeRoutine = o.activeRoutine;
    return s;
  }

  function readStorage() {
    try { return window.localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function saveState(state) {
    try { window.localStorage.setItem(KEY, JSON.stringify(state)); return true; } catch (e) { return false; }
  }

  /* ---------- 날짜 ---------- */
  const pad = n => String(n).padStart(2, '0');
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parse(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); }
  function addDays(s, n) { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); }
  function dayIndex(s) { return (parse(s).getDay() + 6) % 7; } // 월=0 … 일=6
  function dayKey(s) { return DAYS[dayIndex(s)]; }
  function weekStart(s) { return addDays(s, -dayIndex(s)); }

  /* ---------- 통계 ---------- */
  function weekCount(sessions, s) {
    const a = weekStart(s), b = addDays(a, 6);
    const set = new Set();
    for (const x of sessions) if (x.date >= a && x.date <= b) set.add(x.date);
    return set.size;
  }
  function streakWeeks(sessions, goal, today, restWeeks) {
    const rest = new Set(restWeeks || []);
    let n = 0, w = addDays(weekStart(today), -7);
    for (let guard = 0; guard < 600; guard++) {
      if (rest.has(w)) { w = addDays(w, -7); continue; } // 쉬어가는 주: 세지도 끊지도 않음
      if (weekCount(sessions, w) < goal) break;
      n++; w = addDays(w, -7);
    }
    if (!rest.has(weekStart(today)) && weekCount(sessions, today) >= goal) n++;
    return n;
  }
  function lastRecord(sessions, exId) {
    let best = null;
    for (const s of sessions) {
      const it = (s.items || []).find(x => x.exId === exId);
      if (it && (!best || s.date > best.date)) best = { date: s.date, sets: it.sets };
    }
    return best;
  }

  /* ---------- 운동 진행 ---------- */
  const clone = o => JSON.parse(JSON.stringify(o));

  function targetOf(it) {
    if (it.mode === 'amrap') return { amrapSec: it.sec };
    if (it.type === 'time') return { sec: it.sec, base: it.base == null ? it.sec : it.base };
    return { reps: it.reps, base: it.base == null ? it.reps : it.base };
  }
  function createRun(items, exLookup, now) {
    const list = (items || []).map(it => {
      const ex = exLookup(it.exId);
      return Object.assign({}, it, { name: (ex && ex.name) || it.name || it.exId, missing: !ex });
    });
    return {
      items: list,
      i: 0,
      set: 1,
      phase: list.length ? 'work' : 'done',
      restEndAt: 0,
      log: list.map(it => Object.assign({ exId: it.exId, name: it.name, sets: [], mode: it.mode === 'amrap' ? 'amrap' : 'reps', target: targetOf(it) }, it.block ? { block: it.block } : {})),
      startedAt: now,
    };
  }

  function completeSet(run, result, now) {
    const r = clone(run);
    if (r.phase !== 'work') return r;
    const it = r.items[r.i];
    const logged = r.log[r.i].sets;
    const slot = Math.min(r.set, it.sets || 1) - 1;
    if (slot < logged.length) logged[slot] = Object.assign({}, result); // 돌아와서 다시 한 세트
    else logged.push(Object.assign({}, result));
    if (r.set < (it.sets || 1)) {
      r.set++;
    } else if (r.i < r.items.length - 1) {
      r.i++; r.set = 1;
    } else {
      r.phase = 'done'; return r;
    }
    r.phase = 'rest';
    r.restEndAt = now + (it.rest || 0) * 1000;
    return r;
  }
  function addRest(run, sec) { const r = clone(run); r.restEndAt += sec * 1000; return r; }
  function restRemaining(run, now) { return Math.max(0, Math.ceil((run.restEndAt - now) / 1000)); }
  function finishRest(run) { const r = clone(run); if (r.phase === 'rest') r.phase = 'work'; return r; }

  function skipExercise(run) {
    const r = clone(run);
    if (r.i < r.items.length - 1) { r.i++; r.set = 1; r.phase = 'work'; }
    else r.phase = 'done';
    return r;
  }
  function prevExercise(run) {
    const r = clone(run);
    r.i = Math.max(0, r.i - 1);
    const it = r.items[r.i];
    r.set = it ? Math.min(r.log[r.i].sets.length + 1, it.sets || 1) : 1;
    r.phase = r.items.length ? 'work' : 'done';
    return r;
  }

  function endRun(run, now) {
    return {
      id: 's' + run.startedAt,
      date: ymd(new Date(run.startedAt)),
      start: run.startedAt,
      end: now,
      items: run.log.filter(x => x.sets.length && !x.block).map(x => {
        const o = { exId: x.exId, name: x.name, sets: x.sets };
        if (x.target) o.target = x.target;
        if (x.mode === 'amrap') o.mode = 'amrap';
        if (x.feel) o.feel = x.feel;
        return o;
      }),
    };
  }

  function setFeel(run, i, feel) { const r = clone(run); if (r.log[i]) r.log[i].feel = feel; return r; }

  /* ---------- 증량 제안 (이중 증량: 두 번 연속 해내고 힘들지 않으면 +1) ---------- */
  const NEXT = {
    'incline-push-up': '무릎 푸시업', 'knee-push-up': '푸시업', 'push-up': '다이아몬드 푸시업',
    'squat': '고블릿 스쿼트', 'wide-squat': '고블릿 스쿼트', 'glute-bridge': '싱글레그 힙브릿지',
    'reverse-lunge': '불가리안 스플릿 스쿼트', 'step-up': '덤벨 스텝업', 'superman': 'Y-T-W 레이즈',
    'dead-bug': '할로우 홀드', 'crunch': 'V업', 'calf-raise': '한 발 카프 레이즈',
    'diamond-push-up': '아처 푸시업', 'bulgarian-split-squat': '피스톨 스쿼트(의자 보조)',
    'plank': '플랭크 업다운', 'side-plank': '사이드 플랭크 힙딥',
  };
  function suggest(item, sessions) {
    const id = item.exId;
    const amrap = item.mode === 'amrap';
    const hist = [];
    for (const s of sessions || []) for (const x of s.items || []) {
      if (x.exId === id && (x.mode === 'amrap') === amrap) hist.push({ date: s.date, start: s.start || 0, x });
    }
    hist.sort((a, b) => (b.date + String(b.start).padStart(15, '0')).localeCompare(a.date + String(a.start).padStart(15, '0')));
    if (amrap) {
      let best = 0;
      for (const h of hist) for (const st of h.x.sets) best = Math.max(best, st.reps || 0);
      return { mode: 'amrap', value: item.sec, dir: 'same', best: best || null, last: hist[0] ? hist[0].x.sets[0].reps : null };
    }
    const time = item.type === 'time';
    const key = time ? 'sec' : 'reps';
    const base = item[key];
    const step = time ? 5 : 1;
    const cap = time ? 60 : (item.kg ? 15 : 20);
    const recs = hist.map(h => h.x).filter(x => !x.target || x.target.base === base);
    const tgt = x => (x.target ? x.target[key] : base);
    const done = x => x.sets.length >= item.sets && x.sets.every(st => (st[key] || 0) >= tgt(x));
    // 일찍 끝낸 날(세트 수 부족)은 실패로 치지 않고, 한 세트에서 목표를 못 채웠거나 힘들었던 날만 실패
    const bad = x => x.feel === 'hard' || x.sets.some(st => (st[key] || 0) < tgt(x));
    const cur = recs.length ? tgt(recs[0]) : base;
    const res = { mode: 'reps', value: cur, dir: 'same', note: '' };
    if (recs.length >= 2) {
      const [a, b] = recs;
      if (tgt(a) === cur && tgt(b) === cur && done(a) && done(b) && a.feel !== 'hard' && b.feel !== 'hard') {
        if (cur + step > cap) {
          res.dir = 'cap';
          res.note = NEXT[id] ? '이제 "' + NEXT[id] + '"(으)로 바꿔 볼 때예요.' : '횟수 대신 내려갈 때 3초로 천천히 해 보세요.';
        } else { res.value = cur + step; res.dir = 'up'; res.note = '두 번 연속 해냈어요'; }
      } else if (bad(a) && bad(b)) {
        res.value = Math.max(time ? 10 : 1, cur - step); res.dir = res.value < cur ? 'down' : 'same'; res.note = '조금 낮췄어요';
      }
    }
    return res;
  }

  /* ---------- 템포 카운트 ---------- */
  const TEMPO_SEC = { slow: 4, normal: 3, fast: 2 };
  const KO_ONE = ['', '하나', '둘', '셋', '넷', '다섯', '여섯', '일곱', '여덟', '아홉'];
  const KO_TEN = ['', '열', '스물', '서른', '마흔', '쉰'];
  function koCount(n) {
    if (!Number.isInteger(n) || n < 1 || n > 50) return String(n);
    return KO_TEN[Math.floor(n / 10)] + KO_ONE[n % 10];
  }

  /* ---------- 운동 중 바꾸기 ---------- */
  function swapExercise(run, i, item, exLookup) {
    const r = clone(run);
    const ex = exLookup(item.exId);
    const it = Object.assign({}, item, { name: (ex && ex.name) || item.name || item.exId, missing: !ex });
    r.items[i] = it;
    r.log[i] = { exId: it.exId, name: it.name, sets: [], mode: it.mode === 'amrap' ? 'amrap' : 'reps', target: targetOf(it) };
    if (i === r.i) r.set = 1;
    return r;
  }

  /* ---------- 워밍업·마무리, 10분 루틴 ---------- */
  const WARM = [['jumping-jack', { sec: 40 }], ['inchworm', { reps: 5 }], ['bird-dog', { reps: 8 }], ['glute-bridge', { reps: 10 }]];
  const WARM_ALT = [['calf-raise', { reps: 15 }], ['dead-bug', { reps: 8 }], ['squat', { reps: 10 }]];
  const COOL = ['hamstring-stretch', 'chest-stretch', 'hip-flexor-stretch', 'childs-pose'];
  function withWarmup(items, exLookup, avoidIds) {
    const avoid = new Set(avoidIds || []);
    const mk = (id, amt, block, rest) => {
      const ex = exLookup(id);
      if (!ex || avoid.has(id)) return null;
      const it = { exId: id, name: ex.name, type: ex.type || 'reps', sets: 1, rest, block };
      if (it.type === 'time') it.sec = amt.sec || 30; else it.reps = amt.reps || 10;
      return it;
    };
    const warm = [];
    for (const [id, amt] of WARM.concat(WARM_ALT)) { if (warm.length >= 4) break; const it = mk(id, amt, 'warm', 10); if (it) warm.push(it); }
    const cool = COOL.map(id => mk(id, { sec: 30 }, 'cool', 5)).filter(Boolean);
    return warm.concat(items, cool);
  }
  function skipBlock(run) {
    const r = clone(run);
    const b = r.items[r.i] && r.items[r.i].block;
    if (!b) return r;
    let j = r.i;
    while (j < r.items.length && r.items[j].block === b) j++;
    if (j >= r.items.length) r.phase = 'done';
    else { r.i = j; r.set = 1; r.phase = 'work'; }
    return r;
  }
  function quickRoutine(items) {
    return (items || []).filter(x => !x.block).slice(0, 3).map(x => {
      const o = Object.assign({}, x, { sets: Math.min(2, x.sets || 2), rest: 30 });
      if (o.type === 'time' || o.mode === 'amrap') o.sec = Math.min(o.sec || 30, 30);
      return o;
    });
  }

  /* ---------- 지난 기록 고치기 ---------- */
  function cleanSet(st) {
    if (!isObj(st)) return null;
    const o = {};
    if (isNum(st.sec)) { if (st.sec <= 0) return null; o.sec = st.sec; }
    else if (isNum(st.reps)) { if (st.reps <= 0) return null; o.reps = st.reps; }
    else return null;
    if (isNum(st.kg) && st.kg > 0) o.kg = st.kg;
    if (isNum(st.amrap) && st.amrap > 0) o.amrap = st.amrap;
    return o;
  }
  function editSession(sessions, id, exId, sets) {
    const out = [];
    for (const s of sessions) {
      if (s.id !== id) { out.push(s); continue; }
      const c = clone(s);
      c.items = c.items.map(x => (x.exId === exId ? Object.assign(x, { sets: (sets || []).map(cleanSet).filter(Boolean) }) : x)).filter(x => x.sets.length);
      if (c.items.length) out.push(c);
    }
    return out;
  }

  /* ---------- 쉬어가기 ---------- */
  function canRest(restWeeks, ws) {
    const list = restWeeks || [];
    if (list.includes(ws)) return false;
    return !list.some(w => w.slice(0, 7) === ws.slice(0, 7));
  }

  /* ---------- 배지 ---------- */
  const BADGES = [
    ['first', '첫걸음', '첫 운동을 기록했어요'],
    ['count10', '열 번째', '운동 10회'], ['count30', '서른 번째', '운동 30회'], ['count50', '쉰 번째', '운동 50회'], ['count100', '백 번째', '운동 100회'],
    ['streak4', '한 달 꾸준', '주간 목표 4주 연속'], ['streak8', '두 달 꾸준', '주간 목표 8주 연속'], ['streak12', '석 달 꾸준', '주간 목표 12주 연속'],
    ['reps20', '20회 돌파', '한 세트 20회 이상'], ['plank60', '1분 버티기', '시간 운동 한 세트 60초 이상'],
  ];
  function badges(sessions, goal, today, restWeeks) {
    const got = {};
    const list = sessions.slice().sort((a, b) => (a.date + String(a.start || 0).padStart(15, '0')).localeCompare(b.date + String(b.start || 0).padStart(15, '0')));
    list.forEach((s, i) => {
      const n = i + 1;
      if (n === 1) got.first = s.date;
      for (const c of [10, 30, 50, 100]) if (n === c) got['count' + c] = s.date;
      for (const x of s.items || []) for (const st of x.sets || []) {
        if (!got.reps20 && x.mode !== 'amrap' && (st.reps || 0) >= 20) got.reps20 = s.date;
        if (!got.plank60 && (st.sec || 0) >= 60) got.plank60 = s.date;
      }
    });
    if (list.length) {
      const rest = new Set(restWeeks || []);
      let run = 0, w = weekStart(list[0].date);
      const end = weekStart(today);
      for (let guard = 0; guard < 1000 && w <= end; guard++) {
        if (!rest.has(w)) {
          if (weekCount(sessions, w) >= goal) {
            run++;
            const lastDay = list.filter(s => s.date >= w && s.date <= addDays(w, 6)).map(s => s.date).sort().pop();
            for (const c of [4, 8, 12]) if (run === c && !got['streak' + c]) got['streak' + c] = lastDay;
          } else if (w !== end) run = 0;
        }
        w = addDays(w, 7);
      }
    }
    return BADGES.map(([id, name, desc]) => ({ id, name, desc, date: got[id] || null }));
  }

  /* ---------- 월간 리포트 ---------- */
  function monthReport(sessions, body, ym) {
    const [y, m] = ym.split('-').map(Number);
    const prev = (m === 1 ? (y - 1) + '-12' : y + '-' + String(m - 1).padStart(2, '0'));
    const stat = key => {
      const ss = sessions.filter(s => s.date.startsWith(key));
      return { days: new Set(ss.map(s => s.date)).size, sets: ss.reduce((a, s) => a + (s.items || []).reduce((b, x) => b + (x.sets || []).length, 0), 0), ss };
    };
    const cur = stat(ym), pv = stat(prev);
    let top = null;
    const ids = new Set();
    for (const s of cur.ss) for (const x of s.items || []) if (x.mode !== 'amrap') ids.add(x.exId);
    for (const id of ids) {
      const ser = exerciseSeries(cur.ss, id, 'reps');
      if (ser.length < 2) continue;
      const gain = ser[ser.length - 1].value - ser[0].value;
      if (gain > 0 && (!top || gain > top.to - top.from)) {
        const any = cur.ss.flatMap(s => s.items).find(x => x.exId === id);
        const isSec = any.sets.some(st => st.sec != null);
        top = { exId: id, name: any.name || id, from: ser[0].value, to: ser[ser.length - 1].value, unit: isSec ? '초' : '회' };
      }
    }
    const bw = bodySeries(body, 'weight').filter(x => x.date.startsWith(ym));
    return { days: cur.days, sets: cur.sets, prevDays: pv.days, prevSets: pv.sets, topGain: top, weight: bw.length >= 2 ? { from: bw[0].value, to: bw[bw.length - 1].value } : null };
  }

  /* ---------- 루틴 여러 개 ---------- */
  function ensureRoutines(st) {
    const s = clone(st);
    if (!s.routines || !s.routines.length) { s.routines = [{ id: 'r1', name: '기본 주간', schedule: clone(s.schedule) }]; s.activeRoutine = 'r1'; }
    if (!s.routines.some(r => r.id === s.activeRoutine)) { s.activeRoutine = s.routines[0].id; s.schedule = clone(s.routines[0].schedule); }
    return s;
  }
  function syncRoutine(s) {
    const r = (s.routines || []).find(x => x.id === s.activeRoutine);
    if (r) r.schedule = clone(s.schedule);
    return s;
  }
  function switchRoutine(st, id) {
    const s = syncRoutine(clone(st));
    const r = s.routines.find(x => x.id === id);
    if (!r) return s;
    s.activeRoutine = id; s.schedule = clone(r.schedule);
    return s;
  }
  function addRoutine(st, name) {
    const s = syncRoutine(clone(st));
    const id = 'r' + Date.now().toString(36) + s.routines.length;
    s.routines.push({ id, name: name || '새 루틴', schedule: clone(s.schedule) });
    s.activeRoutine = id;
    return s;
  }
  function renameRoutine(st, id, name) {
    const s = clone(st);
    const r = s.routines.find(x => x.id === id);
    if (r && name) r.name = name;
    return s;
  }
  function removeRoutine(st, id) {
    if (st.routines.length <= 1) return clone(st);
    let s = syncRoutine(clone(st));
    s.routines = s.routines.filter(x => x.id !== id);
    if (s.activeRoutine === id) { s.activeRoutine = s.routines[0].id; s.schedule = clone(s.routines[0].schedule); }
    return s;
  }

  /* ---------- 진행 그래프 계산 ---------- */
  function weeklySeries(sessions, today, n) {
    const ws = weekStart(today), out = [];
    for (let k = n - 1; k >= 0; k--) {
      const start = addDays(ws, -7 * k), end = addDays(start, 6);
      let sets = 0;
      for (const s of sessions) if (s.date >= start && s.date <= end) for (const x of s.items || []) sets += (x.sets || []).length;
      out.push({ start, days: weekCount(sessions, start), sets });
    }
    return out;
  }
  const isAmrap = x => x.mode === 'amrap';
  function exerciseSeries(sessions, exId, mode) {
    const byDate = {};
    for (const s of sessions) for (const x of s.items || []) {
      if (x.exId !== exId || isAmrap(x) !== (mode === 'amrap')) continue;
      for (const st of x.sets || []) {
        const v = st.sec != null ? st.sec : st.reps;
        if (!isNum(v)) continue;
        const d = byDate[s.date] || (byDate[s.date] = { date: s.date, value: 0, kg: null });
        d.value = Math.max(d.value, v);
        if (isNum(st.kg)) d.kg = Math.max(d.kg || 0, st.kg);
      }
    }
    return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
  }
  function exerciseList(sessions) {
    const m = {};
    for (const s of sessions) for (const x of s.items || []) {
      const mode = isAmrap(x) ? 'amrap' : 'reps', k = x.exId + '|' + mode;
      const e = m[k] || (m[k] = { exId: x.exId, name: x.name || x.exId, mode, count: 0, last: '' });
      e.count++; if (s.date > e.last) e.last = s.date;
    }
    return Object.values(m).sort((a, b) => b.count - a.count || b.last.localeCompare(a.last));
  }
  function upsertBody(body, entry) {
    const e = cleanBody(entry);
    if (!e) return body.slice();
    const out = body.filter(x => x.date !== e.date);
    const old = body.find(x => x.date === e.date);
    out.push(old ? Object.assign({}, old, e) : e);
    return out.sort((a, b) => a.date.localeCompare(b.date));
  }
  function bodySeries(body, key) {
    return (body || []).filter(x => isNum(x[key])).map(x => ({ date: x.date, value: x[key] })).sort((a, b) => a.date.localeCompare(b.date));
  }

  /* ---------- 음성 안내 타이밍: 남은 초(left)에 할 말, 이미 한 말(said)은 건너뜀 ---------- */
  function cue(kind, total, left, said) {
    let c = null;
    if (kind === 'rest') {
      if (left === 10 && total > 15) c = { key: 'r10', text: '10초 남았어요' };
      else if (left >= 1 && left <= 3) c = { key: 'r' + left, text: String(left) };
      else if (left === 0) c = { key: 'r0', text: '시작하세요' };
    } else if (kind === 'work') {
      if (total >= 30 && left === Math.floor(total / 2)) c = { key: 'half', text: '절반 지났어요' };
      else if (left >= 1 && left <= 5) c = { key: 'w' + left, text: String(left) };
    } else if (kind === 'countin') {
      if (left >= 1 && left <= 3) c = { key: 'c' + left, text: String(left) };
      else if (left === 0) c = { key: 'c0', text: '시작' };
    }
    if (!c || (said && said.has(c.key))) return null;
    return c;
  }

  function validateBackup(o) {
    if (!isObj(o)) return { ok: false, error: '백업 파일 형식이 아니에요.' };
    if (o.version !== 1) return { ok: false, error: '지원하지 않는 백업 버전이에요.' };
    if (!isObj(o.schedule) || !DAYS.every(d => isObj(o.schedule[d]) && Array.isArray(o.schedule[d].items)))
      return { ok: false, error: '시간표 정보가 빠져 있어요.' };
    if (!DAYS.every(d => o.schedule[d].items.every(okItem))) return { ok: false, error: '시간표에 읽을 수 없는 운동이 있어요.' };
    if (!Array.isArray(o.sessions)) return { ok: false, error: '운동 기록이 빠져 있어요.' };
    if (!o.sessions.every(okSession)) return { ok: false, error: '운동 기록 중 읽을 수 없는 것이 있어요.' };
    if (o.settings != null && !okSettings(o.settings)) return { ok: false, error: '설정 값이 올바르지 않아요.' };
    if (o.body != null && !Array.isArray(o.body)) return { ok: false, error: '몸 기록 형식이 올바르지 않아요.' };
    if (o.routines != null && !Array.isArray(o.routines)) return { ok: false, error: '루틴 형식이 올바르지 않아요.' };
    return { ok: true };
  }

  window.Logic = {
    KEY, DAYS, defaultState, loadState, readStorage, saveState,
    ymd, parse, addDays, dayIndex, dayKey, weekStart,
    weekCount, streakWeeks, lastRecord,
    createRun, completeSet, addRest, restRemaining, finishRest, skipExercise, prevExercise, endRun,
    validateBackup, setFeel, suggest, targetOf, cue,
    weeklySeries, exerciseSeries, exerciseList, upsertBody, bodySeries,
    TEMPO_SEC, koCount, swapExercise, editSession, withWarmup, skipBlock, quickRoutine,
    canRest, badges, monthReport, ensureRoutines, syncRoutine, switchRoutine, addRoutine, renameRoutine, removeRoutine,
  };
})();
