-- =============================================
-- Supabase テーブル定義
-- Supabase ダッシュボード > SQL Editor で実行
-- =============================================

-- スタッフマスタ
create table if not exists staff (
  id        text primary key,        -- S1〜S8
  name      text not null,
  can_us    boolean not null default false,  -- US担当可（E①〜④に入れる4名）
  is_star   boolean not null default false,  -- ★：水曜にA禁止の対象（US担当のうち松井を除く3名）
  sort_order integer not null default 0
);

-- 初期データ（名前は実際のものに変更してください）
insert into staff (id, name, can_us, is_star, sort_order) values
  ('S1', '土橋', true,  true,  1),
  ('S2', '竹下', true,  true,  2),
  ('S3', '井上', true,  true,  3),
  ('S4', '松井', true,  false, 4),
  ('S5', '田中', false, false, 5),
  ('S6', '大坪', false, false, 6),
  ('S7', '塚原', false, false, 7),
  ('S8', '井手', false, false, 8)
on conflict (id) do nothing;

-- 既存テーブルへの追加マイグレーション（すでに staff がある場合はこちらを実行）
alter table staff add column if not exists is_star boolean not null default false;
update staff set is_star = true  where id in ('S1','S2','S3');  -- 土橋・竹下・井上
update staff set is_star = false where id = 'S4';               -- 松井は対象外

-- 休み申請
create table if not exists requests (
  id         bigserial primary key,
  year       integer not null,
  month      integer not null,
  day        integer not null,
  staff_id   text not null references staff(id),
  kubun      text not null check (kubun in ('全休','午前半休','午後半休')),
  created_at timestamptz default now(),
  unique (year, month, day, staff_id)   -- 同日同スタッフは1件のみ
);

-- 生成済みシフト
create table if not exists shifts (
  id         bigserial primary key,
  year       integer not null,
  month      integer not null,
  date       date not null,
  staff_id   text not null references staff(id),
  position   text not null,
  created_at timestamptz default now(),
  unique (date, staff_id)
);

-- RLS（Row Level Security）は開発中はオフ推奨
-- 本番運用時に有効化してください
alter table staff    disable row level security;
alter table requests disable row level security;
alter table shifts   disable row level security;
