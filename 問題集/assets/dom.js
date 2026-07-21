/* ===========================================================================
   AZ-900 問題集 — assets/dom.js
   DOM構築ヘルパと純粋ユーティリティ。他の全モジュールはここの el()/shuffle() を使う。
   DOM APIにのみ依存し、state やロジックは一切持たない。
   =========================================================================== */
(function () {
  "use strict";

  // 手動DOM構築ヘルパ（innerHTMLは使わない）。app.js の el() と同じパターン。
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    applyAttrs(node, attrs);
    appendChildren(node, children);
    return node;
  }

  function applyAttrs(node, attrs) {
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
      if (k in node && k !== "list") {
        try { node[k] = v; return; } catch (e) { /* フォールスルーして属性で設定 */ }
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

  // Fisher–Yates シャッフル。引数配列は変更せず新しい配列を返す（イミュータブル）。
  function shuffle(arr) {
    var out = arr.slice();
    for (var i = out.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out;
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  window.QuizDom = { el: el, shuffle: shuffle, clamp: clamp };
})();
