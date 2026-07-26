# 問題集 — AZ-900 演習アプリ

Udemy模擬試験で間違えた問題を、選択肢をタップして解き直すためのアプリ。
ビルド不要の純静的サイトで、`index.html` を開くだけで動きます。

## 使い方

- **開き方（推奨）**: ルートの `アプリを起動.command` などでローカルサーバを立てるか、
  `python3 -m http.server 8973` をリポジトリルートで実行し
  `http://localhost:8973/問題集/` を開く
- `index.html` をダブルクリック（file://）でも動きますが、**進捗（localStorage）は
  file:// と http://localhost で別々に保存される**ため、開き方はどちらかに統一してください
- 出題数（10問/全問など）と出題順（収録順/シャッフル）を選んで開始
- 選択肢をタップ → 即時に正誤判定 → 「解説」（元の解説）と「やさしい解説」
  （知識ゼロ向け＋誤答選択肢ごとの理由）を表示
- 途中でやめても自動保存。トップの「続きから」で再開
- 間違えた問題は自動で復習リストに入り、「間違いN問を復習」で解き直し（正解すると外れる）

## 問題セットの追加方法（問題集1・3などを増やすとき）

1. `data/set4.js` をコピーして `data/setN.js` を作り、問題データを書き換える
   （`set: { id: "setN", title: "問題集N", order: N }`）
2. `index.html` の `<script defer src="data/set4.js"></script>` の下に
   `<script defer src="data/setN.js"></script>` を1行追記する

70問など大きいセットで1ファイル800行を超える場合は `setN-a.js` / `setN-b.js` に
分割してそれぞれ register してください（同じ set.id なら自動でマージされます）。

## 構成

- `data/registry.js` — セット登録レジストリ（データより先に読み込む）
- `data/set1.js`〜`set5.js` — 問題集1〜5（計121問。複数選択問題は `type: "multi"` + `answerIndices`）
- `assets/` — アプリ本体（dom/store/engine/views/app + quiz.css）
- 進捗の保存先: localStorage キー `az900-quiz-v1`（学習ダッシュボードとは独立）
