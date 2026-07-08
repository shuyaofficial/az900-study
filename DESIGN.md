# DESIGN.md — AZ-900 合格ダッシュボード

判断基準は一つ。**「スティーブ・ジョブズはこれで納得するか」**。
足し算ではなく引き算。1画面1フォーカス。余白・タイポ・動きで語る。装飾で語らない。

## 原則

1. **引き算** — 迷ったら削る。機能もUIも「無くて困るまで足さない」。
2. **1アクセント** — 色で意味を持たせるのは Azure ブルー1色＋状態色（緑/琥珀/赤）のみ。
3. **数字が主役** — 残り本数・残り問題数・締切までの日数を、大きく・美しく・tabular で。
4. **触って気持ちいい** — チェックは即・滑らか・確か（ばねイージング＋数値tween）。
5. **モバイル前提** — 学習はスマホ。max-width 680px 中央寄せ、指で押せる44px以上。
6. **静けさ** — 影は薄く、境界は繊細に。ダークモードは真っ黒(#000)を活かす。

## カラートークン（CSS変数）

```css
:root {
  color-scheme: light dark;
  --bg: #F5F5F7;
  --surface: #FFFFFF;
  --surface-2: #F4F4F7;
  --text: #1D1D1F;
  --text-2: #6E6E73;
  --text-3: #A1A1A6;
  --separator: rgba(0,0,0,0.08);
  --accent: #0071E3;         /* Azure×Apple の落ち着いた青 */
  --accent-soft: rgba(0,113,227,0.12);
  --success: #34C759;        /* 完了・前倒し */
  --warn:    #FF9F0A;        /* わずかに遅れ */
  --danger:  #FF3B30;        /* 遅れ */
  --ring-track: rgba(0,0,0,0.06);
  --shadow-card: 0 1px 2px rgba(0,0,0,.04), 0 10px 30px rgba(0,0,0,.06);
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #000000;
    --surface: #1C1C1E;
    --surface-2: #2C2C2E;
    --text: #F5F5F7;
    --text-2: #AEAEB2;
    --text-3: #6E6E73;
    --separator: rgba(255,255,255,0.10);
    --accent: #0A84FF;
    --accent-soft: rgba(10,132,255,0.18);
    --success: #30D158;
    --warn:    #FFD60A;
    --danger:  #FF453A;
    --ring-track: rgba(255,255,255,0.12);
    --shadow-card: none;     /* ダークは影の代わりに境界で分離 */
  }
}
```

状態色の使い分け（ペース判定）: `delta = done - 理想done`
- `delta >= 0` → **--success**（前倒し/オンtrack）
- `-必要日数分の0.5日相当 <= delta < 0` → **--warn**（わずかに遅れ）
- それ未満 → **--danger**（遅れ）

## タイポ

```css
--font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
        "Hiragino Sans", "Noto Sans JP", sans-serif;
```
数値は必ず `font-variant-numeric: tabular-nums;`。

| 用途 | size | weight | tracking |
|---|---|---|---|
| ヒーロー数字 | clamp(44px,12vw,64px) | 700 | -0.02em |
| 大リング中央数字 | 34px | 700 | -0.01em |
| セクション見出し | 22px | 700 | -0.01em |
| ヘッドライン | 17px | 600 | 0 |
| 本文 | 15px | 400 | 0 |
| キャプション | 13px | 400（--text-2） | 0 |
| マイクロ | 11px | 600（--text-3, 大文字トラッキング0.04em） | |

## スペーシング / 角丸 / 影

- スペース: 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40（8基調）
- 角丸: sm 10 / md 14 / lg 20 / pill 999
- カード: `background:var(--surface); border-radius:20px; box-shadow:var(--shadow-card);`
  ダークは `border:1px solid var(--separator)` を併用
- ページ余白: 左右16–20px、上部にsafe-area対応 `env(safe-area-inset-*)`

## モーション

```css
--ease-out: cubic-bezier(.22,.61,.36,1);
--ease-spring: cubic-bezier(.34,1.56,.64,1);   /* チェック時のはね */
--dur-fast: 180ms; --dur: 280ms; --dur-slow: 460ms;
```
- リング: `stroke-dashoffset` を `--dur-slow var(--ease-out)`
- チェック: チェックマークをpath描画（stroke-dashoffset）＋ボックスを `scale(.9→1)` はね
- 数値: tween（requestAnimationFrame, ease-out, 約400ms）で increment/decrement
- `@media (prefers-reduced-motion: reduce)` で全アニメを実質無効化

## コンポーネント

### 進捗リング（SVG）
- 二重円: トラック(`--ring-track`)＋進捗(`--accent`)。`stroke-linecap:round`、`transform:rotate(-90deg)`
- 大(ヒーロー/タブ上部): 直径120–140、stroke 10–12、中央に「本数 or %」＋下に小ラベル
- 小(セクション見出し左): 直径28、stroke 4
- 完了(100%)時のみリングを `--success` に切替

### セグメントコントロール（① / ②）
- iOS風。`--surface-2` トラックに白（ダークは`--surface`）のピルが `transform:translateX` でスライド、`--dur var(--ease-out)`
- 選択中ラベルは weight 600、非選択は `--text-2`

### レクチャー・チェック項目（①）
- 44px以上の行。左に丸チェックボックス、タイトル、右に尺（--text-3, tabular）
- 完了行: タイトルに取り消し線は付けない（品を保つ）。代わりにチェックを`--success`塗り＋行を少しだけ沈める（opacity .55）
- セクションカードは折りたたみ（既定=閉）。ヘッダに 小リング＋「name」＋「3/14」＋シェブロン。展開は高さアニメ

### 周回グリッド（②）
- 5行(問題集1–5)×3列(1周/2周/3周)。セル=角丸12のタップターゲット
- 未了=枠線のみ / 完了=`--accent-soft`地＋チェック / スコア入力があれば中央に「92%」
- スコアは任意。セル長押し or ⓘ で `0–100` 入力（未入力可）。70%以上は数字を`--success`、未満は`--warn`
- グリッド下に周ごと平均スコアのミニ折れ線＋**70%合格ライン**（点線, --text-3）

### ヒーロー
- 上段: 「① 締切まで N日」「② 締切まで N日」を横並びチップ。緊急度で色
- 中央: 現在タブの大リング＋大数字（残り or 完了）
- 下段: 「今日やるべき: ◯本 / ◯問」＋前倒し/遅れバッジ

## レイアウト
- 単一カラム、`max-width:680px`、中央。背景`--bg`。
- 上から: ヘッダ(アプリ名・小)→ヒーロー→セグメント→タブ内容→フッタ(エクスポート/インポート/リセット, 控えめ)

## アクセシビリティ
- チェックは `role="checkbox" aria-checked`、キーボード操作可、`:focus-visible` に2px --accent リング
- コントラスト比 本文4.5:1以上。状態は色だけに依存せずアイコン/ラベル併記
- リング等の装飾SVGは `aria-hidden`、数値はテキストで別途提供
