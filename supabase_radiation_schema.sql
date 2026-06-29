-- =============================================
-- 放射線室シフト管理 テーブル定義
-- 既存の検査室・栄養科・看護師とは別に radiation_* で分離
-- Supabase ダッシュボード > SQL Editor で実行
-- =============================================

-- 放射線室スタッフマスタ（3名固定：A岸川 / B野田 / C石橋）
create table if not exists radiation_staff (
  id         text primary key,                 -- R1, R2, R3
  name       text not null,
  role       text not null check (role in ('A','B','C')),
  sort_order integer not null default 0
);

-- 休み申請（区分は検査室と同じ）
create table if not exists radiation_requests (
  id         bigserial primary key,
  year       integer not null,
  month      integer not null,
  day        integer not null,
  staff_id   text not null references radiation_staff(id) on delete cascade,
  kubun      text not null check (kubun in ('全休','午前半休','午後半休')),
  created_at timestamptz default now(),
  unique (year, month, day, staff_id)
);

-- 生成済み（または手修正済み）シフト
create table if not exists radiation_shifts (
  id         bigserial primary key,
  year       integer not null,
  month      integer not null,
  date       date not null,
  staff_id   text not null references radiation_staff(id) on delete cascade,
  position   text not null,                     -- 8:00-17:00 / 公休 など
  is_draft   boolean not null default true,
  created_at timestamptz default now(),
  unique (date, staff_id)
);

-- 生成設定（1行のみ運用：id=1）
create table if not exists radiation_config (
  id                    integer primary key default 1,
  anchor_monday         date    not null default '2026-01-05', -- 週サイクルの基準月曜
  sat_work_week0        boolean not null default true,         -- 週0の土曜が全員出勤か
  weekday_hayaban_week0 text    not null default 'B' check (weekday_hayaban_week0 in ('B','C')),
  sat_hayaban_first     text    not null default 'B' check (sat_hayaban_first in ('B','C')),
  constraint radiation_config_singleton check (id = 1)
);

insert into radiation_config (id) values (1) on conflict (id) do nothing;

-- RLS（開発中はオフ。本番運用時に有効化）
alter table radiation_staff    disable row level security;
alter table radiation_requests disable row level security;
alter table radiation_shifts   disable row level security;
alter table radiation_config   disable row level security;

-- 初期スタッフ（氏名は画面から編集可能）
insert into radiation_staff (id, name, role, sort_order) values
  ('R1','岸川','A',1),
  ('R2','野田','B',2),
  ('R3','石橋','C',3)
on conflict (id) do nothing;
