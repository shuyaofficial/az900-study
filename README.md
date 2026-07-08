# AZ-900 合格ダッシュボード

Microsoft Azure Fundamentals（AZ-900）合格に向けた、2教材の進捗を「残り」で可視化する学習管理アプリ。
外部依存ゼロの単一静的サイト（ビルド不要・オフライン動作・進捗は端末の localStorage に保存）。

- **① 講座**（動画：12セクション / 95レクチャー / 約4時間56分）をチェックで消し込み
- **② 問題集**（演習テスト5回 × 各70問 = 350問）を **3周**、周回グリッド＋任意スコア入力
- 締切から「今日やるべき量」と 前倒し/遅れ を自動計算、**70%合格ライン** つきスコア推移

## 使い方

`index.html` をブラウザで開くだけ。ローカルサーバでも可。

```bash
python3 -m http.server 8973
# → http://127.0.0.1:8973
```

- レクチャー行をタップで完了トグル。セクションは折りたたみ。
- 問題集グリッドのセルをタップで完了、右上「⋯」でスコア(0–100)入力。
- フッタから進捗の **エクスポート/インポート（JSON）** とリセットが可能。

## 構成

| ファイル | 役割 |
|---|---|
| `index.html` | 骨組み（プレーンな `<script>` で `data.js` → `app.js` を読み込み） |
| `styles.css` | デザインシステム実装（ダーク/ライト・reduced-motion 対応） |
| `data.js` | 教材シードデータ（数量・レクチャー名の「正」） |
| `app.js` | 状態管理・レンダリング・localStorage・ペース計算（IIFE） |
| `guide.html` | 使い方ガイド（初心者向け・自己完結の1ページ読み物） |
| `chat.html` | AI解説チャット（`styles.css`＋`chat.css`＋`chat-*.js` を読み込み） |
| `chat.css` | チャット固有スタイル（`styles.css` のトークンを再利用） |
| `chat-db.js` | チャット履歴の IndexedDB ラッパ（`az900-chat` v1・IIFE） |
| `chat-api.js` | バックエンド抽象化（ローカルブリッジ / BYOK・Anthropic API・IIFE） |
| `chat-app.js` | チャットUI・状態管理・画像処理・送信フロー（IIFE） |
| `local-bridge` | 無料AIモード用のローカルサーバ（`127.0.0.1:8975`・`claude` CLI 経由） |
| `DESIGN.md` | デザイン規約（配色・タイポ・余白・モーション） |

## AI解説チャット

`chat.html` は、AZ-900 の問題画像や質問を送ると「答え → なぜ → たとえ話 → ついでに覚える」の順で
やさしく解説する家庭教師チャットです。会話履歴は端末の IndexedDB（`az900-chat`）に保存され、
各会話は JSON でエクスポートできます。

バックエンドは起動時に自動判定します。

- **ローカル無料モード（bridge）**：`local-bridge` サーバ（`http://127.0.0.1:8975`）が動いていれば自動で選択。
  手元の `claude` CLI を利用するため無料・キー設定不要。`GET /api/health` で疎通確認し、`POST /api/chat`
  （`{system, messages}`）で非ストリーミング応答（`{ok, text}`）を受け取ります。
- **BYOK モード（byok）**：ブリッジが無い場合はこちら。設定画面で Anthropic APIキーを入力すると、
  スマホや外出先でも利用可能（少額従量課金）。Anthropic Messages API に SSE ストリーミングで直接接続します。

キーは `localStorage`（`az900-chat-settings-v1`）にこの端末のブラウザ内だけ保存され、
設定UIではマスク表示・削除も可能です。外部へ送られるのは、AI解説を使ったときに画像と質問が
Anthropic（BYOK）またはローカル CLI（bridge）へ渡るときのみです。

モデルは `claude-opus-4-8`（既定・高精度）/ `claude-sonnet-5`（バランス）/ `claude-haiku-4-5`（高速・安価）から選べます。

## データについて

進捗データは各ブラウザの localStorage に保存され、外部送信は一切ありません（ネットワーク通信ゼロ）。
別端末へ移す場合はフッタの JSON エクスポート/インポートを使用してください。
（AI解説チャットの利用時のみ、上記のとおり画像・質問が Anthropic またはローカル CLI に送られます。）

## 教材

- ① Udemy「合格への近道！Azure Fundamentals AZ-900 試験対策講座」
- ② Udemy「最短で合格！Azure Fundamentals AZ-900 試験対策問題集」
