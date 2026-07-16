/* ===========================================================================
   AZ-900 合格ダッシュボード — calendar.js
   期限管理カレンダー（③ タブ）。計画(deadline)/予測(pace)の2モードで
   月表示バッジを描画する。非module IIFE。state は持たない（表示は app.js の
   state から ctx 経由で受け取る。mode/monthOffset のみこのモジュールの
   セッション内変数として保持し、リロードで初期化される＝正しい挙動）。
   依存: なし（app.js が el() 等を ctx で渡す自己完結モジュール）。
   公開: window.AZ900_CALENDAR = { build, project }
   =========================================================================== */
(function () {
  "use strict";

  var MS_PER_DAY = 86400000;
  var FAR_DAYS = 366;      // これを超える所要日数は「予測不能」扱い
  var DAYS_WARN = 3;       // app.js の DAYS_WARN と同じ基準（締切の緊急度）

  // 表示モードと表示月。state には入れない = リロードで既定に戻る。
  var mode = "plan";        // "plan" | "forecast"
  var monthOffset = 0;      // 今月からのオフセット（整数）

  /* --- 日付ヘルパ（app.js と同一実装のローカルコピー。前例: sync.js の el()） --- */
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
  function addDays(date, n) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);
  }

  /* --- 予測（純粋関数） ----------------------------------------------------
     将来の拡張案: 日別の進捗スナップショットを履歴として保持できれば、
     全期間平均ではなく直近の実ペースで予測精度を上げられる（未実装）。 */
  function project(opts) {
    var total = opts.total;
    var done = opts.done;
    var remaining = total - done;
    if (remaining <= 0) return { kind: "done" };
    if (done === 0) return { kind: "none" };
    var today = todayLocal();
    var start = parseDate(opts.startYmd);
    var elapsedDays = Math.max(1, diffDays(today, start) + 1); // 初日を1日と数える
    var rate = done / elapsedDays;
    var daysNeeded = Math.ceil(remaining / rate);
    if (daysNeeded > FAR_DAYS) return { kind: "far" };
    var projected = addDays(today, daysNeeded);
    var ymd = toYmd(projected);
    var deadlineYmd = opts.deadlineYmd;
    if (!deadlineYmd) {
      return { kind: "date", ymd: ymd, lateDays: null, onTime: true };
    }
    var lateDays = diffDays(projected, parseDate(deadlineYmd));
    return { kind: "date", ymd: ymd, lateDays: lateDays, onTime: lateDays <= 0 };
  }

  function urgencyKind(d) {
    if (d > DAYS_WARN) return "normal";
    if (d >= 1) return "warn";
    return "danger";
  }

  /* --- 小部品 --------------------------------------------------------------- */
  function dot(ctx, kind) {
    return ctx.el("span", { class: "cal__dot cal__dot--" + kind, "aria-hidden": "true" });
  }
  function summaryRow(ctx, kind, text) {
    return ctx.el("div", { class: "cal__summary-row" }, [
      dot(ctx, kind),
      ctx.el("span", { class: "cal__summary-label", text: text }),
    ]);
  }
  function dateFieldLabel(track) {
    if (track === "lecture") return "① 講座の締切日を編集";
    if (track === "quiz") return "② 問題集の締切日を編集";
    return "試験日を編集";
  }
  // 日付の表示＋透明 date input を重ねた編集可能フィールド（hero チップと同じ流儀）。
  function dateEditField(ctx, track, ymd) {
    var el = ctx.el;
    var input = el("input", {
      type: "date", class: "chip__input",
      "aria-label": dateFieldLabel(track), value: ymd || "",
    });
    input.addEventListener("click", function () {
      try { input.showPicker && input.showPicker(); } catch (e) { /* 未対応ブラウザは無視 */ }
    });
    input.addEventListener("change", function () { ctx.setDeadline(track, input.value); });
    var label = el("b", {
      class: "num cal__date" + (ymd ? "" : " cal__date--unset"),
      text: ymd ? ctx.fmtMonthDay(ymd) : "未設定",
    });
    return el("span", { class: "cal__date-edit" }, [label, input]);
  }

  /* --- モード切替 ------------------------------------------------------------ */
  function buildModeToggle(ctx) {
    return ctx.el("div", { class: "cal__mode", role: "group", "aria-label": "表示モード" }, [
      modeButton(ctx, "plan", "計画"),
      modeButton(ctx, "forecast", "予測"),
    ]);
  }
  function modeButton(ctx, key, label) {
    var selected = mode === key;
    return ctx.el("button", {
      class: "cal__mode-btn" + (selected ? " is-selected" : ""),
      type: "button", "aria-pressed": selected ? "true" : "false",
      onclick: function () {
        if (mode !== key) { mode = key; ctx.requestRender(); }
      },
      text: label,
    });
  }

  /* --- サマリー行 ------------------------------------------------------------ */
  function buildSummaries(ctx) {
    return ctx.el("div", { class: "cal__summaries" }, [
      buildTrackSummary(ctx, "lecture", "①", ctx.counts.lectureDone, ctx.counts.lectureTotal),
      buildTrackSummary(ctx, "quiz", "②", ctx.counts.quizDone, ctx.counts.quizTotal),
      buildExamSummary(ctx),
    ]);
  }
  function buildTrackSummary(ctx, track, mark, done, total) {
    var ymd = ctx.effectiveDeadline(track);
    if (mode === "plan") return buildPlanRow(ctx, track, mark, "締切", ymd);
    return buildForecastRow(ctx, track, mark, ymd, done, total);
  }
  function buildExamSummary(ctx) {
    var ymd = ctx.effectiveDeadline("exam");
    if (!ymd) {
      return ctx.el("div", { class: "cal__summary-row" }, [
        dot(ctx, "normal"),
        ctx.el("span", { class: "cal__summary-label", text: "試験日 " }),
        dateEditField(ctx, "exam", null),
      ]);
    }
    return buildPlanRow(ctx, "exam", "試験", "", ymd);
  }
  // 「①/② 締切 7月14日 ・ あとN日」「試験 8月10日 ・ あとN日」等の共通行。
  function buildPlanRow(ctx, track, mark, noun, ymd) {
    var el = ctx.el;
    var d = diffDays(parseDate(ymd), todayLocal());
    var kind = urgencyKind(d);
    var tail = d > 0 ? "あと" + d + "日" : (d === 0 ? "今日" : Math.abs(d) + "日超過");
    var labelText = noun ? mark + " " + noun + " " : mark + " ";
    return el("div", { class: "cal__summary-row" }, [
      dot(ctx, kind),
      el("span", { class: "cal__summary-label", text: labelText }),
      dateEditField(ctx, track, ymd),
      el("span", { class: "cal__summary-tail num", text: " ・ " + tail }),
    ]);
  }
  function buildForecastRow(ctx, track, mark, ymd, done, total) {
    var el = ctx.el;
    var result = project({
      done: done, total: total, startYmd: ctx.state.startDate, deadlineYmd: ymd,
    });
    if (result.kind === "none") return summaryRow(ctx, "normal", mark + " 実績がまだありません");
    if (result.kind === "far") return summaryRow(ctx, "warn", mark + " 完了まで1年以上");
    if (result.kind === "done") return summaryRow(ctx, "success", mark + " 完了");
    var kind = result.onTime ? "success" : "danger";
    var children = [
      dot(ctx, kind),
      el("span", { class: "cal__summary-label", text: mark + " " }),
      el("b", { class: "num cal__date", text: ctx.fmtMonthDay(result.ymd) }),
      el("span", { class: "cal__summary-label", text: " ごろ完了" }),
    ];
    if (result.lateDays != null) {
      var tail = result.onTime ? "締切に間に合う見込み" : "締切" + result.lateDays + "日超過";
      children.push(el("span", { class: "cal__summary-tail num", text: " ・ " + tail }));
    }
    return el("div", { class: "cal__summary-row" }, children);
  }

  /* --- 月見出し ------------------------------------------------------------- */
  function shownMonth() {
    var base = todayLocal();
    return new Date(base.getFullYear(), base.getMonth() + monthOffset, 1);
  }
  function buildMonthHead(ctx) {
    var el = ctx.el;
    var shown = shownMonth();
    var label = shown.getFullYear() + "年" + (shown.getMonth() + 1) + "月";
    var children = [
      navBtn(ctx, "‹", "前の月へ", function () { monthOffset -= 1; ctx.requestRender(); }),
      el("span", { class: "cal__month-label num", text: label }),
      navBtn(ctx, "›", "次の月へ", function () { monthOffset += 1; ctx.requestRender(); }),
    ];
    if (monthOffset !== 0) {
      children.push(el("button", {
        class: "cal__today-btn", type: "button", text: "今日",
        onclick: function () { monthOffset = 0; ctx.requestRender(); },
      }));
    }
    return el("div", { class: "cal__month-head" }, children);
  }
  function navBtn(ctx, glyph, label, fn) {
    return ctx.el("button", {
      class: "cal__nav-btn", type: "button", "aria-label": label,
      onclick: fn, text: glyph,
    });
  }

  /* --- 曜日行 --------------------------------------------------------------- */
  function buildWeekdayRow(ctx) {
    var el = ctx.el;
    var names = ["日", "月", "火", "水", "木", "金", "土"];
    return el("div", { class: "cal__weekdays", "aria-hidden": "true" },
      names.map(function (n) { return el("span", { class: "cal__weekday", text: n }); })
    );
  }

  /* --- 月グリッド ------------------------------------------------------------ */
  // その日に立つバッジ一覧を { "YYYY-MM-DD": [mark, ...] } で返す。
  function computeMarks(ctx) {
    var marks = {};
    function addMark(ymd, mark) {
      if (!ymd) return;
      if (!marks[ymd]) marks[ymd] = [];
      marks[ymd].push(mark);
    }
    if (mode === "plan") {
      addMark(ctx.effectiveDeadline("lecture"), { glyph: "①", type: "deadline" });
      addMark(ctx.effectiveDeadline("quiz"), { glyph: "②", type: "deadline" });
    } else {
      addForecastMarks(ctx, "lecture", "①", ctx.counts.lectureDone, ctx.counts.lectureTotal, addMark);
      addForecastMarks(ctx, "quiz", "②", ctx.counts.quizDone, ctx.counts.quizTotal, addMark);
    }
    addMark(ctx.effectiveDeadline("exam"), { glyph: "試", type: "exam" });
    return marks;
  }
  function addForecastMarks(ctx, track, glyph, done, total, addMark) {
    var deadlineYmd = ctx.effectiveDeadline(track);
    var result = project({
      done: done, total: total, startYmd: ctx.state.startDate, deadlineYmd: deadlineYmd,
    });
    var projYmd = result.kind === "date" ? result.ymd : null;
    if (projYmd) {
      addMark(projYmd, { glyph: glyph, type: result.onTime ? "proj-ok" : "proj-late" });
    }
    // 予測と期限が同日なら塗りバッジのみ表示（薄い枠バッジは重ねない）。
    if (deadlineYmd && deadlineYmd !== projYmd) {
      addMark(deadlineYmd, { glyph: glyph, type: "ghost" });
    }
  }
  function buildGrid(ctx) {
    var el = ctx.el;
    var shown = shownMonth();
    var year = shown.getFullYear();
    var month = shown.getMonth();
    var firstWeekday = new Date(year, month, 1).getDay();
    var daysInMonth = new Date(year, month + 1, 0).getDate();
    var todayYmd = toYmd(todayLocal());
    var marks = computeMarks(ctx);
    var cells = [];
    for (var i = 0; i < firstWeekday; i++) {
      cells.push(el("div", { class: "cal__cell cal__cell--empty" }));
    }
    for (var day = 1; day <= daysInMonth; day++) {
      var ymd = toYmd(new Date(year, month, day));
      cells.push(buildDayCell(ctx, day, ymd === todayYmd, marks[ymd] || []));
    }
    return el("div", { class: "cal__grid", "aria-hidden": "true" }, cells);
  }
  function buildDayCell(ctx, day, isToday, dayMarks) {
    var el = ctx.el;
    var numNode = el("span", {
      class: "cal__daynum num" + (isToday ? " cal__daynum--today" : ""),
      text: String(day),
    });
    var children = [numNode];
    if (dayMarks.length > 0) {
      children.push(el("div", { class: "cal__badges" }, dayMarks.map(function (m) {
        return el("span", { class: "cal__badge cal__badge--" + m.type, text: m.glyph });
      })));
    }
    return el("div", { class: "cal__cell" }, children);
  }

  /* --- スクリーンリーダー向けテキスト要約（buildScoreChart と同じ前例） -------- */
  function buildSrSummary(ctx) {
    var lines = [
      srLine(ctx, "lecture", "① 講座", ctx.counts.lectureDone, ctx.counts.lectureTotal),
      srLine(ctx, "quiz", "② 問題集", ctx.counts.quizDone, ctx.counts.quizTotal),
    ];
    var examYmd = ctx.effectiveDeadline("exam");
    lines.push(examYmd ? "試験日: " + ctx.fmtMonthDay(examYmd) : "試験日: 未設定");
    return ctx.el("p", { class: "visually-hidden", text: lines.join("。") });
  }
  function srLine(ctx, track, label, done, total) {
    var ymd = ctx.effectiveDeadline(track);
    if (mode === "plan") {
      return label + " 締切: " + (ymd ? ctx.fmtMonthDay(ymd) : "未設定");
    }
    var result = project({ done: done, total: total, startYmd: ctx.state.startDate, deadlineYmd: ymd });
    if (result.kind === "none") return label + " 予測: 実績なし";
    if (result.kind === "far") return label + " 予測: 完了まで1年以上";
    if (result.kind === "done") return label + " 予測: 完了";
    return label + " 予測完了日: " + ctx.fmtMonthDay(result.ymd)
      + (result.onTime ? "（締切に間に合う見込み）" : "（締切超過見込み）");
  }

  /* --- 組み立て --------------------------------------------------------------- */
  function build(ctx) {
    return ctx.el("section", { class: "card cal" }, [
      buildModeToggle(ctx),
      buildSummaries(ctx),
      buildMonthHead(ctx),
      buildWeekdayRow(ctx),
      buildGrid(ctx),
      buildSrSummary(ctx),
    ]);
  }

  window.AZ900_CALENDAR = { build: build, project: project };
})();
