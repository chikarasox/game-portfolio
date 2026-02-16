# 会社アカウントがある環境でプライベートGitHubにpushする手順

## 前提

- 会社用GitHubアカウントが既にSSH鍵で設定済み
- 同じマシンからプライベートアカウントのリポジトリにもpush したい

## 1. プライベート用のSSH鍵を作成

会社用とは別の鍵ペアを生成する。

```bash
ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519_private -C "プライベートのGitHubユーザー名"
```

- パスフレーズは任意（空でもOK）
- 既存の鍵（`~/.ssh/id_ed25519` 等）は上書きしない

## 2. SSH configにHost を追加

`~/.ssh/config` にプライベート用のHostエントリを追加する。

```
# プライベートGitHub
Host github-private
    HostName github.com
    User git
    IdentityFile ~/.ssh/id_ed25519_private
```

**ポイント**: `Host github-private` は任意の名前。この名前でリモートURLを指定することで、使う鍵を切り分ける。

## 3. GitHubに公開鍵を登録

### 方法A: gh CLI を使う場合

```bash
# gh CLI のインストール（未インストールの場合）
brew install gh

# プライベートアカウントでログイン
gh auth login -h github.com -p https -w

# 公開鍵の登録に必要なスコープを追加
gh auth refresh -h github.com -s admin:public_key

# 公開鍵を登録
gh ssh-key add ~/.ssh/id_ed25519_private.pub --title "MacBook Private"
```

### 方法B: ブラウザから手動で登録

1. 公開鍵の内容をコピー
   ```bash
   cat ~/.ssh/id_ed25519_private.pub
   ```
2. GitHub にプライベートアカウントでログイン
3. **Settings → SSH and GPG keys → New SSH key** に貼り付けて保存

## 4. 接続テスト

```bash
ssh -T git@github-private
```

以下のように表示されればOK:

```
Hi プライベートユーザー名! You've successfully authenticated, ...
```

会社用の確認:

```bash
ssh -T git@github.com
```

```
Hi 会社ユーザー名! You've successfully authenticated, ...
```

両方が別アカウントで認証されていることを確認する。

## 5. リポジトリの設定

### 新規リポジトリの場合

```bash
git init
git config user.name "プライベートユーザー名"
git config user.email "ユーザー名@users.noreply.github.com"
git remote add origin git@github-private:ユーザー名/リポジトリ名.git
```

### 既存リポジトリのリモートを切り替える場合

```bash
git remote set-url origin git@github-private:ユーザー名/リポジトリ名.git
```

**重要**: リモートURLのホスト部分を `github.com` ではなく `github-private`（SSH configで設定した名前）にする。

## 6. Git ユーザー情報の切り替え

### リポジトリ単位で設定（最低限）

```bash
# そのリポジトリ内で実行（--global を付けない）
git config user.name "プライベートユーザー名"
git config user.email "ユーザー名@users.noreply.github.com"
```

### ディレクトリ単位で自動切り替え（おすすめ）

プライベート作業用のディレクトリを決めて `~/.gitconfig` に設定しておくと、毎回の設定が不要になる。

```gitconfig
# ~/.gitconfig に追記
[includeIf "gitdir:~/personal/"]
    path = ~/.gitconfig-private
```

```bash
# ~/.gitconfig-private を作成
git config --file ~/.gitconfig-private user.name "プライベートユーザー名"
git config --file ~/.gitconfig-private user.email "ユーザー名@users.noreply.github.com"
```

これで `~/personal/` 以下のリポジトリは自動でプライベートの設定が適用される。

## 7. push

```bash
git add .
git commit -m "Initial commit"
git push -u origin main
```

## まとめ

| 項目 | 会社 | プライベート |
|---|---|---|
| SSH鍵 | `~/.ssh/id_ed25519` | `~/.ssh/id_ed25519_private` |
| SSH Host | `github.com` | `github-private` |
| リモートURL | `git@github.com:会社/repo.git` | `git@github-private:個人/repo.git` |
| git user | グローバル設定 | リポジトリ単位 or includeIf |

## トラブルシューティング

### HTTPS で認証エラーになる

macOS の Keychain に会社アカウントのトークンが保存されていると、プライベートアカウントで認証できない。**SSH方式を使えばこの問題を回避できる**。

### 間違ったアカウントでpushしてしまった

```bash
# 直前のコミットの作者を修正
git commit --amend --author="名前 <メール>" --no-edit
```

### どのアカウントで認証されるか確認したい

```bash
# 会社用
ssh -T git@github.com

# プライベート用
ssh -T git@github-private
```
