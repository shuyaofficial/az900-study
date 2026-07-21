/* ===========================================================================
   AZ-900 問題集 — data/registry.js
   問題セットの登録レジストリ。全データファイル（data/setN.js）より先に読み込む。
   file:// でも動くよう fetch は使わず <script defer> のグローバル連携で構成する。

   セット追加の手順:
     1. data/setN.js を置く（window.QUIZ_REGISTRY.register({ set, questions }) を呼ぶ）
     2. index.html の <script defer> に1行追記（registry.js より後、assets/*.js より前）

   同一 set.id で register() を複数回呼ぶと questions が追記マージされる。
   1ファイル800行を超える大きなセットは setN-a.js / setN-b.js に分割して両方 register する。
   進行中セッションに後から追加した問題は含まれず、次のセッション開始から出題対象になる。
   =========================================================================== */
window.QUIZ_REGISTRY = (function () {
  "use strict";

  var sets = {}; // id -> { id, title, order, questions: [] }

  function warn(msg, extra) {
    if (window.console && console.warn) console.warn("[QUIZ_REGISTRY] " + msg, extra || "");
  }

  // 壊れた問題データは登録せず警告に留め、アプリ全体は動作継続させる
  function isValidQuestion(entry, q) {
    if (!q || typeof q !== "object") { warn("question がオブジェクトではありません"); return false; }
    if (typeof q.id !== "string" || !q.id) { warn("id がありません", q); return false; }
    for (var i = 0; i < entry.questions.length; i++) {
      if (entry.questions[i].id === q.id) { warn("id 重複: " + q.id); return false; }
    }
    if (typeof q.stem !== "string" || !q.stem) { warn("stem がありません: " + q.id); return false; }
    if (!Array.isArray(q.choices) || q.choices.length < 2) { warn("choices が不正: " + q.id); return false; }
    if (typeof q.answerIndex !== "number" || q.answerIndex < 0 || q.answerIndex >= q.choices.length) {
      warn("answerIndex が範囲外: " + q.id); return false;
    }
    if (q.beginner && Array.isArray(q.beginner.wrong) && q.beginner.wrong.length !== q.choices.length) {
      warn("beginner.wrong の長さが choices と不一致: " + q.id); // 表示は劣化するだけなので登録は許可
    }
    return true;
  }

  function register(payload) {
    if (!payload || !payload.set || typeof payload.set.id !== "string" || !payload.set.id) {
      warn("register: set.id がありません");
      return;
    }
    var meta = payload.set;
    var entry = sets[meta.id];
    if (!entry) {
      entry = {
        id: meta.id,
        title: typeof meta.title === "string" ? meta.title : meta.id,
        order: typeof meta.order === "number" ? meta.order : 999,
        questions: [],
      };
      sets[meta.id] = entry;
    }
    var qs = Array.isArray(payload.questions) ? payload.questions : [];
    for (var i = 0; i < qs.length; i++) {
      if (isValidQuestion(entry, qs[i])) entry.questions.push(qs[i]);
    }
  }

  function getSets() {
    var list = [];
    for (var id in sets) {
      if (Object.prototype.hasOwnProperty.call(sets, id)) list.push(sets[id]);
    }
    list.sort(function (a, b) { return a.order - b.order; });
    return list;
  }

  function getSet(id) {
    return sets[id] || null;
  }

  return { register: register, getSets: getSets, getSet: getSet };
})();
