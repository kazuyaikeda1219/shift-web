// 放射線室シフト生成エンジン
// スタッフ3名（A:岸川 / B:野田 / C:石橋）の規則ベース生成。
// 検査室・看護師とは独立した radiation_* テーブルで運用する。

export type RadiationRole = 'A' | 'B' | 'C'
export type Kubun = '全休' | '午前半休' | '午後半休'

export interface RadiationStaff {
  id: string
  name: string
  role: RadiationRole
  sort_order: number
}

// 生成設定（radiation_config の1行：id=1）
//  anchor_monday          … 週サイクルの基準となる月曜（この週を「週0」とみなす）
//  sat_work_week0         … 週0の土曜が「全員出勤」か（false=全員休み）。以降隔週で反転
//  weekday_hayaban_week0  … 週0の平日にどちらが「早番」か（'B' または 'C'）。週ごとに交代
//  sat_hayaban_first      … 最初の全員出勤週の土曜早番（'B' または 'C'）。全員出勤週ごとに交代
export interface RadiationConfig {
  anchor_monday: string
  sat_work_week0: boolean
  weekday_hayaban_week0: 'B' | 'C'
  sat_hayaban_first: 'B' | 'C'
}

// position に格納する勤務時間帯の文字列
export const POS = {
  A_WEEKDAY: '8:00-17:00',
  A_SAT: '8:30-12:30',
  BC_WEEKDAY_HAYA: '8:30-17:30(早番)',
  BC_WEEKDAY: '8:30-17:30',
  BC_SAT_HAYA: '8:00-12:30(早番)',
  BC_SAT: '8:30-12:30',
  KOKYU: '公休',
} as const

export const KUBUN_OPTIONS: Kubun[] = ['全休', '午前半休', '午後半休']

// マニュアル編集で選べる候補（半休バリエーションも含む）
export const EDIT_OPTIONS: string[] = [
  POS.A_WEEKDAY, POS.A_SAT,
  POS.BC_WEEKDAY_HAYA, POS.BC_WEEKDAY,
  POS.BC_SAT_HAYA, POS.BC_SAT,
  POS.KOKYU,
  `${POS.A_WEEKDAY}(午前半休)`, `${POS.A_WEEKDAY}(午後半休)`,
  `${POS.BC_WEEKDAY}(午前半休)`, `${POS.BC_WEEKDAY}(午後半休)`,
]

export const DEFAULT_CONFIG: RadiationConfig = {
  anchor_monday: '2026-01-05', // 2026-01-05 は月曜
  sat_work_week0: true,
  weekday_hayaban_week0: 'B',
  sat_hayaban_first: 'B',
}

// locks[staff_id][day] = 休み区分
export type Locks = Record<string, Record<number, Kubun>>

export interface GenerateResult {
  grid: Record<string, Record<number, string>>
  ndays: number
  warnings: string[]
}

const DAY_MS = 24 * 60 * 60 * 1000

// 指定日（UTC）の属する週の月曜0:00(UTC)を返す
function mondayOfUTC(time: number): number {
  const d = new Date(time)
  const wd = d.getUTCDay() // 0=日,1=月,...,6=土
  const offset = wd === 0 ? -6 : 1 - wd
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) + offset * DAY_MS
}

// 基準月曜からの経過週数（0,1,2,...／基準より前は負）
function weekIndex(time: number, anchorMonday: string): number {
  const [ay, am, ad] = anchorMonday.split('-').map(Number)
  const anchor = mondayOfUTC(Date.UTC(ay, am - 1, ad))
  return Math.round((mondayOfUTC(time) - anchor) / (7 * DAY_MS))
}

// 安全な剰余（負の数でも 0..n-1 を返す）
function mod(n: number, m: number): number {
  return ((n % m) + m) % m
}

// 半休区分を勤務文字列に付与（公休にはそのまま公休）
function applyKubun(base: string, kubun: Kubun | undefined): string {
  if (!kubun) return base
  if (kubun === '全休') return POS.KOKYU
  if (base === POS.KOKYU) return POS.KOKYU
  return `${base}(${kubun})`
}

export function generateRadiationShift(
  staff: RadiationStaff[],
  locks: Locks,
  year: number,
  month: number,
  config: RadiationConfig,
  holidays: Set<string>,
): GenerateResult {
  const warnings: string[] = []
  const ndays = new Date(year, month, 0).getDate()
  const grid: Record<string, Record<number, string>> = {}
  for (const s of staff) grid[s.id] = {}

  const byRole = (role: RadiationRole) => staff.find(s => s.role === role)
  const a = byRole('A')
  const b = byRole('B')
  const c = byRole('C')
  if (!a || !b || !c) {
    warnings.push('スタッフ役割 A / B / C が揃っていません（3名・役割A/B/Cを設定してください）')
    return { grid, ndays, warnings }
  }

  const pad = (n: number) => String(n).padStart(2, '0')

  for (let day = 1; day <= ndays; day++) {
    const time = Date.UTC(year, month - 1, day)
    const wd = new Date(time).getUTCDay() // 0=日..6=土
    const dateStr = `${year}-${pad(month)}-${pad(day)}`
    const isHoliday = holidays.has(dateStr)
    const wk = weekIndex(time, config.anchor_monday)

    let posA: string = POS.KOKYU
    let posB: string = POS.KOKYU
    let posC: string = POS.KOKYU

    if (wd === 0 || isHoliday) {
      // ① 日曜・祝日 → 全員公休
    } else if (wd === 6) {
      // ② 土曜（隔週サイクル）
      const week0Work = config.sat_work_week0
      // 週0が全員出勤なら偶数週が出勤、そうでなければ奇数週が出勤
      const isWorkSat = week0Work ? mod(wk, 2) === 0 : mod(wk, 2) === 1
      if (isWorkSat) {
        // 全員出勤週：何回目の出勤週かで土曜早番を B/C 交代
        const workParity = week0Work ? 0 : 1
        const occurrence = Math.floor((wk - workParity) / 2)
        const firstIsB = config.sat_hayaban_first === 'B'
        const hayaIsB = mod(occurrence, 2) === 0 ? firstIsB : !firstIsB
        posA = POS.A_SAT
        posB = hayaIsB ? POS.BC_SAT_HAYA : POS.BC_SAT
        posC = hayaIsB ? POS.BC_SAT : POS.BC_SAT_HAYA
      }
      // 全員休み週は全員公休のまま
    } else {
      // ③ 平日（月〜金）
      posA = POS.A_WEEKDAY
      // 週ごとに B/C の早番を交代
      const week0IsB = config.weekday_hayaban_week0 === 'B'
      const hayaIsB = mod(wk, 2) === 0 ? week0IsB : !week0IsB
      posB = hayaIsB ? POS.BC_WEEKDAY_HAYA : POS.BC_WEEKDAY
      posC = hayaIsB ? POS.BC_WEEKDAY : POS.BC_WEEKDAY_HAYA
    }

    // ④ 休み申請を反映
    const ka = locks[a.id]?.[day]
    const kb = locks[b.id]?.[day]
    const kc = locks[c.id]?.[day]
    if ((ka || kb || kc) && (wd === 0 || isHoliday)) {
      warnings.push(`${month}/${day} は休診日（公休）のため休み申請は無視されました`)
    }
    grid[a.id][day] = applyKubun(posA, ka)
    grid[b.id][day] = applyKubun(posB, kb)
    grid[c.id][day] = applyKubun(posC, kc)
  }

  return { grid, ndays, warnings }
}
