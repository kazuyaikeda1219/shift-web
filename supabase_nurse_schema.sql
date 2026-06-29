-- =============================================
-- 看護師シフト管理 テーブル定義
-- 既存の検査室・栄養科とは別に nurse_* で分離
-- Supabase ダッシュボード > SQL Editor で実行
-- =============================================

-- 看護師スタッフマスタ
create table if not exists nurse_staff (
  id            text primary key,          -- N1, N2, ...
  name          text not null,
  qualification text,                       -- 資格/役職（任意）
  night_ok      boolean not null default true,    -- 夜勤可否
  night_role    text not null default '両方可'
                check (night_role in ('両方可','夜正のみ','夜副のみ')),
  max_night     integer not null default 4,       -- 月の最大夜勤数
  max_consec    integer not null default 5,       -- 連続勤務上限
  is_newbie     boolean not null default false,   -- 新人（夜勤の必要人数にカウントしない）
  kokyu_override integer,                          -- 月公休数の個別設定（null=全体設定に従う）
  sort_order    integer not null default 0
);

-- スタッフ別 曜日条件
--   no_night_dow  … その曜日は夜勤に入れない
--   fixed_day_dow … その曜日は日勤固定
--   weekday: 0=月,1=火,2=水,3=木,4=金,5=土,6=日
create table if not exists nurse_staff_rules (
  id        bigserial primary key,
  staff_id  text not null references nurse_staff(id) on delete cascade,
  rule_type text not null check (rule_type in ('no_night_dow','fixed_day_dow')),
  weekday   integer not null check (weekday between 0 and 6),
  unique (staff_id, rule_type, weekday)
);
alter table nurse_staff_rules disable row level security;

-- 夜勤NG組み合わせ（同じ夜勤に入れない）
create table if not exists nurse_ng_pairs (
  id        bigserial primary key,
  staff_a   text not null references nurse_staff(id) on delete cascade,
  staff_b   text not null references nurse_staff(id) on delete cascade,
  note      text,
  unique (staff_a, staff_b)
);

-- 希望休・各種休暇の事前入力（記号はExcelと同一）
create table if not exists nurse_requests (
  id         bigserial primary key,
  year       integer not null,
  month      integer not null,
  day        integer not null,
  staff_id   text not null references nurse_staff(id) on delete cascade,
  symbol     text not null,                 -- 年, /年, 振, ✕ など
  created_at timestamptz default now(),
  unique (year, month, day, staff_id)
);

-- 生成済み（または手修正済み）シフト
create table if not exists nurse_shifts (
  id         bigserial primary key,
  year       integer not null,
  month      integer not null,
  date       date not null,
  staff_id   text not null references nurse_staff(id) on delete cascade,
  symbol     text not null,                 -- 日, 夜正, 夜副, 非, ✕ など
  is_draft   boolean not null default true,
  created_at timestamptz default now(),
  unique (date, staff_id)
);

-- 下書きパターン（複数案の保存・比較用）
create table if not exists nurse_shifts_draft (
  id           bigserial primary key,
  year         integer not null,
  month        integer not null,
  pattern_name text not null,
  date         date not null,
  staff_id     text not null references nurse_staff(id) on delete cascade,
  symbol       text not null,
  unique (year, month, pattern_name, date, staff_id)
);

-- 生成設定（1行のみ運用：id=1）
create table if not exists nurse_config (
  id              integer primary key default 1,
  -- 曜日別 夜勤必要人数 [月,火,水,木,金,土,日]
  need_mon integer not null default 2,
  need_tue integer not null default 3,
  need_wed integer not null default 2,
  need_thu integer not null default 3,
  need_fri integer not null default 3,
  need_sat integer not null default 3,
  need_sun integer not null default 2,
  sei_count    integer not null default 1,  -- 夜正（リーダー）人数
  day_sat          integer not null default 5,  -- 土曜の日勤人数
  day_sun_holiday  integer not null default 3,  -- 日曜・祝日の日勤人数
  kokyu_target integer,                      -- 公休目標日数（null=自動）
  seed         integer,                      -- 乱数シード（null=毎回ランダム）
  constraint nurse_config_singleton check (id = 1)
);

insert into nurse_config (id) values (1) on conflict (id) do nothing;

-- 既に nurse_config を作成済みの場合の追加カラム（再実行しても安全）
alter table nurse_config add column if not exists day_sat         integer not null default 5;
alter table nurse_config add column if not exists day_sun_holiday integer not null default 3;

-- 既に nurse_staff を作成済みの場合の追加カラム（再実行しても安全）
alter table nurse_staff add column if not exists is_newbie      boolean not null default false;
alter table nurse_staff add column if not exists kokyu_override integer;

-- RLS（開発中はオフ。本番運用時に有効化）
alter table nurse_staff        disable row level security;
alter table nurse_ng_pairs     disable row level security;
alter table nurse_requests     disable row level security;
alter table nurse_shifts       disable row level security;
alter table nurse_shifts_draft disable row level security;
alter table nurse_config       disable row level security;

-- 初期スタッフ（現行Excelの35名）。名前・設定は画面から編集可能。
insert into nurse_staff (id, name, night_ok, night_role, max_night, max_consec, sort_order) values
  ('N1','白武京子',true,'両方可',4,5,1),
  ('N2','川添智子',true,'両方可',4,5,2),
  ('N3','渡島和子',true,'両方可',4,5,3),
  ('N4','香月美由紀',true,'両方可',4,5,4),
  ('N5','樋口智子',true,'両方可',4,5,5),
  ('N6','内田祥子',true,'両方可',4,5,6),
  ('N7','朱牟田美香',true,'両方可',4,5,7),
  ('N8','井﨑豊美',true,'両方可',4,5,8),
  ('N9','坂元美樹',true,'両方可',4,5,9),
  ('N10','小野留里',true,'両方可',4,5,10),
  ('N11','森早苗',true,'両方可',4,5,11),
  ('N12','山口久美子',true,'両方可',4,5,12),
  ('N13','池田邦枝',true,'両方可',4,5,13),
  ('N14','定松あゆみ',true,'両方可',4,5,14),
  ('N15','田代香',true,'両方可',4,5,15),
  ('N16','野田揮美子',true,'両方可',4,5,16),
  ('N17','柴田千代',true,'両方可',4,5,17),
  ('N18','川口喜代',true,'両方可',4,5,18),
  ('N19','円城寺美穂',true,'両方可',4,5,19),
  ('N20','大隈由子',true,'両方可',4,5,20),
  ('N21','野口昌代',true,'両方可',4,5,21),
  ('N22','大野優',true,'両方可',4,5,22),
  ('N23','中原静香',true,'両方可',4,5,23),
  ('N24','北原美幸',true,'両方可',4,5,24),
  ('N25','緒方恵',true,'両方可',4,5,25),
  ('N26','牟田口聖子',true,'両方可',4,5,26),
  ('N27','仁田原千弘',true,'両方可',4,5,27),
  ('N28','舩津早苗',true,'両方可',4,5,28),
  ('N29','筬かよ',true,'両方可',4,5,29),
  ('N30','下村朝夏',true,'両方可',4,5,30),
  ('N31','杠聖奈',true,'両方可',4,5,31),
  ('N32','松浦楓香',true,'両方可',4,5,32),
  ('N33','福田祐子',true,'両方可',4,5,33),
  ('N34','原田ちはる',true,'両方可',4,5,34),
  ('N35','山領万梨捺',true,'両方可',4,5,35)
on conflict (id) do nothing;
