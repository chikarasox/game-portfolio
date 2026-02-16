# Game Portfolio

自作ブラウザゲームのポートフォリオサイト（GitHub Pages対応）

## サイト構成

```
game-portfolio/
├── index.html          ← トップページ（ゲーム一覧を自動表示）
├── game1/
│   ├── meta.json       ← ゲーム情報（タイトル・説明・サムネ）
│   └── index.html      ← ゲーム本体
├── game2/
│   ├── meta.json
│   └── index.html
└── game3/ ...          ← フォルダを追加するだけで一覧に反映
```

## ゲーム追加手順

### 1. フォルダを作成

`game3/` のように連番でフォルダを作る（欠番OK）。

### 2. `meta.json` を作成

```json
{
  "title": "ゲームタイトル",
  "description": "ゲームの説明文",
  "emoji": "🎯",
  "color": "linear-gradient(135deg, #e94560, #c23152)"
}
```

| フィールド | 必須 | 説明 |
|---|---|---|
| `title` | ○ | 一覧に表示されるタイトル |
| `description` | ○ | 一覧に表示される説明文 |
| `emoji` | | サムネイル用の絵文字（デフォルト: 🎮） |
| `color` | | サムネイル背景色。CSS値を指定（デフォルト: `#1a1a2e`） |
| `thumbnail` | | サムネイル画像のファイル名（例: `thumb.png`）。指定するとemojiの代わりに画像を表示 |

#### サムネイル仕様

- **推奨サイズ**: 960×540px（16:9）
- **対応形式**: PNG / JPG / WebP
- 画像がない場合は `emoji` + `color` の背景で自動生成される
- 画像を使う場合はゲームフォルダ内に配置し、`meta.json` に `"thumbnail": "ファイル名"` を追記

```
game3/
├── meta.json        ← "thumbnail": "thumb.png" を追記
├── thumb.png        ← 960×540 の画像
└── index.html
```

### 3. `index.html` を作成

ゲーム本体のHTMLを配置する。ナビゲーション用に以下を含めると一覧に戻れる。

```html
<nav><a href="../">← ゲーム一覧に戻る</a></nav>
```

### 4. push する

```bash
git add game3/
git commit -m "Add game3"
git push
```

トップページの編集は不要。`game1/` 〜 `game50/` の `meta.json` を自動検出して一覧に表示される。

- 初回表示では最大12個（3列×4行）を表示
- スクロールすると追加12個ずつ自動で読み込まれる

> 50個を超える場合は `index.html` 内の `MAX_SCAN` の値を増やしてください。

## ローカル確認

```bash
# プロジェクトルートで実行
python3 -m http.server 8080
```

http://localhost:8080 で確認できる。

## GitHub Pages デプロイ

### 初回セットアップ

1. GitHubにリポジトリを作成
2. コードをpush
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/<ユーザー名>/<リポジトリ名>.git
   git branch -M main
   git push -u origin main
   ```
3. リポジトリの **Settings → Pages** を開く
4. **Source** を `Deploy from a branch` に設定
5. **Branch** を `main`、フォルダを `/ (root)` に設定して Save

数分後に `https://<ユーザー名>.github.io/<リポジトリ名>/` で公開される。

### 2回目以降の更新

```bash
git add .
git commit -m "Add game3"
git push
```

pushするだけで自動的にサイトが更新される。
