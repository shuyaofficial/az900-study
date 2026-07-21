/* ===========================================================================
   AZ-900 問題集 — assets/views.js
   4画面（home/setup/quiz/result）のDOM構築のみを担当する。
   状態の保持・更新はしない。受け取った vm（データ＋コールバック関数）から
   el() で手動DOM構築するだけの純粋なビルダー群。
   依存: window.QuizDom（el）。
   =========================================================================== */
(function () {
  "use strict";

  var el = window.QuizDom.el;

  var TYPE_LABELS = { yesno: "はい/いいえ", single: "単一選択", completion: "穴埋め", multi: "複数選択" };

  /* --- home ------------------------------------------------------------------ */
  function buildHome(vm) {
    var header = el("header", { class: "qz-header" }, [
      el("h1", { class: "qz-header__title", text: "問題集" }),
      el("p", { class: "qz-header__caption", text: "AZ-900 演習" }),
    ]);
    var body = vm.items.length === 0
      ? el("div", { class: "qz-empty" }, [el("p", { text: "問題セットがありません" })])
      : el("div", { class: "qz-set-list" }, vm.items.map(function (item) {
        return buildSetCard(item, vm);
      }));
    return el("div", { class: "qz-page" }, [header, body]);
  }

  function buildSetCard(item, vm) {
    var children = [
      el("h2", { class: "qz-set-card__title", text: item.title }),
      el("p", {
        class: "qz-set-card__meta num",
        text: item.totalCount + "問 ・ " + item.attemptedCount + "/" + item.totalCount + "問 挑戦済み",
      }),
    ];
    if (item.sessionActive) {
      children.push(el("button", {
        class: "qz-btn qz-btn--primary qz-btn--block", type: "button",
        text: "続きから（" + item.sessionLabel + "）",
        onclick: function () { vm.onContinue(item.id); },
      }));
      children.push(el("button", {
        class: "qz-btn qz-btn--ghost qz-btn--block", type: "button",
        text: "設定を変えて最初から",
        onclick: function () { vm.onSetupAgain(item.id); },
      }));
    } else {
      children.push(el("button", {
        class: "qz-btn qz-btn--primary qz-btn--block", type: "button",
        text: "はじめる",
        onclick: function () { vm.onStart(item.id); },
      }));
    }
    if (item.reviewActive) {
      children.push(el("button", {
        class: "qz-btn qz-btn--outline qz-btn--block", type: "button",
        text: "復習の続きから（" + item.reviewLabel + "）",
        onclick: function () { vm.onContinueReview(item.id); },
      }));
    } else if (item.wrongCount > 0) {
      children.push(el("button", {
        class: "qz-btn qz-btn--outline qz-btn--block", type: "button",
        text: "間違い" + item.wrongCount + "問を復習",
        onclick: function () { vm.onReview(item.id); },
      }));
    }
    return el("section", { class: "qz-card qz-set-card" }, children);
  }

  /* --- setup ------------------------------------------------------------------ */
  function buildSetup(vm) {
    var back = el("button", { class: "qz-back", type: "button", text: "← 戻る", onclick: vm.onBack });
    var title = el("h1", { class: "qz-page__title", text: vm.title });
    var batchGroup = buildPillGroup("出題数", "出題数を選択", vm.batchOptions.map(function (o) {
      return { value: o.value, label: o.label, selected: o.value === vm.selectedBatch };
    }), function (v) { vm.onSelectBatch(Number(v)); });
    var orderOptions = [
      { value: "sequential", label: "収録順", selected: vm.selectedOrder === "sequential" },
      { value: "shuffle", label: "シャッフル", selected: vm.selectedOrder === "shuffle" },
    ];
    var orderGroup = buildPillGroup("出題順", "出題順を選択", orderOptions, vm.onSelectOrder);
    var children = [batchGroup, orderGroup];
    if (vm.sessionActive) {
      children.push(el("p", {
        class: "qz-setup__note",
        text: "開始すると進行中のデータ（" + vm.sessionLabel + "）は消え、成績と間違いリストは残ります",
      }));
    }
    children.push(el("button", {
      class: "qz-btn qz-btn--primary qz-btn--block", type: "button", text: "開始", onclick: vm.onStart,
    }));
    var card = el("section", { class: "qz-card qz-setup" }, children);
    return el("div", { class: "qz-page" }, [back, title, card]);
  }

  function buildPillGroup(label, ariaLabel, options, onSelect) {
    var pills = options.map(function (o) {
      return el("button", {
        class: "qz-pill", type: "button",
        "aria-pressed": o.selected ? "true" : "false",
        dataset: { selected: o.selected ? "true" : "false" },
        text: o.label,
        onclick: function () { onSelect(o.value); },
      });
    });
    return el("div", { class: "qz-setup__group" }, [
      el("h2", { class: "qz-setup__label", text: label }),
      el("div", { class: "qz-pills", role: "group", "aria-label": ariaLabel }, pills),
    ]);
  }

  /* --- quiz ------------------------------------------------------------------- */
  function buildQuiz(vm) {
    var head = el("div", { class: "qz-quiz-head" }, [
      el("span", { class: "qz-quiz-head__title", text: vm.setTitle }),
      el("button", { class: "qz-exit-btn", type: "button", text: "トップへ", onclick: vm.onExit }),
    ]);
    var children = [head, buildProgressRow(vm), buildQuestionCard(vm)];
    if (vm.phase === "revealed") {
      children.push(buildExplainCard(vm));
      if (vm.hasBeginner) children.push(buildBeginnerCard(vm));
      children.push(el("button", {
        class: "qz-btn qz-btn--primary qz-btn--block", type: "button",
        dataset: { role: "next" },
        text: vm.isLastOfBatch ? "結果を見る" : "次へ",
        onclick: vm.onNext,
      }));
    }
    return el("div", { class: "qz-page" }, children);
  }

  function buildProgressRow(vm) {
    var pct = Math.round(vm.progressRatio * 100);
    var label = vm.blockLabel + "・" + vm.progressCurrent + "/" + vm.progressTotal + "問";
    return el("div", { class: "qz-progress-row" }, [
      el("span", { class: "qz-progress-label num", text: label }),
      el("div", { class: "qz-progress-bar" }, [
        el("div", { class: "qz-progress-bar__fill", style: "width:" + pct + "%" }),
      ]),
    ]);
  }

  function buildQuestionCard(vm) {
    var q = vm.question;
    var meta = el("div", { class: "qz-question__meta" }, [
      el("span", { class: "qz-question__domain", text: q.domain || "" }),
      el("span", { class: "qz-question__no num", text: "問" + q.no }),
      el("span", { class: "qz-type-badge", text: TYPE_LABELS[q.type] || q.type }),
    ]);
    var stem = el("p", { class: "qz-question__stem", text: q.stem });
    var choices = el("div", { class: "qz-choices" }, q.choices.map(function (choiceText, i) {
      return buildChoiceButton(vm, choiceText, i);
    }));
    var children = [meta, stem, choices];
    if (vm.isMulti && vm.phase === "answering") children.push(buildMultiConfirmButton(vm));
    return el("section", { class: "qz-card qz-question" }, children);
  }

  // 「回答する（n/N個選択）」ボタン。選択数が必要数と一致するまで disabled。
  function buildMultiConfirmButton(vm) {
    var label = "回答する（" + vm.selectedIndices.length + "/" + vm.requiredCount + "個選択）";
    return el("button", {
      class: "qz-btn qz-btn--primary qz-btn--block num", type: "button",
      disabled: !vm.canConfirm, text: label, onclick: vm.onConfirm,
    });
  }

  function buildChoiceButton(vm, choiceText, index) {
    return vm.isMulti ? buildMultiChoiceButton(vm, choiceText, index) : buildSingleChoiceButton(vm, choiceText, index);
  }

  function buildSingleChoiceButton(vm, choiceText, index) {
    var revealed = vm.phase === "revealed";
    var isCorrect = index === vm.correctIndex;
    var isSelected = index === vm.selectedIndex;
    var cls = "qz-choice";
    var status = null;
    if (revealed) {
      if (isCorrect) { cls += " qz-choice--correct"; status = "正解"; }
      else if (isSelected) { cls += " qz-choice--wrong"; status = "不正解"; }
      else { cls += " qz-choice--dim"; }
    }
    var children = [el("span", { class: "qz-choice__text", text: choiceText })];
    if (status) {
      children.unshift(el("span", {
        class: "qz-choice__icon", "aria-hidden": "true", text: isCorrect ? "✓" : "✕",
      }));
      children.push(el("span", { class: "qz-choice__status", text: status }));
    }
    return el("button", {
      class: cls, type: "button", disabled: revealed,
      onclick: function () { vm.onSelect(index); },
    }, children);
  }

  // 複数選択の選択肢ボタン。トグル式（disabledになるまで何度でも選び直せる）。
  function buildMultiChoiceButton(vm, choiceText, index) {
    var revealed = vm.phase === "revealed";
    var isCorrect = vm.correctIndices.indexOf(index) !== -1;
    var isSelected = vm.selectedIndices.indexOf(index) !== -1;
    var cls = "qz-choice";
    var status = null;
    var icon = isSelected ? "✓" : null;
    if (revealed) {
      if (isCorrect && isSelected) { cls += " qz-choice--correct"; status = "正解"; icon = "✓"; }
      else if (isCorrect) { cls += " qz-choice--correct"; status = "正解（未選択）"; icon = "✓"; }
      else if (isSelected) { cls += " qz-choice--wrong"; status = "不正解"; icon = "✕"; }
      else { cls += " qz-choice--dim"; icon = null; }
    } else if (isSelected) {
      cls += " qz-choice--selected";
    }
    var children = [el("span", { class: "qz-choice__text", text: choiceText })];
    if (icon) children.unshift(el("span", { class: "qz-choice__icon", "aria-hidden": "true", text: icon }));
    if (status) children.push(el("span", { class: "qz-choice__status", text: status }));
    return el("button", {
      class: cls, type: "button", disabled: revealed,
      "aria-pressed": isSelected ? "true" : "false",
      onclick: function () { vm.onToggle(index); },
    }, children);
  }

  function buildExplainCard(vm) {
    return el("section", { class: "qz-card qz-explain" }, [
      el("h3", { class: "qz-explain__head", text: "解説" }),
      el("p", { class: "qz-explain__body", text: vm.explanation || "" }),
    ]);
  }

  function buildBeginnerCard(vm) {
    var children = [
      el("h3", { class: "qz-beginner__head", text: "やさしい解説" }),
      el("p", { class: "qz-beginner__lead", text: vm.beginnerLead }),
    ];
    if (vm.beginnerWrongList.length > 0) {
      children.push(el("ul", { class: "qz-beginner__list" }, vm.beginnerWrongList.map(function (item) {
        return el("li", { class: "qz-beginner__item" }, [
          el("span", { class: "qz-beginner__row" }, [
            el("span", { class: "qz-beginner__mark", "aria-hidden": "true", text: "✕" }),
            el("span", { class: "qz-beginner__choice", text: item.text }),
          ]),
          el("p", { class: "qz-beginner__reason", text: item.reason }),
        ]);
      })));
    }
    return el("section", { class: "qz-card qz-beginner" }, children);
  }

  /* --- result ------------------------------------------------------------------ */
  function buildResult(vm) {
    var title = el("h1", { class: "qz-page__title", text: vm.setTitle });
    var children = [title, buildScoreHero(vm.score)];
    if (vm.isSetComplete && vm.overall) {
      children.push(el("section", { class: "qz-card qz-complete" }, [
        el("h2", { class: "qz-complete__head", text: "セット完了 🎉" }),
        el("p", {
          class: "qz-complete__body num",
          text: "全体成績: " + vm.overall.correct + "/" + vm.overall.total + "（" + vm.overall.pct + "%）",
        }),
      ]));
    }
    if (vm.isReviewResult && vm.reviewInfo) {
      children.push(el("section", { class: "qz-card qz-review-summary" }, [
        el("p", {
          class: "qz-review-summary__body num",
          text: vm.reviewInfo.total + "問中" + vm.reviewInfo.cleared + "問クリア、残り" + vm.reviewInfo.remaining + "問",
        }),
      ]));
    }
    if (vm.wrongList.length > 0) children.push(buildWrongListCard(vm.wrongList));
    children.push(buildResultActions(vm));
    return el("div", { class: "qz-page" }, children);
  }

  function buildScoreHero(score) {
    return el("section", { class: "qz-card qz-result-hero" }, [
      el("p", { class: "qz-result-hero__label", text: "今回のスコア" }),
      el("p", { class: "qz-result-hero__score num" }, [
        String(score.correct),
        el("span", { class: "qz-result-hero__slash", text: "/" }),
        String(score.total),
      ]),
      el("p", { class: "qz-result-hero__pct num", text: "正答率 " + score.pct + "%" }),
    ]);
  }

  function buildWrongListCard(list) {
    var items = list.map(function (w) {
      return el("li", { class: "qz-wrong-list__item" }, [
        el("span", { class: "qz-wrong-list__no num", text: "問" + w.no }),
        el("span", { class: "qz-wrong-list__preview", text: w.preview }),
      ]);
    });
    return el("section", { class: "qz-card qz-wrong-list" }, [
      el("h3", { class: "qz-wrong-list__head", text: "間違えた問題" }),
      el("ul", { class: "qz-wrong-list__ul" }, items),
    ]);
  }

  function buildResultActions(vm) {
    var buttons = [];
    if (vm.hasNextBatch) {
      buttons.push(el("button", {
        class: "qz-btn qz-btn--primary qz-btn--block", type: "button",
        text: "次の" + vm.nextBatchCount + "問へ", onclick: vm.onNextBatch,
      }));
    }
    if (vm.hasBatchWrong) {
      buttons.push(el("button", {
        class: "qz-btn qz-btn--outline qz-btn--block", type: "button",
        text: "このバッチの間違いを解き直す", onclick: vm.onRetryBatch,
      }));
    }
    if (vm.hasWrongPool) {
      buttons.push(el("button", {
        class: "qz-btn qz-btn--outline qz-btn--block", type: "button",
        text: "間違いをまとめて復習（" + vm.wrongPoolCount + "問）", onclick: vm.onReviewAll,
      }));
    }
    if (vm.isReviewResult && vm.reviewInfo && vm.reviewInfo.remaining > 0) {
      buttons.push(el("button", {
        class: "qz-btn qz-btn--outline qz-btn--block", type: "button",
        text: "もう一度復習", onclick: vm.onReviewAgain,
      }));
    }
    buttons.push(el("button", {
      class: "qz-btn qz-btn--ghost qz-btn--block", type: "button", text: "トップへ", onclick: vm.onHome,
    }));
    return el("div", { class: "qz-result-actions" }, buttons);
  }

  window.QuizViews = {
    buildHome: buildHome,
    buildSetup: buildSetup,
    buildQuiz: buildQuiz,
    buildResult: buildResult,
  };
})();
