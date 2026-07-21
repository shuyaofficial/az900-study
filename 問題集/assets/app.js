/* ===========================================================================
   AZ-900 問題集 — assets/app.js
   状態機械・イベント配線・renderループ。非module IIFE、state はイミュータブル更新。
   永続state（QuizStore）と画面遷移用の一時state（ui, route非永続）を分けて保持する。
   依存: window.QUIZ_REGISTRY, window.QuizDom, window.QuizStore, window.QuizEngine,
        window.QuizViews。
   =========================================================================== */
(function () {
  "use strict";

  var REGISTRY = window.QUIZ_REGISTRY;
  var Dom = window.QuizDom;
  var Store = window.QuizStore;
  var Engine = window.QuizEngine;
  var Views = window.QuizViews;
  if (!REGISTRY || !Dom || !Store || !Engine || !Views) return;

  var root = document.getElementById("app");
  if (!root) return;

  var BATCH_SIZES = [10, 20, 35, 50, 70];

  /* --- state ---------------------------------------------------------------- */
  // route は永続化しない。起動時は常に home。
  function defaultUiState() {
    return {
      route: "home",
      mode: "normal",
      activeSetId: null,
      phase: "answering",
      selectedIndex: null,
      selectedIndices: [],
      resultContext: null,
      setupBatchSize: 10,
      setupOrder: "sequential",
    };
  }

  var state = {
    quiz: Store.loadState(),
    ui: defaultUiState(),
  };

  // quiz（永続state）を含む差分のときだけ保存する。ui（route等）は保存しない。
  function setState(patch) {
    state = Object.assign({}, state, patch);
    if (patch.quiz) Store.saveState(state.quiz);
    render();
  }

  // 特定セットの sub-state をイミュータブルに更新した quiz state を返す。
  function updateSetState(setId, updater) {
    var current = Store.getSetState(state.quiz, setId);
    var next = updater(current);
    var sets = Object.assign({}, state.quiz.sets);
    sets[setId] = next;
    return Object.assign({}, state.quiz, { sets: sets });
  }

  function findQuestion(entry, id) {
    for (var i = 0; i < entry.questions.length; i++) {
      if (entry.questions[i].id === id) return entry.questions[i];
    }
    return null;
  }

  function sessionKeyFor(mode) {
    return mode === "review" ? "reviewSession" : "session";
  }

  // セット総数より大きい定番バッチは非表示。総数そのものは常に「全問」として残す。
  function batchOptions(total) {
    var opts = BATCH_SIZES.filter(function (n) { return n < total; }).map(function (n) {
      return { value: n, label: n + "問" };
    });
    opts.push({ value: Math.max(total, 0), label: "全問" });
    return opts;
  }

  function sessionLabelText(session, total) {
    var orderLabel = session.shuffled ? "シャッフル" : "収録順";
    var sizeLabel = session.batchSize >= total ? "全問" : session.batchSize + "問ずつ";
    return session.cursor + "/" + total + "・" + orderLabel + "・" + sizeLabel;
  }

  // 1行目は「次の説明が正しい場合は…」等の定型指示文のことが多いので、
  // 実際の命題が書かれている最後の非空行をプレビューに使う。
  function previewText(stem) {
    var lines = String(stem).split("\n").filter(function (l) { return l.trim() !== ""; });
    var line = lines.length > 0 ? lines[lines.length - 1] : "";
    return line.length > 42 ? line.slice(0, 42) + "…" : line;
  }

  /* --- ナビゲーション・アクション -------------------------------------------- */
  function goHome() {
    setState({ ui: defaultUiState() });
  }

  function openSetup(setId) {
    var entry = REGISTRY.getSet(setId);
    var total = entry ? entry.questions.length : 0;
    setState({
      ui: Object.assign({}, state.ui, {
        route: "setup", activeSetId: setId,
        setupBatchSize: total > 0 ? Math.min(10, total) : 0,
        setupOrder: "sequential",
      }),
    });
  }

  function setSetupBatch(v) {
    setState({ ui: Object.assign({}, state.ui, { setupBatchSize: v }) });
  }

  function setSetupOrder(v) {
    setState({ ui: Object.assign({}, state.ui, { setupOrder: v }) });
  }

  function confirmStart() {
    var ui = state.ui;
    startSession(ui.activeSetId, ui.setupBatchSize, ui.setupOrder === "shuffle");
  }

  // 既存 session は破棄して新規作成する（history/wrongPool は保持）。
  function startSession(setId, batchSize, shuffled) {
    var entry = REGISTRY.getSet(setId);
    if (!entry || entry.questions.length === 0) return;
    var ids = entry.questions.map(function (q) { return q.id; });
    var order = shuffled ? Dom.shuffle(ids) : ids.slice();
    var size = Dom.clamp(batchSize, 1, order.length);
    var session = Engine.createSession(order, size, shuffled);
    var nextQuiz = updateSetState(setId, function (s) {
      return Object.assign({}, s, { session: session });
    });
    setState({
      quiz: nextQuiz,
      ui: Object.assign({}, state.ui, {
        route: "quiz", mode: "normal", activeSetId: setId,
        phase: "answering", selectedIndex: null, selectedIndices: [], resultContext: null,
      }),
    });
  }

  function resumeSession(setId) {
    setState({
      ui: Object.assign({}, state.ui, {
        route: "quiz", mode: "normal", activeSetId: setId,
        phase: "answering", selectedIndex: null, selectedIndices: [], resultContext: null,
      }),
    });
  }

  function resumeReview(setId) {
    setState({
      ui: Object.assign({}, state.ui, {
        route: "quiz", mode: "review", activeSetId: setId,
        phase: "answering", selectedIndex: null, selectedIndices: [], resultContext: null,
      }),
    });
  }

  // 既存 reviewSession は破棄して新規作成する。通常 session には一切影響しない。
  function startReview(setId, ids) {
    if (!ids || ids.length === 0) return;
    var session = Engine.createReviewSession(ids);
    var nextQuiz = updateSetState(setId, function (s) {
      return Object.assign({}, s, { reviewSession: session });
    });
    setState({
      quiz: nextQuiz,
      ui: Object.assign({}, state.ui, {
        route: "quiz", mode: "review", activeSetId: setId,
        phase: "answering", selectedIndex: null, selectedIndices: [], resultContext: null,
      }),
    });
  }

  // 現在出題中の問題を特定する。取得できなければ null（呼び出し側は何もしない）。
  function currentQuestionContext() {
    var setId = state.ui.activeSetId;
    var entry = REGISTRY.getSet(setId);
    if (!entry) return null;
    var sessionKey = sessionKeyFor(state.ui.mode);
    var session = Store.getSetState(state.quiz, setId)[sessionKey];
    if (!session) return null;
    var qid = Engine.currentQuestionId(session);
    if (!qid) return null;
    var question = findQuestion(entry, qid);
    if (!question) return null;
    return { setId: setId, sessionKey: sessionKey, session: session, qid: qid, question: question };
  }

  function selectChoice(index) {
    if (state.ui.phase !== "answering") return; // revealed 中の二重解答を防止
    var ctx = currentQuestionContext();
    if (!ctx) return;
    if (ctx.question.type === "multi") { toggleChoice(index); return; }
    var isCorrect = index === ctx.question.answerIndex;
    var nextQuiz = updateSetState(ctx.setId, function (s) {
      return Engine.applyAnswer(s, ctx.sessionKey, ctx.qid, index, isCorrect);
    });
    setState({
      quiz: nextQuiz,
      ui: Object.assign({}, state.ui, { phase: "revealed", selectedIndex: index }),
    });
  }

  // 複数選択の選択肢トグル。answering 中の multi 問題でのみ有効。
  function toggleChoice(index) {
    if (state.ui.phase !== "answering") return;
    var ctx = currentQuestionContext();
    if (!ctx || ctx.question.type !== "multi") return;
    var current = state.ui.selectedIndices;
    var idx = current.indexOf(index);
    var next = idx === -1 ? current.concat([index]) : current.slice(0, idx).concat(current.slice(idx + 1));
    setState({ ui: Object.assign({}, state.ui, { selectedIndices: next }) });
  }

  // 複数選択の解答確定。選択数が正解数と一致しているときのみ有効。
  function confirmMulti() {
    if (state.ui.phase !== "answering") return;
    var ctx = currentQuestionContext();
    if (!ctx || ctx.question.type !== "multi") return;
    var required = ctx.question.answerIndices;
    var selected = state.ui.selectedIndices;
    if (selected.length !== required.length) return;
    var sorted = selected.slice().sort(function (a, b) { return a - b; });
    var isCorrect = Engine.isSameIndexSet(sorted, required);
    var nextQuiz = updateSetState(ctx.setId, function (s) {
      return Engine.applyAnswer(s, ctx.sessionKey, ctx.qid, sorted, isCorrect);
    });
    setState({
      quiz: nextQuiz,
      ui: Object.assign({}, state.ui, { phase: "revealed", selectedIndices: sorted }),
    });
  }

  function goNext() {
    var setId = state.ui.activeSetId;
    var mode = state.ui.mode;
    var sessionKey = sessionKeyFor(mode);
    var session = Store.getSetState(state.quiz, setId)[sessionKey];
    if (!session) { goHome(); return; }
    var bounds = Engine.currentBatchBounds(session);
    var batchIndex = Engine.batchIndexOf(session.cursor, session.batchSize);
    var isBatchDone = Engine.isLastQuestionOfBatch(session);
    var nextQuiz = updateSetState(setId, function (s) {
      return Engine.advanceCursor(s, sessionKey);
    });
    if (isBatchDone) {
      setState({
        quiz: nextQuiz,
        ui: Object.assign({}, state.ui, {
          route: "result",
          resultContext: { setId: setId, mode: mode, sessionKey: sessionKey, bounds: bounds, batchIndex: batchIndex },
        }),
      });
    } else {
      setState({
        quiz: nextQuiz,
        ui: Object.assign({}, state.ui, { phase: "answering", selectedIndex: null, selectedIndices: [] }),
      });
    }
  }

  function goToNextBatch() {
    var ctx = state.ui.resultContext;
    if (!ctx) { goHome(); return; }
    setState({
      ui: Object.assign({}, state.ui, {
        route: "quiz", mode: "normal", activeSetId: ctx.setId,
        phase: "answering", selectedIndex: null, selectedIndices: [], resultContext: null,
      }),
    });
  }

  /* --- viewModel構築（表示用データの算出。DOM構築はしない） -------------------- */
  function buildHomeViewModel() {
    var items = REGISTRY.getSets().map(function (entry) {
      var setStateObj = Store.getSetState(state.quiz, entry.id);
      var total = entry.questions.length;
      var session = setStateObj.session;
      var sessionActive = !!session && session.cursor < session.order.length;
      var reviewSession = setStateObj.reviewSession;
      var reviewActive = !!reviewSession && reviewSession.cursor < reviewSession.order.length;
      return {
        id: entry.id,
        title: entry.title,
        totalCount: total,
        attemptedCount: Engine.attemptedCount(setStateObj),
        sessionActive: sessionActive,
        sessionLabel: sessionActive ? sessionLabelText(session, total) : "",
        wrongCount: setStateObj.wrongPool.length,
        reviewActive: reviewActive,
        reviewLabel: reviewActive ? (reviewSession.cursor + "/" + reviewSession.order.length) : "",
      };
    });
    return {
      items: items,
      onStart: openSetup,
      onContinue: resumeSession,
      onSetupAgain: openSetup,
      onReview: function (id) {
        var setStateObj = Store.getSetState(state.quiz, id);
        startReview(id, setStateObj.wrongPool.slice());
      },
      onContinueReview: resumeReview,
    };
  }

  function buildSetupViewModel() {
    var setId = state.ui.activeSetId;
    var entry = REGISTRY.getSet(setId);
    if (!entry) return null;
    var total = entry.questions.length;
    var setStateObj = Store.getSetState(state.quiz, setId);
    var session = setStateObj.session;
    var sessionActive = !!session && session.cursor < session.order.length;
    return {
      setId: setId,
      title: entry.title,
      totalCount: total,
      batchOptions: batchOptions(total),
      selectedBatch: state.ui.setupBatchSize,
      selectedOrder: state.ui.setupOrder,
      sessionActive: sessionActive,
      sessionLabel: sessionActive ? (session.cursor + "/" + total) : "",
      onSelectBatch: setSetupBatch,
      onSelectOrder: setSetupOrder,
      onStart: confirmStart,
      onBack: goHome,
    };
  }

  function buildBeginnerWrongList(question) {
    var list = [];
    if (!question.beginner || !Array.isArray(question.beginner.wrong)) return list;
    question.choices.forEach(function (choiceText, i) {
      if (i === question.answerIndex) return;
      var reason = question.beginner.wrong[i];
      if (reason) list.push({ text: choiceText, reason: reason });
    });
    return list;
  }

  function buildQuizViewModel() {
    var ui = state.ui;
    var entry = REGISTRY.getSet(ui.activeSetId);
    if (!entry) return null;
    var ctx = currentQuestionContext();
    if (!ctx) return null;
    var session = ctx.session;
    var question = ctx.question;
    var bounds = Engine.currentBatchBounds(session);
    var posInBatch = session.cursor - bounds.start + 1;
    var batchTotal = bounds.end - bounds.start;
    var batchIndex = Engine.batchIndexOf(session.cursor, session.batchSize);
    var hasBeginner = !!(question.beginner && question.beginner.lead);
    var isMulti = question.type === "multi";
    var requiredCount = isMulti ? question.answerIndices.length : 0;
    return {
      setTitle: entry.title,
      mode: ui.mode,
      blockLabel: ui.mode === "review" ? "復習モード" : ("第" + (batchIndex + 1) + "ブロック"),
      progressCurrent: posInBatch,
      progressTotal: batchTotal,
      progressRatio: batchTotal > 0 ? posInBatch / batchTotal : 0,
      question: {
        domain: question.domain, no: question.no, type: question.type,
        stem: question.stem, choices: question.choices,
      },
      phase: ui.phase,
      selectedIndex: ui.selectedIndex,
      correctIndex: question.answerIndex,
      isMulti: isMulti,
      requiredCount: requiredCount,
      selectedIndices: ui.selectedIndices,
      correctIndices: isMulti ? question.answerIndices : [],
      canConfirm: isMulti && ui.selectedIndices.length === requiredCount,
      explanation: question.explanation,
      hasBeginner: hasBeginner,
      beginnerLead: hasBeginner ? question.beginner.lead : "",
      beginnerWrongList: buildBeginnerWrongList(question),
      isLastOfBatch: Engine.isLastQuestionOfBatch(session),
      onSelect: selectChoice,
      onToggle: toggleChoice,
      onConfirm: confirmMulti,
      onNext: goNext,
      onExit: goHome,
    };
  }

  function buildResultViewModel() {
    var ctx = state.ui.resultContext;
    if (!ctx) return null;
    var entry = REGISTRY.getSet(ctx.setId);
    if (!entry) return null;
    var setStateObj = Store.getSetState(state.quiz, ctx.setId);
    var session = setStateObj[ctx.sessionKey];
    if (!session) return null;
    var stats = Engine.batchStats(session, ctx.bounds);
    var wrongList = stats.wrongIds.map(function (id) {
      var q = findQuestion(entry, id);
      return q ? { id: id, no: q.no, preview: previewText(q.stem) } : null;
    }).filter(function (v) { return v != null; });
    var pct = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
    var sessionComplete = Engine.isSessionComplete(session);
    var isReviewResult = ctx.mode === "review";

    var nextCount = 0;
    if (!sessionComplete) {
      var nextIndex = Engine.batchIndexOf(session.cursor, session.batchSize);
      var nextBounds = Engine.batchBounds(session.order.length, session.batchSize, nextIndex);
      nextCount = nextBounds.end - nextBounds.start;
    }
    var overall = null;
    if (sessionComplete && !isReviewResult) {
      var ov = Engine.overallStats(session);
      overall = { correct: ov.correct, total: ov.total, pct: ov.total > 0 ? Math.round((ov.correct / ov.total) * 100) : 0 };
    }
    var reviewInfo = null;
    if (isReviewResult) {
      var cleared = Engine.reviewClearedCount(session, setStateObj.wrongPool);
      reviewInfo = { total: session.order.length, cleared: cleared, remaining: session.order.length - cleared };
    }
    return {
      setTitle: entry.title,
      mode: ctx.mode,
      score: { correct: stats.correct, total: stats.total, pct: pct },
      wrongList: wrongList,
      hasNextBatch: !sessionComplete,
      nextBatchCount: nextCount,
      // 復習結果画面ではバッチ/まとめ復習ボタンの代わりに「もう一度復習」のみ出す。
      hasBatchWrong: !isReviewResult && stats.wrongIds.length > 0,
      hasWrongPool: !isReviewResult && setStateObj.wrongPool.length > 0,
      wrongPoolCount: setStateObj.wrongPool.length,
      isSetComplete: sessionComplete && !isReviewResult,
      overall: overall,
      isReviewResult: isReviewResult,
      reviewInfo: reviewInfo,
      onNextBatch: goToNextBatch,
      onRetryBatch: function () { startReview(ctx.setId, stats.wrongIds); },
      onReviewAll: function () { startReview(ctx.setId, setStateObj.wrongPool.slice()); },
      onReviewAgain: function () {
        var poolSet = {};
        setStateObj.wrongPool.forEach(function (id) { poolSet[id] = true; });
        var remainIds = session.order.filter(function (id) { return poolSet[id]; });
        startReview(ctx.setId, remainIds);
      },
      onHome: goHome,
    };
  }

  /* --- レンダリング ----------------------------------------------------------- */
  function buildFallback(message) {
    return Dom.el("div", { class: "qz-page" }, [
      Dom.el("section", { class: "qz-card qz-empty" }, [
        Dom.el("p", { text: message }),
        Dom.el("button", {
          class: "qz-btn qz-btn--primary qz-btn--block", type: "button", text: "トップへ", onclick: goHome,
        }),
      ]),
    ]);
  }

  function safeView(builder, vm, fallbackMessage) {
    return vm ? builder(vm) : buildFallback(fallbackMessage);
  }

  function render() {
    var node;
    switch (state.ui.route) {
      case "setup":
        node = safeView(Views.buildSetup, buildSetupViewModel(), "セットが見つかりません");
        break;
      case "quiz":
        node = safeView(Views.buildQuiz, buildQuizViewModel(), "問題を読み込めませんでした");
        break;
      case "result":
        node = safeView(Views.buildResult, buildResultViewModel(), "結果を表示できませんでした");
        break;
      default:
        node = Views.buildHome(buildHomeViewModel());
    }
    root.textContent = "";
    root.appendChild(node);
    // revealed 表示後は「次へ」へフォーカス移動する。
    if (state.ui.route === "quiz" && state.ui.phase === "revealed") {
      // preventScroll: 正誤ハイライトと解説が見える位置を保ったままフォーカスだけ移す
      var nextBtn = root.querySelector('[data-role="next"]');
      if (nextBtn) nextBtn.focus({ preventScroll: true });
    }
  }

  render();
})();
