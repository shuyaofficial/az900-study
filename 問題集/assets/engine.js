/* ===========================================================================
   AZ-900 問題集 — assets/engine.js
   バッチ計算・採点・復習リスト等の純ロジック。DOM非依存・イミュータブル更新。
   依存なし（プレーンな setState オブジェクトを受け取り、新しい setState を返す）。
   =========================================================================== */
(function () {
  "use strict";

  function batchIndexOf(cursor, batchSize) {
    return Math.floor(cursor / batchSize);
  }

  function batchBounds(total, batchSize, batchIndex) {
    var start = batchIndex * batchSize;
    var end = Math.min(total, start + batchSize);
    return { start: start, end: end };
  }

  function currentBatchBounds(session) {
    var bi = batchIndexOf(session.cursor, session.batchSize);
    return batchBounds(session.order.length, session.batchSize, bi);
  }

  // カーソルが今のバッチの最後の問題を指しているか（結果画面へ遷移する境界）。
  function isLastQuestionOfBatch(session) {
    var bounds = currentBatchBounds(session);
    return session.cursor + 1 >= bounds.end;
  }

  function isSessionComplete(session) {
    return session.cursor >= session.order.length;
  }

  function currentQuestionId(session) {
    if (!session || isSessionComplete(session)) return null;
    return session.order[session.cursor];
  }

  function createSession(order, batchSize, shuffled) {
    return {
      startedAt: new Date().toISOString(),
      shuffled: !!shuffled,
      batchSize: batchSize,
      order: order.slice(),
      cursor: 0,
      results: {},
    };
  }

  // 復習セッション: バッチ分割なし・シャッフルなし（wrongPool順のまま）。
  function createReviewSession(ids) {
    return {
      startedAt: new Date().toISOString(),
      shuffled: false,
      batchSize: ids.length,
      order: ids.slice(),
      cursor: 0,
      results: {},
    };
  }

  // 解答確定の副作用を1つに集約: history加算 → wrongPool更新 → session.results記録。
  // cursor はここでは進めない（「次へ」押下時に advanceCursor で進める）。
  function applyAnswer(setState, sessionKey, questionId, selectedIndex, isCorrect) {
    var history = Object.assign({}, setState.history);
    var prevH = history[questionId] || { attempts: 0, correct: 0, last: null, lastAt: "" };
    history[questionId] = {
      attempts: prevH.attempts + 1,
      correct: prevH.correct + (isCorrect ? 1 : 0),
      last: isCorrect ? "correct" : "wrong",
      lastAt: new Date().toISOString(),
    };

    var wrongPool = setState.wrongPool.slice();
    var idx = wrongPool.indexOf(questionId);
    if (isCorrect) {
      if (idx !== -1) wrongPool.splice(idx, 1);
    } else if (idx === -1) {
      wrongPool.push(questionId);
    }

    var session = setState[sessionKey];
    var results = Object.assign({}, session.results);
    results[questionId] = { selected: selectedIndex, ok: isCorrect };
    var nextSession = Object.assign({}, session, { results: results });

    var patch = { history: history, wrongPool: wrongPool };
    patch[sessionKey] = nextSession;
    return Object.assign({}, setState, patch);
  }

  function advanceCursor(setState, sessionKey) {
    var session = setState[sessionKey];
    var nextSession = Object.assign({}, session, { cursor: session.cursor + 1 });
    var patch = {};
    patch[sessionKey] = nextSession;
    return Object.assign({}, setState, patch);
  }

  // 指定範囲（バッチ or 復習全体）の正誤集計。
  function batchStats(session, bounds) {
    var correct = 0;
    var wrongIds = [];
    for (var i = bounds.start; i < bounds.end; i++) {
      var id = session.order[i];
      var r = session.results[id];
      if (r && r.ok) correct++;
      else if (r) wrongIds.push(id);
    }
    return { total: bounds.end - bounds.start, correct: correct, wrongIds: wrongIds };
  }

  // セッション全体（回答済み分）の集計。セット完了時の全体成績に使う。
  function overallStats(session) {
    var total = 0;
    var correct = 0;
    var wrongIds = [];
    session.order.forEach(function (id) {
      var r = session.results[id];
      if (!r) return;
      total++;
      if (r.ok) correct++;
      else wrongIds.push(id);
    });
    return { total: total, correct: correct, wrongIds: wrongIds };
  }

  function attemptedCount(setState) {
    return Object.keys(setState.history).filter(function (id) {
      return setState.history[id].attempts > 0;
    }).length;
  }

  // 復習セッション開始時の対象のうち、現在も wrongPool に残っているものを除いた「クリア数」。
  function reviewClearedCount(session, wrongPool) {
    var poolSet = {};
    wrongPool.forEach(function (id) { poolSet[id] = true; });
    var cleared = 0;
    session.order.forEach(function (id) {
      if (!poolSet[id]) cleared++;
    });
    return cleared;
  }

  window.QuizEngine = {
    batchIndexOf: batchIndexOf,
    batchBounds: batchBounds,
    currentBatchBounds: currentBatchBounds,
    isLastQuestionOfBatch: isLastQuestionOfBatch,
    isSessionComplete: isSessionComplete,
    currentQuestionId: currentQuestionId,
    createSession: createSession,
    createReviewSession: createReviewSession,
    applyAnswer: applyAnswer,
    advanceCursor: advanceCursor,
    batchStats: batchStats,
    overallStats: overallStats,
    attemptedCount: attemptedCount,
    reviewClearedCount: reviewClearedCount,
  };
})();
