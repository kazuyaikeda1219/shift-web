# 検査室シフト管理システム

## 技術構成
- **フロントエンド/API**: Next.js 14 (App Router) + TypeScript + Tailwind CSS
- **データベース**: Supabase (PostgreSQL)
- **デプロイ**: Vercel

---

## セットアップ手順

### 1. Supabase でDBを作成

1. https://supabase.com にログイン
2. 新しいプロジェクトを作成
3. **SQL Editor** を開いて `supabase_schema.sql` の内容を貼り付けて実行
4. `staff` テーブルの名前を実際のスタッフ名に書き換える

### 2. 環境変数を設定

`.env.local.example` をコピーして `.env.local` を作成：

```bash
cp .env.local.example .env.local
```

Supabase ダッシュボード > Settings > API から以下をコピー：
- `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
- `anon public` キー → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### 3. ローカルで起動（確認用）

```bash
npm install
npm run dev
```

http://localhost:3000 をブラウザで開く

### 4. GitHub にプッシュ

```bash
git init
git add .
git commit -m "initial commit"
git remote add origin https://github.com/あなたのユーザー名/shift-web.git
git push -u origin main
```

### 5. Vercel にデプロイ

1. https://vercel.com にログイン
2. **New Project** → GitHubリポジトリを選択
3. **Environment Variables** に `.env.local` と同じ値を設定
4. **Deploy** ボタンを押す

---

## 毎月の使い方

1. ブラウザでアプリを開く
2. **「休み申請を登録」** ページで対象月・スタッフ・区分を入力
3. **「シフトを生成」** ボタンを押す
4. シフト表を確認・手動修正（セルをクリック）

---

## 配置ルール

| 配置 | 人数 | 条件 |
|------|------|------|
| A 血液検査 | 1名 | 誰でも可 |
| B CBC | 1名 | 誰でも可 |
| C 心電図 | 1名 | 誰でも可 |
| D 昼１ | 1名 | 午後半休不可 |
| E-a US専任 | 1名 | US担当者のみ・全半休不可 |
| E-b US補助 | 3名 | 誰でも可（休み人数分削減） |

休診日：毎週日曜 / 奇数週土曜 / 祝日
