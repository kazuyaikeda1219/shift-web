export type ShiftType =
  | '早出' | '日勤' | '遅出' | '遅出*'
  | '9事務' | '9遅出' | '8-13' | '9-13'
  | '自宅' | '休み' | '希望休'

export type StaffId =
  | 'taniguchi' | 'soejima' | 'kita' | 'matsuono'
  | 'fujii' | 'ebara' | 'nishikubo'

export const STAFF_IDS: StaffId[] = [
  'taniguchi', 'soejima', 'kita', 'matsuono', 'fujii', 'ebara', 'nishikubo',
]

export const STAFF_NAMES: Record<StaffId, string> = {
  taniguchi: '谷口',
  soejima:   '副島',
  kita:      '喜多',
  matsuono:  '松園',
  fujii:     '藤井',
  ebara:     '江原',
  nishikubo: '西久保',
}

// ジョブカン スタッフコード
export const STAFF_CODES: Record<StaffId, number> = {
  taniguchi: 53,
  fujii:     56,
  nishikubo: 58,
  ebara:     59,
  soejima:   90,
  matsuono:  106,
  kita:      112,
}

export const STAFF_NOTES: Record<StaffId, string> = {
  taniguchi: '献立作成',
  soejima:   '管理栄養士・発注',
  kita:      '発注',
  matsuono:  '',
  fujii:     '',
  ebara:     '自宅勤務有',
  nishikubo: '管理栄養士・献立作成',
}

// 管理栄養士
export const KANRI_EIYOSHI: StaffId[] = ['soejima', 'nishikubo']

// 出勤とみなすシフト（休みではない）
export const WORKING_SHIFTS: ShiftType[] = [
  '早出', '日勤', '遅出', '遅出*', '9事務', '9遅出', '8-13', '9-13', '自宅',
]

export function isWorking(s: ShiftType): boolean {
  return WORKING_SHIFTS.includes(s)
}

// 第n週（月内で何番目のその曜日か）
function weekOfMonth(d: Date): number {
  return Math.floor((d.getDate() - 1) / 7) + 1
}

// 各スタッフの基本シフトを返す
function baseShift(
  staffId: StaffId,
  dow: number,   // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
  week: number,  // 1〜5
  isHoliday: boolean,
): ShiftType {
  switch (staffId) {

    // ── 谷口 ──────────────────────────────────────
    case 'taniguchi':
      if (dow === 1) return '休み'      // 月
      if (dow === 2) return '希望休'    // 火（希望休）
      if (dow === 3) return '休み'      // 水
      if (dow === 4) return '早出'      // 木
      if (dow === 5) return '早出'      // 金
      if (dow === 6) return (week === 1 || week === 3) ? '早出' : '日勤'  // 土
      if (dow === 0) return '早出'      // 日
      break

    // ── 副島（管理栄養士） ─────────────────────────
    case 'soejima':
      if (dow === 1) return '遅出'      // 月
      if (dow === 2) return '休み'      // 火
      if (dow === 3) return '日勤'      // 水（医療安全カンファ）
      if (dow === 4) return '休み'      // 木
      if (dow === 5) return '希望休'    // 金（基本出勤=遅出、希望休扱い）
      if (dow === 6) return '遅出'      // 土
      if (dow === 0) return week === 1 ? '9事務' : '遅出'  // 日（第1→9事務）
      break

    // ── 喜多 ──────────────────────────────────────
    case 'kita':
      if (dow === 1) return '早出'      // 月
      if (dow === 2) return '早出'      // 火（早出 or 遅出* → デフォルト早出）
      if (dow === 3) return '遅出*'     // 水
      if (dow === 4) return '遅出*'     // 木
      if (dow === 5) return '休み'      // 金
      if (dow === 6) return '休み'      // 土
      if (dow === 0) return week === 3 ? '9事務' : '遅出*'  // 日（第3→9事務）
      break

    // ── 松園 ──────────────────────────────────────
    case 'matsuono':
      if (dow === 1) return '遅出*'     // 月
      if (dow === 2) return '希望休'    // 火（基本休み・状況により遅出*）
      if (dow === 3) return '休み'      // 水
      if (dow === 4) return '休み'      // 木
      if (dow === 5) return '遅出*'     // 金
      if (dow === 6) return '遅出*'     // 土
      if (dow === 0) return '遅出*'     // 日
      break

    // ── 藤井 ──────────────────────────────────────
    case 'fujii':
      if (isHoliday || dow === 0 || dow === 6) return '休み'
      if (dow === 1) return '8-13'      // 月
      if (dow === 2) return '9-13'      // 火
      if (dow === 3) return '休み'      // 水
      if (dow === 4) return '9-13'      // 木
      if (dow === 5) return '8-13'      // 金
      break

    // ── 江原 ──────────────────────────────────────
    case 'ebara':
      // 火・木・金は祝日でも自宅
      if (dow === 2 || dow === 4 || dow === 5) return '自宅'
      if (isHoliday || dow === 0) return '休み'
      if (dow === 1) return '休み'      // 月
      if (dow === 3) return '早出'      // 水
      if (dow === 6) return (week === 2 || week === 4) ? '早出' : '休み'  // 土（第2・4）
      break

    // ── 西久保（管理栄養士） ───────────────────────
    case 'nishikubo':
      if (isHoliday || dow === 0 || dow === 6) return '休み'
      if (dow === 1) return '9事務'     // 月
      if (dow === 2) return '9遅出'     // 火
      if (dow === 3) return '9遅出'     // 水
      if (dow === 4) return '9遅出'     // 木
      if (dow === 5) return '9事務'     // 金
      break
  }
  return '休み'
}

export interface DayShift {
  date: string       // YYYY-MM-DD
  day: number
  weekday: string    // 月火水木金土日
  isHoliday: boolean
  holidayName?: string
  isClosed: boolean  // 休診日（日曜・祝日）
  shifts: Record<StaffId, ShiftType>
  periodicTasks: string[]
  warnings: string[]
}

export function generateMonth(
  year: number,
  month: number,
  holidays: Record<string, string>,
  overrides: Record<string, Partial<Record<StaffId, ShiftType>>> = {},
): DayShift[] {
  const result: DayShift[] = []
  const daysInMonth = new Date(year, month, 0).getDate()
  const WEEKDAY_JP = ['日', '月', '火', '水', '木', '金', '土']

  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month - 1, day)
    const dow = d.getDay()
    const week = weekOfMonth(d)
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const isHoliday = dateStr in holidays
    const isClosed = dow === 0 || isHoliday

    const dayOverrides = overrides[dateStr] ?? {}
    const shifts: Record<StaffId, ShiftType> = {} as Record<StaffId, ShiftType>

    for (const sid of STAFF_IDS) {
      if (dayOverrides[sid] !== undefined) {
        shifts[sid] = dayOverrides[sid]!
      } else {
        let s = baseShift(sid, dow, week, isHoliday)
        // 休診日に日勤は発生しない（谷口の土曜第2・4が祝日になった場合など）
        if (isClosed && s === '日勤') s = '早出'
        shifts[sid] = s
      }
    }

    // ── 定期タスク ─────────────────────────────────
    const periodicTasks: string[] = []
    if (dow === 6) {
      periodicTasks.push('(午前) 保存食')
      if (week === 1 || week === 3) periodicTasks.push('(午後) モップ')
      else periodicTasks.push('(午後) 冷凍庫掃除 ※谷口担当')
    }
    if (dow === 0) {
      if (week === 1 || week === 3) {
        periodicTasks.push('換気扇掃除', '毎月の掃除')
      } else {
        periodicTasks.push('モップ', '毎月の掃除')
      }
    }

    // ── ウォーニング ───────────────────────────────
    const warnings: string[] = []

    // 管理栄養士が出勤しているか
    const kanriPresent = KANRI_EIYOSHI.some(sid => isWorking(shifts[sid]))
    if (!kanriPresent) {
      warnings.push('管理栄養士（副島・西久保）が不在です')
    }

    // 希望休が多すぎて人手不足になっていないか
    const workingCount = STAFF_IDS.filter(sid => isWorking(shifts[sid])).length
    if (workingCount < 2 && !isClosed) {
      warnings.push(`出勤者が${workingCount}名と少ない可能性があります`)
    }

    result.push({
      date: dateStr,
      day,
      weekday: WEEKDAY_JP[dow],
      isHoliday,
      holidayName: holidays[dateStr],
      isClosed,
      shifts,
      periodicTasks,
      warnings,
    })
  }

  return result
}

// 全シフト種別一覧（編集ダイアログ用）
export const ALL_SHIFTS: ShiftType[] = [
  '早出', '日勤', '遅出', '遅出*', '9事務', '9遅出', '8-13', '9-13', '自宅', '休み', '希望休',
]
