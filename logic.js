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
      settings: { weeklyGoal: 3, restSec: 60, sound: true },
      schedule,
      favorites: [],
      custom: [],
      sessions: [],
      activeRun: null,
    };
  }

  function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
  const isNum = x => typeof x === 'number' && isFinite(x);
  const DATE = /^\d{4}-\d{2}-\d{2}$/;
  function okItem(x) { return isObj(x) && typeof x.exId === 'string' && typeof x.name === 'string' && isNum(x.sets) && x.sets > 0 && isNum(x.rest) && x.rest >= 0; }
  function okSession(x) { return isObj(x) && typeof x.date === 'string' && DATE.test(x.date) && isNum(x.start) && isNum(x.end) && Array.isArray(x.items) && x.items.every(i => isObj(i) && typeof i.exId === 'string' && Array.isArray(i.sets)); }
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
    if (isObj(o.activeRun)) s.activeRun = o.activeRun;
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
  function streakWeeks(sessions, goal, today) {
    let n = 0, w = addDays(weekStart(today), -7);
    for (let guard = 0; guard < 600 && weekCount(sessions, w) >= goal; guard++) { n++; w = addDays(w, -7); }
    if (weekCount(sessions, today) >= goal) n++;
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
      log: list.map(it => ({ exId: it.exId, name: it.name, sets: [] })),
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
      items: run.log.filter(x => x.sets.length).map(x => ({ exId: x.exId, name: x.name, sets: x.sets })),
    };
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
    return { ok: true };
  }

  window.Logic = {
    KEY, DAYS, defaultState, loadState, readStorage, saveState,
    ymd, parse, addDays, dayIndex, dayKey, weekStart,
    weekCount, streakWeeks, lastRecord,
    createRun, completeSet, addRest, restRemaining, finishRest, skipExercise, prevExercise, endRun,
    validateBackup,
  };
})();
