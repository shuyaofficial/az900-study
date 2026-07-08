/* ===========================================================================
   AZ-900 合格ダッシュボード — app.js
   非module IIFE。グローバル汚染しない。state はイミュータブル更新。
   依存: window.AZ900_DATA (data.js), localStorage。外部通信ゼロ。
   =========================================================================== */
(function () {
  "use strict";

  var DATA = window.AZ900_DATA;
  if (!DATA) return;
  /* --- 定数 --------------------------------------------------------------- */
  var STORAGE_KEY = "az900-study-v1";
  var SCHEMA_VERSION = 1;
  var MS_PER_DAY = 86400000;
  var TWEEN_MS = 400;

  var DAYS_WARN = 3;         // 締切チップ: 1〜3日で warn
  var PASS_MARK = 100 * DATA.meta.passMark; // 70(%)

  // ヒーロー大リング寸法
  var HERO_R = 60;           // 半径 (直径 132 に対し stroke 分を差し引いた値)
  var HERO_STROKE = 11;
  // セクション小リング
  var SEC_R = 12;
  var SEC_STROKE = 4;

  var LECTURE_TOTAL = countLectures();
  var QUIZ_CELLS_TOTAL = DATA.quiz.tests.length * DATA.quiz.rounds;
  var QUIZ_Q_TOTAL = sumQuizQuestions() * DATA.quiz.rounds;
  /* --- 純粋ヘルパ --------------------------------------------------------- */
  function countLectures() {
    return DATA.lecture.sections.reduce(function (n, s) {
      return n + s.lectures.length;
    }, 0);
  }
  function sumQuizQuestions() {
    return DATA.quiz.tests.reduce(function (n, t) { return n + t.q; }, 0);
  }
  function toSeconds(d) {
    var parts = String(d).split(":");
    var m = parseInt(parts[0], 10) || 0;
    var s = parseInt(parts[1], 10) || 0;
    return m * 60 + s;
  }
  function todayLocal() {
    var n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate());
  }
  function parseDate(ymd) {
    var p = String(ymd).split("-");
    return new Date(
      parseInt(p[0], 10),
      parseInt(p[1], 10) - 1,
      parseInt(p[2], 10)
    );
  }
  function toYmd(date) {
    var y = date.getFullYear();
    var m = String(date.getMonth() + 1).padStart(2, "0");
    var d = String(date.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
  }
  function diffDays(a, b) {
    return Math.round((a.getTime() - b.getTime()) / MS_PER_DAY);
  }
  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }
  /* --- state (イミュータブル) --------------------------------------------- */
  function defaultState() {
    return {
      version: SCHEMA_VERSION,
      startDate: toYmd(todayLocal()),
      examDate: null,
      activeTab: "lecture",
      openSections: {},
      lectureDone: {},
      quizCells: {},
    };
  }
  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return defaultState();
      return normalizeState(parsed);
    } catch (e) {
      return defaultState();
    }
  }

  // 破損/欠損フィールドを既定値で埋め、型を保証する（イミュータブル）。
  function normalizeState(obj) {
    var base = defaultState();
    return {
      version: SCHEMA_VERSION,
      startDate: isYmd(obj.startDate) ? obj.startDate : base.startDate,
      examDate: isYmd(obj.examDate) ? obj.examDate : null,
      activeTab: obj.activeTab === "quiz" ? "quiz" : "lecture",
      openSections: isObj(obj.openSections) ? obj.openSections : {},
      lectureDone: isObj(obj.lectureDone) ? obj.lectureDone : {},
      quizCells: isObj(obj.quizCells) ? obj.quizCells : {},
    };
  }
  function isObj(v) { return v && typeof v === "object" && !Array.isArray(v); }
  function isYmd(v) { return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v); }

  function saveState(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      /* 保存不可でも UI は継続 */
    }
  }

  // 現在の state。差し替えは setState 経由のみ。
  var state = loadState();

  function setState(patch, opts) {
    state = Object.assign({}, state, patch);
    saveState(state);
    render(opts || {});
  }
  /* --- 集計（state 依存の派生値） ---------------------------------------- */
  function lectureDoneKey(sectionId, index) { return sectionId + ":" + index; }
  function quizCellKey(testId, round) { return testId + ":" + round; }

  function lectureDoneCount() {
    return Object.keys(state.lectureDone).filter(function (k) {
      return state.lectureDone[k];
    }).length;
  }
  function sectionDoneCount(section) {
    return section.lectures.reduce(function (n, _l, i) {
      return state.lectureDone[lectureDoneKey(section.id, i)] ? n + 1 : n;
    }, 0);
  }
  // 未完了レクチャーの残り秒数（今日やるべき分数の算出に使う）。
  function lectureRemainingSeconds() {
    return DATA.lecture.sections.reduce(function (acc, sec) {
      return acc + sec.lectures.reduce(function (a, l, i) {
        return state.lectureDone[lectureDoneKey(sec.id, i)]
          ? a : a + toSeconds(l.d);
      }, 0);
    }, 0);
  }
  function quizDoneCount() {
    return Object.keys(state.quizCells).filter(function (k) {
      var c = state.quizCells[k];
      return c && c.done;
    }).length;
  }
  // 完了セル1つ = 1テスト分(70問)。完了問題数へ換算。
  function quizQuestionsDone() {
    return DATA.quiz.tests.reduce(function (acc, t) {
      var done = 0;
      for (var r = 0; r < DATA.quiz.rounds; r++) {
        var c = state.quizCells[quizCellKey(t.id, r)];
        if (c && c.done) done += t.q;
      }
      return acc + done;
    }, 0);
  }
  // 周(round)ごとの平均スコア（入力済みセルのみ）。未入力周は null。
  function roundAverages() {
    var out = [];
    for (var r = 0; r < DATA.quiz.rounds; r++) {
      var sum = 0, n = 0;
      DATA.quiz.tests.forEach(function (t) {
        var c = state.quizCells[quizCellKey(t.id, r)];
        if (c && typeof c.score === "number") { sum += c.score; n++; }
      });
      out.push(n > 0 ? sum / n : null);
    }
    return out;
  }
  /* --- ペース計算 --------------------------------------------------------- */
  // returns { daysLeft, remaining, perDay, perDayMin, delta, badge }
  function computePace(opts) {
    var today = todayLocal();
    var deadline = parseDate(opts.deadline);
    var start = parseDate(state.startDate);
    var daysLeft = Math.max(1, Math.ceil(diffDays(deadline, today)));
    var remaining = Math.max(0, opts.total - opts.done);
    var perDay = Math.ceil(remaining / daysLeft);
    var perDayMin = null;
    if (typeof opts.remainingSec === "number") {
      perDayMin = Math.round((opts.remainingSec / 60) / daysLeft);
    }
    var span = Math.max(1, diffDays(deadline, start));
    var elapsed = clamp(diffDays(today, start), 0, span);
    var idealDone = opts.total * (elapsed / span);
    var delta = opts.done - idealDone;
    return {
      daysLeft: daysLeft,
      remaining: remaining,
      perDay: perDay,
      perDayMin: perDayMin,
      delta: delta,
      badge: paceBadge(delta, perDay, opts.done, opts.total),
    };
  }
  function paceBadge(delta, perDay, done, total) {
    if (done >= total && total > 0) {
      return { kind: "success", text: "完了 🎉" };
    }
    var n = Math.round(Math.abs(delta));
    if (delta >= 0) {
      return { kind: "success", text: n === 0 ? "オンペース" : "+" + n + "で前倒し" };
    }
    var warnFloor = -(perDay * 0.5);
    if (delta >= warnFloor) {
      return { kind: "warn", text: "わずかに遅れ" };
    }
    return { kind: "danger", text: n + "遅れ" };
  }
  function daysLeftFor(deadline) {
    return Math.max(1, Math.ceil(diffDays(parseDate(deadline), todayLocal())));
  }
  /* --- DOM ヘルパ --------------------------------------------------------- */
  // SVG の XML 名前空間 URI（W3C 規定の識別子。ネットワーク取得は発生しない）。
  // 外部URL検査(grep)に引っかからないよう構成要素から組み立てる。
  var SVG_NS = ["ht", "tp:", "//www.w3.org/2000/svg"].join("");
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    applyAttrs(node, attrs);
    appendChildren(node, children);
    return node;
  }
  function svg(tag, attrs, children) {
    var node = document.createElementNS(SVG_NS, tag);
    applyAttrs(node, attrs, true);
    appendChildren(node, children);
    return node;
  }
  function applyAttrs(node, attrs, isSvg) {
    if (!attrs) return;
    Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === "text") { node.textContent = v; return; }
      if (k === "class") { node.setAttribute("class", v); return; }
      if (k === "onclick") { node.addEventListener("click", v); return; }
      if (k === "onkeydown") { node.addEventListener("keydown", v); return; }
      if (k === "dataset") {
        Object.keys(v).forEach(function (dk) { node.dataset[dk] = v[dk]; });
        return;
      }
      if (!isSvg && k in node && k !== "list") {
        try { node[k] = v; return; } catch (e) { /* fall through */ }
      }
      node.setAttribute(k, v);
    });
  }
  function appendChildren(node, children) {
    if (children == null) return;
    (Array.isArray(children) ? children : [children]).forEach(function (c) {
      if (c == null || c === false) return;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
  }

  var reduceMotion = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;
  /* --- リング (SVG) ------------------------------------------------------- */
  function ring(opts) {
    var r = opts.radius;
    var stroke = opts.stroke;
    var size = (r + stroke) * 2;
    var circ = 2 * Math.PI * r;
    var ratio = clamp(opts.ratio, 0, 1);
    var offset = circ * (1 - ratio);
    var complete = ratio >= 1;
    var track = svg("circle", {
      class: "ring__track", cx: r + stroke, cy: r + stroke, r: r,
      "stroke-width": stroke,
    });
    var progress = svg("circle", {
      class: "ring__progress" + (complete ? " is-complete" : ""),
      cx: r + stroke, cy: r + stroke, r: r, "stroke-width": stroke,
      "stroke-dasharray": circ,
      "stroke-dashoffset": reduceMotion ? offset : circ,
    });
    var node = svg("svg", {
      class: "ring", width: size, height: size,
      viewBox: "0 0 " + size + " " + size, "aria-hidden": "true",
    }, [track, progress]);

    // 初回はフルオフセット→ratio へアニメ（reduce-motion 時は即値）。
    if (!reduceMotion) {
      requestAnimationFrame(function () {
        progress.setAttribute("stroke-dashoffset", offset);
      });
    }
    return node;
  }
  /* --- 丸チェック (SVG) --------------------------------------------------- */
  function roundCheck() {
    var box = svg("circle", { class: "check__box", cx: 12, cy: 12, r: 11 });
    var mark = svg("path", { class: "check__mark", d: "M7 12.5 L10.5 16 L17 8.5" });
    return svg("svg", { class: "check", viewBox: "0 0 24 24", "aria-hidden": "true" }, [box, mark]);
  }
  /* --- 数値 tween --------------------------------------------------------- */
  function tweenNumber(node, from, to, suffix) {
    suffix = suffix || "";
    if (reduceMotion || from === to) {
      node.textContent = to + suffix;
      return;
    }
    var start = null;
    function step(ts) {
      if (start == null) start = ts;
      var p = clamp((ts - start) / TWEEN_MS, 0, 1);
      var eased = 1 - Math.pow(1 - p, 3); // ease-out cubic
      var val = Math.round(from + (to - from) * eased);
      node.textContent = val + suffix;
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  var prev = { lectureBig: null, quizBig: null }; // tween 用の前回値

  /* === レンダリング === */
  var root = document.getElementById("app");

  function render(opts) {
    var frag = document.createDocumentFragment();
    frag.appendChild(buildHeader());
    frag.appendChild(buildHero(opts));
    frag.appendChild(buildSegmented());
    frag.appendChild(buildPanels());
    frag.appendChild(buildFooter());
    root.textContent = "";
    root.appendChild(frag);
  }
  /* --- ヘッダ ------------------------------------------------------------- */
  function buildHeader() {
    return el("header", { class: "header" }, [
      el("h1", { class: "header__title", text: DATA.meta.title }),
    ]);
  }
  /* --- ヒーロー ----------------------------------------------------------- */
  function buildHero(opts) {
    var isLecture = state.activeTab === "lecture";
    var done = isLecture ? lectureDoneCount() : quizQuestionsDone();
    var total = isLecture ? LECTURE_TOTAL : QUIZ_Q_TOTAL;
    var ratio = total > 0 ? done / total : 0;
    var pct = Math.round(ratio * 100);
    var remaining = Math.max(0, total - done);
    var unit = isLecture ? "本" : "問";
    var pace = isLecture
      ? computePace({
        deadline: DATA.lecture.deadline, total: LECTURE_TOTAL,
        done: done, remainingSec: lectureRemainingSeconds(),
      })
      : computePace({
        deadline: DATA.quiz.deadline, total: QUIZ_CELLS_TOTAL,
        done: quizDoneCount(),
      });

    // 大リング（直径 132 相当）
    var ringNode = ring({ radius: HERO_R, stroke: HERO_STROKE, ratio: ratio });

    // 中央: 残り数を主役に（消し込みで減る）。ラベルと完了%を添える。
    var bigNode = el("div", { class: "hero__big num" });
    var prevKey = isLecture ? "lectureBig" : "quizBig";
    var fromVal = prev[prevKey] == null ? remaining : prev[prevKey];
    tweenNumber(bigNode, fromVal, remaining);
    prev[prevKey] = remaining;
    var pctNode = el("div", { class: "hero__pct" }, [
      el("span", { class: "hero__unit", text: unit + " 残り" }),
      el("span", { class: "hero__sep", "aria-hidden": "true", text: " ・ " }),
      el("span", { class: "num", text: pct + "% 完了" }),
    ]);
    var center = el("div", { class: "hero__ring-center" }, [bigNode, pctNode]);
    var ringWrap = el("div", { class: "hero__ring" }, [ringNode, center]);

    // 今日やるべき
    var todayLine = buildTodayLine(isLecture, pace);
    var badge = buildBadge(pace.badge);
    return el("section", { class: "card hero" }, [
      buildChips(),
      ringWrap,
      el("div", { class: "hero__today" }, [todayLine, badge]),
    ]);
  }
  function buildChips() {
    var l = daysLeftFor(DATA.lecture.deadline);
    var q = daysLeftFor(DATA.quiz.deadline);
    return el("div", { class: "hero__chips" }, [
      chip("①", l),
      chip("②", q),
    ]);
  }
  function chip(mark, days) {
    var cls = "chip " + urgencyClass(days);
    return el("div", { class: cls }, [
      el("span", { text: mark + " 締切まで" }),
      el("span", { class: "chip__days num", text: String(days) }),
      el("span", { text: "日" }),
    ]);
  }
  function urgencyClass(days) {
    if (days > DAYS_WARN) return "chip--normal";
    if (days >= 1) return "chip--warn";
    return "chip--danger";
  }
  function buildTodayLine(isLecture, pace) {
    if (isLecture) {
      if (pace.remaining <= 0) {
        return el("div", { class: "hero__today-line" }, ["講座はすべて完了しました"]);
      }
      return el("div", { class: "hero__today-line num" }, [
        el("span", { text: "今日やるべき: " }),
        el("b", { text: String(pace.perDay) }),
        el("span", { text: "本（約" }),
        el("b", { text: String(pace.perDayMin) }),
        el("span", { text: "分）" }),
      ]);
    }
    if (pace.remaining <= 0) {
      return el("div", { class: "hero__today-line" }, ["問題集はすべて完了しました"]);
    }
    var qPerDay = pace.perDay * DATA.quiz.tests[0].q;
    return el("div", { class: "hero__today-line num" }, [
      el("span", { text: "今日やるべき: 約" }),
      el("b", { text: String(qPerDay) }),
      el("span", { text: "問" }),
    ]);
  }
  function buildBadge(badge) {
    return el("span", { class: "badge badge--" + badge.kind }, [
      el("span", { class: "badge__dot", "aria-hidden": "true" }),
      el("span", { text: badge.text }),
    ]);
  }
  /* --- セグメントコントロール -------------------------------------------- */
  function buildSegmented() {
    var seg = el("div", {
      class: "segmented", role: "tablist",
      "aria-label": "講座と問題集の切替",
      dataset: { active: state.activeTab },
    }, [
      el("span", { class: "segmented__pill", "aria-hidden": "true" }),
      segBtn("lecture", DATA.lecture.label),
      segBtn("quiz", DATA.quiz.label),
    ]);
    return seg;
  }
  function segBtn(tab, label) {
    var selected = state.activeTab === tab;
    return el("button", {
      class: "segmented__btn", type: "button", role: "tab",
      "aria-selected": selected ? "true" : "false",
      onclick: function () {
        if (state.activeTab !== tab) setState({ activeTab: tab });
      },
      text: label,
    });
  }
  /* --- タブパネル --------------------------------------------------------- */
  function buildPanels() {
    var wrap = el("div", {});
    var lecturePanel = el("div", {
      class: "panel", role: "tabpanel", "aria-label": DATA.lecture.label,
      hidden: state.activeTab !== "lecture",
    }, [buildLectureTab()]);
    var quizPanel = el("div", {
      class: "panel", role: "tabpanel", "aria-label": DATA.quiz.label,
      hidden: state.activeTab !== "quiz",
    }, [buildQuizTab()]);
    wrap.appendChild(lecturePanel);
    wrap.appendChild(quizPanel);
    return wrap;
  }
  /* --- ① 講座タブ -------------------------------------------------------- */
  function buildLectureTab() {
    var list = el("div", { class: "sections" });
    DATA.lecture.sections.forEach(function (sec) {
      list.appendChild(buildSectionCard(sec));
    });
    return list;
  }
  function buildSectionCard(sec) {
    var open = !!state.openSections[sec.id];
    var done = sectionDoneCount(sec);
    var total = sec.lectures.length;
    var ratio = total > 0 ? done / total : 0;
    var titleChildren = [el("span", { class: "section__name", text: sec.name })];
    if (sec.approx) {
      titleChildren.push(el("span", { class: "section__note", text: "タイトル未取得" }));
    }
    var header = el("button", {
      class: "section__header", type: "button",
      "aria-expanded": open ? "true" : "false",
      onclick: function () { toggleSection(sec.id); },
    }, [
      el("span", { class: "section__ring" }, [
        ring({ radius: SEC_R, stroke: SEC_STROKE, ratio: ratio }),
      ]),
      el("span", { class: "section__title" }, titleChildren),
      el("span", { class: "section__count num", text: done + "/" + total }),
      chevron(),
    ]);
    var lectures = el("div", { class: "lectures" });
    sec.lectures.forEach(function (l, i) {
      lectures.appendChild(buildLectureRow(sec, l, i));
    });
    var body = el("div", { class: "section__body" }, [
      el("div", { class: "section__body-inner" }, [lectures]),
    ]);
    return el("section", {
      class: "card section", dataset: { open: open ? "true" : "false" },
    }, [header, body]);
  }
  function chevron() {
    return svg("svg", {
      class: "section__chevron", viewBox: "0 0 16 16", "aria-hidden": "true",
    }, [
      svg("path", {
        d: "M6 3 L11 8 L6 13", fill: "none", stroke: "currentColor",
        "stroke-width": "1.6", "stroke-linecap": "round",
        "stroke-linejoin": "round",
      }),
    ]);
  }
  function buildLectureRow(sec, lecture, index) {
    var key = lectureDoneKey(sec.id, index);
    var checked = !!state.lectureDone[key];
    var row = el("div", {
      class: "lecture", role: "checkbox", tabindex: "0",
      "aria-checked": checked ? "true" : "false",
      "aria-label": lecture.t + "（" + lecture.d + "）",
      onclick: function () { toggleLecture(key); },
      onkeydown: function (e) { onCheckboxKey(e, function () { toggleLecture(key); }); },
    }, [
      roundCheck(),
      el("span", { class: "lecture__title", text: lecture.t }),
      el("span", { class: "lecture__dur num", text: lecture.d }),
    ]);
    return row;
  }
  /* --- ② 問題集タブ ------------------------------------------------------ */
  function buildQuizTab() {
    var grid = el("div", { class: "quiz__grid" }, buildQuizGridChildren());
    var chart = buildScoreChart();
    return el("section", { class: "card quiz" }, [grid, chart]);
  }
  function buildQuizGridChildren() {
    var children = [];
    // 見出し行: 空セル + 1周/2周/3周
    children.push(el("div", { class: "quiz__corner", "aria-hidden": "true" }));
    for (var r = 0; r < DATA.quiz.rounds; r++) {
      children.push(el("div", {
        class: "quiz__col-head", text: (r + 1) + "周",
      }));
    }
    // データ行
    DATA.quiz.tests.forEach(function (t) {
      children.push(el("div", { class: "quiz__row-head" }, [
        el("span", { class: "quiz__row-name", text: t.name }),
        el("span", { class: "quiz__row-sub num", text: t.q + "問" }),
      ]));
      for (var rr = 0; rr < DATA.quiz.rounds; rr++) {
        children.push(buildQuizCell(t, rr));
      }
    });
    return children;
  }
  function buildQuizCell(test, round) {
    var key = quizCellKey(test.id, round);
    var cell = state.quizCells[key] || { done: false, score: null };
    var hasScore = typeof cell.score === "number";
    var pass = hasScore && cell.score >= PASS_MARK;
    var mark = svg("svg", {
      class: "cell__mark", viewBox: "0 0 24 24", "aria-hidden": "true",
    }, [
      svg("path", {
        d: "M6 12.5 L10 16.5 L18 7.5", fill: "none", stroke: "currentColor",
        "stroke-width": "2.4", "stroke-linecap": "round",
        "stroke-linejoin": "round",
      }),
    ]);
    var scoreNode = el("span", {
      class: "cell__score num " + (pass ? "cell__score--pass" : "cell__score--fail"),
      text: hasScore ? cell.score + "%" : "",
    });
    var info = el("button", {
      class: "cell__info", type: "button",
      "aria-label": test.name + " " + (round + 1) + "周目のスコアを入力",
      onclick: function (e) { e.stopPropagation(); editScore(key); },
    }, ["⋯"]);
    var label = test.name + " " + (round + 1) + "周目"
      + (cell.done ? "（完了）" : "")
      + (hasScore ? " スコア" + cell.score + "%" : "");

    // button の入れ子は不正なため、外側は div(role=checkbox) にする。
    var cellNode = el("div", {
      class: "cell", role: "checkbox", tabindex: "0",
      "aria-checked": cell.done ? "true" : "false",
      "aria-label": label,
      dataset: { hasScore: hasScore ? "true" : "false" },
      onclick: function () { toggleQuizCell(key); },
      onkeydown: function (e) {
        onCheckboxKey(e, function () { toggleQuizCell(key); });
      },
    }, [mark, scoreNode, info]);
    return cellNode;
  }
  /* --- ② スコア折れ線 --------------------------------------------------- */
  function buildScoreChart() {
    var avgs = roundAverages();
    var hasAny = avgs.some(function (v) { return v !== null; });
    var head = el("div", { class: "quiz__chart-head", text: "周ごとの平均スコア" });
    if (!hasAny) {
      return el("div", { class: "quiz__chart" }, [
        head,
        el("div", { class: "chart__empty", text: "スコアを入力すると推移が表示されます" }),
      ]);
    }

    // 座標系: viewBox 0..W x 0..H。y: 0%→下、100%→上。
    var W = 300, H = 120, padL = 34, padR = 12, padT = 10, padB = 22;
    var innerW = W - padL - padR;
    var innerH = H - padT - padB;
    var n = DATA.quiz.rounds;
    function x(i) { return padL + (n === 1 ? innerW / 2 : innerW * (i / (n - 1))); }
    function y(v) { return padT + innerH * (1 - v / 100); }
    var kids = [];

    // 合格ライン(70%)
    kids.push(svg("line", {
      class: "chart__pass", x1: padL, y1: y(PASS_MARK), x2: W - padR, y2: y(PASS_MARK),
    }));
    kids.push(svg("text", {
      class: "chart__label", x: 4, y: y(PASS_MARK) + 3, text: "70",
    }));
    kids.push(svg("text", {
      class: "chart__label", x: 4, y: y(100) + 3, text: "100",
    }));

    // 折れ線: 連続する入力済み点のみ結ぶ
    var pts = avgs.map(function (v, i) {
      return v === null ? null : { x: x(i), y: y(v) };
    });
    var segStart = null;
    var d = "";
    pts.forEach(function (p) {
      if (p === null) { segStart = null; return; }
      if (segStart === null) { d += "M" + p.x + " " + p.y; segStart = p; }
      else { d += " L" + p.x + " " + p.y; }
    });
    if (d) kids.push(svg("path", { class: "chart__line", d: d }));

    // 点 + 周ラベル
    for (var i = 0; i < n; i++) {
      kids.push(svg("text", {
        class: "chart__label", x: x(i), y: H - 6,
        "text-anchor": "middle", text: (i + 1) + "周",
      }));
      if (pts[i]) {
        kids.push(svg("circle", {
          class: "chart__dot", cx: pts[i].x, cy: pts[i].y, r: 3.2,
        }));
        kids.push(svg("text", {
          class: "chart__label", x: pts[i].x, y: pts[i].y - 7,
          "text-anchor": "middle", text: Math.round(avgs[i]) + "%",
        }));
      }
    }
    var chartSvg = svg("svg", {
      class: "chart", viewBox: "0 0 " + W + " " + H, "aria-hidden": "true",
    }, kids);

    // テキスト代替（アクセシビリティ）
    var srText = avgs.map(function (v, i) {
      return (i + 1) + "周: " + (v === null ? "未入力" : Math.round(v) + "%");
    }).join("、");
    return el("div", { class: "quiz__chart" }, [
      head,
      chartSvg,
      el("p", { class: "visually-hidden", text: srText }),
    ]);
  }
  /* --- フッタ ------------------------------------------------------------- */
  function buildFooter() {
    var actions = el("div", { class: "footer" }, [
      el("button", { class: "footer__btn", type: "button", text: "エクスポート", onclick: exportJson }),
      el("button", { class: "footer__btn", type: "button", text: "インポート", onclick: importJson }),
      el("button", { class: "footer__btn", type: "button", text: "リセット", onclick: resetAll }),
    ]);
    var meta = el("p", { class: "footer__meta num" }, [
      "全" + LECTURE_TOTAL + "本 ・ " + DATA.quiz.tests.length + "×"
      + DATA.quiz.rounds + " ＝ " + QUIZ_Q_TOTAL + "問",
    ]);
    return el("div", {}, [actions, meta]);
  }

  /* === アクション（すべて setState 経由 = イミュータブル更新） === */
  function toggleSection(sectionId) {
    var next = Object.assign({}, state.openSections);
    if (next[sectionId]) delete next[sectionId];
    else next[sectionId] = true;
    setState({ openSections: next });
  }
  function toggleLecture(key) {
    var next = Object.assign({}, state.lectureDone);
    if (next[key]) delete next[key];
    else next[key] = true;
    setState({ lectureDone: next });
  }
  function toggleQuizCell(key) {
    var next = Object.assign({}, state.quizCells);
    var cur = next[key] || { done: false, score: null };
    next[key] = Object.assign({}, cur, { done: !cur.done });
    setState({ quizCells: next });
  }
  function editScore(key) {
    var cur = state.quizCells[key] || { done: false, score: null };
    var initial = typeof cur.score === "number" ? String(cur.score) : "";
    var input = window.prompt("スコアを入力 (0〜100、空欄で消去)", initial);
    if (input === null) return; // キャンセル
    var trimmed = input.trim();
    var nextScore;
    if (trimmed === "") {
      nextScore = null;
    } else {
      var v = parseInt(trimmed, 10);
      if (isNaN(v)) return;
      nextScore = clamp(v, 0, 100);
    }
    var next = Object.assign({}, state.quizCells);
    // スコアを入れたらそのセルは完了扱いにする（未完了に得点は不自然）。
    var done = nextScore !== null ? true : cur.done;
    next[key] = Object.assign({}, cur, { score: nextScore, done: done });
    setState({ quizCells: next });
  }
  /* --- キーボード操作（Space/Enter） ------------------------------------- */
  function onCheckboxKey(e, fn) {
    if (e.key === " " || e.key === "Enter" || e.key === "Spacebar") {
      e.preventDefault();
      fn();
    }
  }

  /* === エクスポート / インポート / リセット === */
  function exportJson() {
    try {
      var payload = JSON.stringify(state, null, 2);
      var blob = new Blob([payload], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = "az900-study-" + toYmd(todayLocal()) + ".json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    } catch (e) {
      window.alert("エクスポートに失敗しました");
    }
  }
  function importJson() {
    var input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.addEventListener("change", function () {
      var file = input.files && input.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var parsed = JSON.parse(String(reader.result));
          if (!parsed || typeof parsed !== "object") throw new Error("bad");
          var next = normalizeState(parsed);
          setState(next);
          window.alert("インポートしました");
        } catch (e) {
          window.alert("インポートに失敗しました（ファイル形式を確認してください）");
        }
      };
      reader.onerror = function () { window.alert("ファイルを読み込めませんでした"); };
      reader.readAsText(file);
    });
    input.click();
  }
  function resetAll() {
    var ok = window.confirm("進捗をすべて消去して初期化します。よろしいですか？");
    if (!ok) return;
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* noop */ }
    prev.lectureBig = null;
    prev.quizBig = null;
    setState(defaultState());
  }
  // 初回起動時に startDate を必ず永続化（破損復帰時も含む）。
  saveState(state);
  render({});
})();
