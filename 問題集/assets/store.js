/* ===========================================================================
   AZ-900 問題集 — assets/store.js
   localStorage の読み書き・正規化・セッション管理。
   キー: az900-quiz-v1（既存の az900-study-v1 とは無関係・触れない）。
   依存: window.QUIZ_REGISTRY（session.order の検証に現行の問題ID集合を使う）。
   =========================================================================== */
(function () {
  "use strict";

  var STORAGE_KEY = "az900-quiz-v1";
  var SCHEMA_VERSION = 1;

  function isObj(v) { return v != null && typeof v === "object" && !Array.isArray(v); }
  function isArr(v) { return Array.isArray(v); }
  function isStr(v) { return typeof v === "string"; }
  function isNum(v) { return typeof v === "number" && !isNaN(v); }

  function defaultState() {
    return { version: SCHEMA_VERSION, sets: {} };
  }

  function defaultSetState() {
    return { history: {}, wrongPool: [], session: null, reviewSession: null };
  }

  // 現行データ（QUIZ_REGISTRY）にある問題IDの集合。session.order 検証に使う。
  function questionIdSet(setId) {
    var ids = {};
    var entry = window.QUIZ_REGISTRY && window.QUIZ_REGISTRY.getSet(setId);
    if (entry) {
      entry.questions.forEach(function (q) { ids[q.id] = true; });
    }
    return ids;
  }

  function normalizeHistory(raw) {
    var out = {};
    if (!isObj(raw)) return out;
    Object.keys(raw).forEach(function (id) {
      var h = raw[id];
      if (!isObj(h)) return;
      out[id] = {
        attempts: isNum(h.attempts) ? h.attempts : 0,
        correct: isNum(h.correct) ? h.correct : 0,
        last: (h.last === "correct" || h.last === "wrong") ? h.last : null,
        lastAt: isStr(h.lastAt) ? h.lastAt : "",
      };
    });
    return out;
  }

  // 重複なしの問題ID配列に正規化する。
  function normalizeWrongPool(raw) {
    if (!isArr(raw)) return [];
    var seen = {};
    var out = [];
    raw.forEach(function (id) {
      if (isStr(id) && !seen[id]) { seen[id] = true; out.push(id); }
    });
    return out;
  }

  // selected は単一選択なら数値、複数選択なら数値配列。どちらでもなければ -1（未回答扱い）。
  function normalizeSelected(raw) {
    if (isNum(raw)) return raw;
    if (isArr(raw)) return raw.filter(isNum);
    return -1;
  }

  function normalizeResults(raw) {
    var out = {};
    if (!isObj(raw)) return out;
    Object.keys(raw).forEach(function (id) {
      var r = raw[id];
      if (!isObj(r)) return;
      out[id] = { selected: normalizeSelected(r.selected), ok: !!r.ok };
    });
    return out;
  }

  // order に現データ非存在の問題IDが1つでもあればセッションごと破棄（null）。
  function normalizeSession(raw, validIds) {
    if (!isObj(raw) || !isArr(raw.order) || raw.order.length === 0) return null;
    for (var i = 0; i < raw.order.length; i++) {
      if (!validIds[raw.order[i]]) return null;
    }
    var order = raw.order.slice();
    return {
      startedAt: isStr(raw.startedAt) ? raw.startedAt : "",
      shuffled: !!raw.shuffled,
      batchSize: isNum(raw.batchSize) && raw.batchSize > 0 ? raw.batchSize : order.length,
      order: order,
      cursor: isNum(raw.cursor) ? window.QuizDom.clamp(Math.floor(raw.cursor), 0, order.length) : 0,
      results: normalizeResults(raw.results),
    };
  }

  function normalizeSetState(raw, setId) {
    var base = defaultSetState();
    if (!isObj(raw)) return base;
    var validIds = questionIdSet(setId);
    return {
      history: normalizeHistory(raw.history),
      wrongPool: normalizeWrongPool(raw.wrongPool),
      session: normalizeSession(raw.session, validIds),
      reviewSession: normalizeSession(raw.reviewSession, validIds),
    };
  }

  // 破損・欠損フィールドを既定値で埋め、型を保証する（イミュータブル）。
  function normalizeState(raw) {
    if (!isObj(raw)) return defaultState();
    var sets = {};
    if (isObj(raw.sets)) {
      Object.keys(raw.sets).forEach(function (id) {
        sets[id] = normalizeSetState(raw.sets[id], id);
      });
    }
    return { version: SCHEMA_VERSION, sets: sets };
  }

  function loadState() {
    try {
      var rawText = localStorage.getItem(STORAGE_KEY);
      if (!rawText) return defaultState();
      return normalizeState(JSON.parse(rawText));
    } catch (e) {
      return defaultState();
    }
  }

  // 書き込み失敗（プライベートブラウズ等）は握りつぶし、UIは継続する。
  function saveState(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) { /* noop */ }
  }

  function getSetState(state, setId) {
    return (state.sets && state.sets[setId]) || defaultSetState();
  }

  window.QuizStore = {
    STORAGE_KEY: STORAGE_KEY,
    defaultState: defaultState,
    defaultSetState: defaultSetState,
    loadState: loadState,
    saveState: saveState,
    normalizeState: normalizeState,
    getSetState: getSetState,
  };
})();
