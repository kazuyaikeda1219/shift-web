// 日本の祝日リスト（毎年追記）
export const HOLIDAYS: string[] = [
  // 2025
  '2025-01-01','2025-01-13','2025-02-11','2025-02-23','2025-02-24',
  '2025-03-20','2025-04-29','2025-05-03','2025-05-04','2025-05-05','2025-05-06',
  '2025-07-21','2025-08-11','2025-09-15','2025-09-23','2025-10-13',
  '2025-11-03','2025-11-23','2025-11-24','2025-12-23',
  // 2026
  '2026-01-01','2026-01-12','2026-02-11','2026-02-23',
  '2026-03-20','2026-04-29','2026-05-03','2026-05-04','2026-05-05',
  '2026-07-20','2026-08-11','2026-09-21','2026-09-22','2026-09-23',
  '2026-10-12','2026-11-03','2026-11-23','2026-12-23',
  // 2027
  '2027-01-01','2027-01-11','2027-02-11','2027-02-23',
  '2027-03-21','2027-04-29','2027-05-03','2027-05-04','2027-05-05',
  '2027-07-19','2027-08-11','2027-09-20','2027-09-23',
  '2027-10-11','2027-11-03','2027-11-23','2027-12-23',
]

export function getHolidaySet(): Set<string> {
  return new Set(HOLIDAYS)
}

// ── 動的祝日計算（栄養科シフト用） ────────────────────────────

function nthWeekday(year: number, month: number, weekday: number, n: number): number {
  const first = new Date(year, month - 1, 1).getDay()
  const offset = (weekday - first + 7) % 7
  return 1 + offset + (n - 1) * 7
}

function shunbun(year: number): number {
  if (year <= 1979) return Math.floor(20.8357 + 0.242194 * (year - 1980) - Math.floor((year - 1983) / 4))
  if (year <= 2099) return Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4))
  return Math.floor(21.851 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4))
}

function shubun(year: number): number {
  if (year <= 1979) return Math.floor(23.2588 + 0.242194 * (year - 1980) - Math.floor((year - 1983) / 4))
  if (year <= 2099) return Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4))
  return Math.floor(24.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4))
}

function fmt(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function getHolidays(year: number): Record<string, string> {
  const h: Record<string, string> = {}
  const add = (month: number, day: number, name: string) => { h[fmt(year, month, day)] = name }

  add(1, 1, '元日')
  add(1, nthWeekday(year, 1, 1, 2), '成人の日')
  add(2, 11, '建国記念の日')
  add(2, 23, '天皇誕生日')
  add(3, shunbun(year), '春分の日')
  add(4, 29, '昭和の日')
  add(5, 3, '憲法記念日')
  add(5, 4, 'みどりの日')
  add(5, 5, 'こどもの日')
  add(7, nthWeekday(year, 7, 1, 3), '海の日')
  add(8, 11, '山の日')
  add(9, nthWeekday(year, 9, 1, 3), '敬老の日')
  add(9, shubun(year), '秋分の日')
  add(10, nthWeekday(year, 10, 1, 2), 'スポーツの日')
  add(11, 3, '文化の日')
  add(11, 23, '勤労感謝の日')

  // 振替休日
  const baseKeys = Object.keys(h).sort()
  for (const key of baseKeys) {
    const d = new Date(key)
    if (d.getDay() === 0) {
      const next = new Date(d)
      next.setDate(next.getDate() + 1)
      const nextKey = fmt(next.getFullYear(), next.getMonth() + 1, next.getDate())
      if (!h[nextKey]) h[nextKey] = '振替休日'
    }
  }

  // 国民の休日
  const allKeys = Object.keys(h).sort()
  for (const key of allKeys) {
    const d = new Date(key)
    const prev = new Date(d); prev.setDate(prev.getDate() - 1)
    const next = new Date(d); next.setDate(next.getDate() + 1)
    const prevKey = fmt(prev.getFullYear(), prev.getMonth() + 1, prev.getDate())
    const nextKey = fmt(next.getFullYear(), next.getMonth() + 1, next.getDate())
    if (h[prevKey] && h[nextKey] && !h[key] && d.getDay() !== 0 && d.getDay() !== 6) {
      h[key] = '国民の休日'
    }
  }

  return h
}

export function getMonthHolidays(year: number, month: number): Record<string, string> {
  const all = getHolidays(year)
  const prefix = `${year}-${String(month).padStart(2, '0')}-`
  const result: Record<string, string> = {}
  for (const [k, v] of Object.entries(all)) {
    if (k.startsWith(prefix)) result[k] = v
  }
  return result
}
