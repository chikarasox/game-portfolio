# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 言語

常に日本語で会話する。

## プロジェクト概要

GitHub Pages でホストするブラウザゲームのポートフォリオサイト。`game{N}/` フォルダを追加するだけでトップページに自動反映される仕組み。

## 開発コマンド

```bash
# ローカル確認（プロジェクトルートで実行）
python3 -m http.server 8080

# テスト（game1 ディレクトリ内）
cd game1 && npm test            # 単発実行
cd game1 && npx vitest --watch  # ウォッチモード
```

## アーキテクチャ

### ポートフォリオ（ルート index.html）
- `game1/meta.json` 〜 `game50/meta.json` を並列fetchして自動検出（MAX_SCAN=50）
- IntersectionObserver による無限スクロール（PAGE_SIZE=12）
- サムネイルは `thumbnail` フィールドの画像、未指定なら `emoji` + `color` で表示

### game1: NEURAL ASCENSION（クリッカーゲーム）
3層分離設計:
- **main.js** — UI制御、セーブ/ロード（localStorage キー: `neuralAscension_save`）、100ms tick
- **gameLogic.js** — 純粋関数のみ。`calculateFinalClick()`, `calculateFinalNps()` 等。UMD互換でブラウザ/Node両対応。テストはこの層が対象
- **gameData.json** — ステージ定義（8段階）、アップグレード、バフ設定
- **audio.js** — Web Audio API によるBGM/SFX管理

数値計算で BigInt を使用。分数表記 `{num, den}` で精度損失を回避。

### game2: テトリスローグライク（開発中）
- tetris.js（テトリスロジック）+ rpg.js（RPGシステム）+ main.js（統合制御）
- 2キャンバス並行表示

## ゲーム追加手順

1. `game{N}/` フォルダを作成
2. `meta.json`（title, description, emoji, color）と `index.html` を配置
3. push すればトップページに自動反映（設定ファイルの編集不要）

## デバッグ

game1: Dキー5連打でデバッグパネル表示（ニューロン追加、ステージ移動、速度変更等）

## Git / デプロイ

- リモート: SSH経由（`Host github-private` → プライベートアカウント chikarasox）
- デプロイ: GitHub Pages（main ブランチ、ルート直下）
