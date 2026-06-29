// =============================================================
// 看護師シフト 自動生成エンジン（Python generate_shift.py の移植）
// 夜勤割当 → 公休(✕)・日勤(日) 割当 を制約付きで行う。
// =============================================================

export type NightRole = '両方可' | '夜正のみ' | '夜副のみ'

export interface NurseStaff {
  id: string
  name: string
  qualification?: string | null
  night_ok: boolean
  night_role: NightRole
  max_night: number
  max_consec: number
  sort_order: number
  // ── 詳細条件 ──
  is_newbie?: boolean          // 新人（夜勤の必要人数にカウントしない）
  kokyu_override?: number | null // 月公休数の個別設定（null=全体設定に従う）
}

// 夜勤NG組み合わせ（同じ夜勤に入れない）
export type NgPair = { a: string; b: string }

// スタッフ別 曜日条件
// rule_type: 'no_night_dow'=その曜日は夜勤不可 / 'fixed_day_dow'=その曜日は日勤固定
// weekday: 0=月 .. 6=日（pyWeekday）
export type StaffRule = {
  staff_id: string
  rule_type: 'no_night_dow' | 'fixed_day_dow'
  weekday: number
}

// 希望休等のロック: { staff_id: { day: 記号 } }
export type Locks = Record<string, Record<number, string>>

export interface NurseConfig {
  // 曜日別 夜勤必要人数（index 0=月 .. 6=日）
  need_by_weekday: number[]
  // そのうち夜正（リーダー）の人数
  sei_count: number
  // 土曜の日勤人数
  day_sat: number
  // 日曜・祝日の日勤人数
  day_sun_holiday: number
  // 1人あたり公休(✕)目標日数。null=週末+祝日数から自動
  kokyu_target: number | null
  // 乱数シード。null=毎回ランダム
  seed: number | null
}

export const DEFAULT_CONFIG: NurseConfig = {
  // 月=2 火=3 水=2 木=3 金=3 土=3 日=2
  need_by_weekday: [2, 3, 2, 3, 3, 3, 2],
  sei_count: 1,
  day_sat: 5,
  day_sun_holiday: 3,
  kokyu_target: null,
  seed: null,
}

// ── 記号セット（Excel と完全一致） ─────────────────────────────
// 勤務扱い（連続勤務カウント対象）
export const WORK_SYMBOLS = new Set(['日', '夜正', '夜副', '/'])
// 「その日は働けない（休み確定）」とみなす記号
export const OFF_LOCK_SYMBOLS = new Set([
  '✕', '年', '/年', '年/', '振', '/振', '振/', '付', '/付', '付/',
  '看', '/看', '看/', '特', '/特', '特/', '非',
])

// シフト表で選べる全記号
export const SHIFT_OPTIONS = [
  '日', '夜正', '夜副', '非', '/', '✕',
  '年', '/年', '年/', '振', '/振', '振/',
  '付', '/付', '付/', '看', '/看', '看/',
  '特', '/特', '特/', '',
]
// 希望休入力で選べる記号
export const KIBO_OPTIONS = [
  '年', '/年', '年/', '振', '/振', '振/',
  '付', '/付', '付/', '看', '/看', '看/',
  '特', '/特', '特/', '✕',
]

export const WEEKDAY_JP = ['日', '月', '火', '水', '木', '金', '土'] // getDay() 0=日

// JS の getDay()(0=日) → Python weekday(0=月) へ変換
function pyWeekday(jsDay: number): number {
  return (jsDay + 6) % 7
}

// ── 乱数（seed指定時は決定的、未指定時は Math.random） ──────────
function makeRng(seed: number | null): () => number {
  if (seed === null || seed === undefined) return Math.random
  let s = (seed >>> 0) || 1
  return function () {
    // mulberry32
    s |= 0
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffleInPlace<T>(arr: T[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
}

function canBeSei(role: NightRole): boolean {
  return role === '両方可' || role === '夜正のみ'
}
function canBeFuku(role: NightRole): boolean {
  return role === '両方可' || role === '夜副のみ'
}

export interface GenerateResult {
  // grid[staff_id][day] = 記号
  grid: Record<string, Record<number, string>>
  ndays: number
  nights: Record<string, number>
  warnings: string[]
}

export function generateNurseShift(
  staff: NurseStaff[],
  ngPairs: NgPair[],
  locks: Locks,
  year: number,
  month: number,
  config: NurseConfig,
  holidays: Set<string> = new Set(),
  rules: StaffRule[] = [],
): GenerateResult {
  const rng = makeRng(config.seed)
  const ndays = new Date(year, month, 0).getDate()
  const ids = staff.map(s => s.id)
  const byId: Record<string, NurseStaff> = Object.fromEntries(staff.map(s => [s.id, s]))

  // NG をキー集合に
  const ngKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)
  const ngSet = new Set(ngPairs.map(p => ngKey(p.a, p.b)))

  // grid 初期化
  const grid: Record<string, Record<number, string>> = {}
  const nights: Record<string, number> = {}
  for (const id of ids) {
    grid[id] = {}
    for (let d = 1; d <= ndays; d++) grid[id][d] = ''
    nights[id] = 0
  }

  // 希望休を反映
  for (const id of ids) {
    const dm = locks[id] ?? {}
    for (const k of Object.keys(dm)) {
      const d = Number(k)
      if (d >= 1 && d <= ndays) grid[id][d] = dm[d]
    }
  }

  // ── スタッフ別 曜日条件をマップ化 ──
  const dowPy = (d: number) => pyWeekday(new Date(year, month - 1, d).getDay())
  const noNightDow: Record<string, Set<number>> = {}
  const fixedDayDow: Record<string, Set<number>> = {}
  for (const id of ids) { noNightDow[id] = new Set(); fixedDayDow[id] = new Set() }
  for (const r of rules) {
    if (!(r.staff_id in noNightDow)) continue
    if (r.rule_type === 'no_night_dow') noNightDow[r.staff_id].add(r.weekday)
    else if (r.rule_type === 'fixed_day_dow') fixedDayDow[r.staff_id].add(r.weekday)
  }

  // 「毎週○曜は日勤固定」を先に確定（空きセルのみ。希望休が優先）
  for (const id of ids) {
    if (fixedDayDow[id].size === 0) continue
    for (let d = 1; d <= ndays; d++) {
      if (grid[id][d] === '' && fixedDayDow[id].has(dowPy(d))) grid[id][d] = '日'
    }
  }

  const worked = (id: string, d: number): boolean => {
    const v = grid[id][d] ?? ''
    return WORK_SYMBOLS.has(v) || v === '夜正' || v === '夜副'
  }
  const consecBefore = (id: string, d: number): number => {
    let cnt = 1
    let dd = d - 1
    while (dd >= 1 && worked(id, dd)) {
      cnt++
      dd--
    }
    return cnt
  }

  // 曜日別 夜勤必要人数
  const needTotal = (d: number): number => {
    const wd = pyWeekday(new Date(year, month - 1, d).getDay())
    return config.need_by_weekday[wd] ?? 3
  }

  const warnings: string[] = []

  // ── 夜勤割当 ──────────────────────────────────────────────
  for (let d = 1; d <= ndays; d++) {
    const total = needTotal(d)
    const needSei = Math.min(config.sei_count, total)
    const needFuku = total - needSei

    const candidates = (roleOk: (r: NightRole) => boolean): string[] => {
      const out: string[] = []
      for (const id of ids) {
        const s = byId[id]
        if (!s.night_ok) continue
        if (s.is_newbie) continue                       // 新人は必要人数に数えない（夜勤自動配置の対象外）
        if (noNightDow[id].has(dowPy(d))) continue       // その曜日は夜勤不可
        if (!roleOk(s.night_role)) continue
        if (grid[id][d] !== '') continue
        if (nights[id] >= s.max_night) continue
        if (grid[id][d - 1] === '夜正' || grid[id][d - 1] === '夜副') continue
        if (consecBefore(id, d) > s.max_consec) continue
        // 翌日が既に勤務確定 → 明け非番が置けないので避ける
        if (d + 1 <= ndays) {
          const nx = grid[id][d + 1]
          if (nx !== undefined && nx !== '' && !OFF_LOCK_SYMBOLS.has(nx)) continue
        }
        out.push(id)
      }
      shuffleInPlace(out, rng)
      out.sort((a, b) => nights[a] - nights[b])
      return out
    }

    const chosen: string[] = []
    const ngOk = (id: string) => chosen.every(c => !ngSet.has(ngKey(id, c)))

    // 夜正
    let seiPlaced = 0
    for (const id of candidates(canBeSei)) {
      if (seiPlaced >= needSei) break
      if (ngOk(id)) {
        grid[id][d] = '夜正'
        nights[id]++
        chosen.push(id)
        if (d + 1 <= ndays && grid[id][d + 1] === '') grid[id][d + 1] = '非'
        seiPlaced++
      }
    }
    // 夜副
    let placed = 0
    for (const id of candidates(canBeFuku)) {
      if (placed >= needFuku) break
      if (chosen.includes(id)) continue
      if (ngOk(id)) {
        grid[id][d] = '夜副'
        nights[id]++
        chosen.push(id)
        if (d + 1 <= ndays && grid[id][d + 1] === '') grid[id][d + 1] = '非'
        placed++
      }
    }

    if (seiPlaced + placed < total) {
      warnings.push(`${month}/${d} の夜勤が必要${total}名に対し${seiPlaced + placed}名しか配置できませんでした`)
    }
  }

  // ── 公休(✕)・日勤(日) 割当 ───────────────────────────────
  const dateStr = (d: number) => `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  const isHoliday = (d: number) => holidays.has(dateStr(d))
  const jsDow = (d: number) => new Date(year, month - 1, d).getDay() // 0=日,6=土
  const isWeekendDay = (d: number) => {
    const w = jsDow(d)
    return w === 0 || w === 6 || isHoliday(d)
  }
  // その日の日勤目標人数（祝日優先 → 土曜 → 日曜）
  const dayHeadcount = (d: number): number => {
    if (isHoliday(d)) return config.day_sun_holiday
    const w = jsDow(d)
    if (w === 6) return config.day_sat
    if (w === 0) return config.day_sun_holiday
    return -1 // 平日（人数固定なし）
  }

  // 公休(✕)目標日数（自動時は 土日祝の日数）
  let kokyuTarget = config.kokyu_target
  if (kokyuTarget === null || kokyuTarget === undefined) {
    let cnt = 0
    for (let d = 1; d <= ndays; d++) if (isWeekendDay(d)) cnt++
    kokyuTarget = cnt
  }

  // すでに入っている ✕（希望休由来）をカウント
  const xCount: Record<string, number> = {}
  const weWork: Record<string, number> = {} // 週末・祝日の日勤回数（公平ローテ用）
  for (const id of ids) {
    xCount[id] = 0
    weWork[id] = 0
    for (let d = 1; d <= ndays; d++) if (grid[id][d] === '✕') xCount[id]++
  }

  // ── フェーズ1：土日祝（日勤人数を固定し、残りは公休✕） ──────────
  for (let d = 1; d <= ndays; d++) {
    if (!isWeekendDay(d)) continue
    // 日勤固定で既に「日」が入っている人数を差し引いた残り目標
    const preDay = ids.filter(id => grid[id][d] === '日').length
    const headcount = Math.max(0, dayHeadcount(d) - preDay)
    const available = ids.filter(id => grid[id][d] === '')
    // 連勤上限を超えずに働ける人 / 強制休みの人 を分ける
    const canWork: string[] = []
    for (const id of available) {
      if (consecBefore(id, d) > (byId[id].max_consec || 99)) grid[id][d] = '✕'
      else canWork.push(id)
    }
    // 週末勤務が少ない人を優先して働かせる（＝休みを公平に回す）
    shuffleInPlace(canWork, rng)
    canWork.sort((a, b) => weWork[a] - weWork[b])
    const hc = Math.min(headcount, canWork.length)
    if (preDay + canWork.length < dayHeadcount(d)) {
      warnings.push(`${month}/${d} の日勤が${dayHeadcount(d)}名に対し${preDay + canWork.length}名しか配置できませんでした`)
    }
    for (let i = 0; i < canWork.length; i++) {
      const id = canWork[i]
      if (i < hc) {
        grid[id][d] = '日'
        weWork[id]++
      } else {
        grid[id][d] = '✕'
        xCount[id]++
      }
    }
  }
  // consec超過で✕にした分も含め再集計（取りこぼし防止）
  for (const id of ids) {
    let c = 0
    for (let d = 1; d <= ndays; d++) if (grid[id][d] === '✕') c++
    xCount[id] = c
  }

  // ── フェーズ2：平日（各人の不足公休を、平日の✕負荷が均等になるよう配置） ──
  // 平日ごとの✕負荷を平準化することで、各平日の日勤人数を平均的に保つ。
  const dayXLoad: Record<number, number> = {}
  for (let d = 1; d <= ndays; d++) if (!isWeekendDay(d)) dayXLoad[d] = 0

  // まず全平日の空きセルを暫定で日勤に
  for (const id of ids) {
    for (let d = 1; d <= ndays; d++) {
      if (grid[id][d] === '' && !isWeekendDay(d)) grid[id][d] = '日'
    }
  }

  // 各人の不足公休数だけ、負荷の低い平日を選んで✕に振替
  const order = [...ids]
  shuffleInPlace(order, rng)
  for (const id of order) {
    const target = byId[id].kokyu_override ?? kokyuTarget // 個別の月公休数を優先
    const remainingX = Math.max(0, target - xCount[id])
    if (remainingX <= 0) continue
    const freeWk: number[] = []
    for (let d = 1; d <= ndays; d++) if (grid[id][d] === '日' && !isWeekendDay(d)) freeWk.push(d)
    // ✕負荷が低い平日を優先（同負荷はランダム）
    shuffleInPlace(freeWk, rng)
    freeWk.sort((a, b) => dayXLoad[a] - dayXLoad[b])
    const take = Math.min(remainingX, freeWk.length)
    for (let i = 0; i < take; i++) {
      const d = freeWk[i]
      grid[id][d] = '✕'
      xCount[id]++
      dayXLoad[d]++
    }
  }

  // 連続超過の最終補正：直前の【平日】日勤を✕に振替（土日祝の人数は維持）
  for (const id of ids) {
    const limit = byId[id].max_consec || 99
    let guard = 0
    while (guard < ndays * 2) {
      guard++
      let run = 0
      let overAt: number | null = null
      for (let d = 1; d <= ndays; d++) {
        run = WORK_SYMBOLS.has(grid[id][d]) ? run + 1 : 0
        if (run > limit) {
          overAt = d
          break
        }
      }
      if (overAt === null) break
      let fixed = false
      for (let dd = overAt; dd >= 1; dd--) {
        if (grid[id][dd] === '日' && !isWeekendDay(dd)) {
          grid[id][dd] = '✕'
          fixed = true
          break
        }
      }
      if (!fixed) break
    }
  }

  return { grid, ndays, nights, warnings }
}

// 個人別集計（表示用）
export function summarize(grid: Record<string, Record<number, string>>, id: string, ndays: number) {
  let nichi = 0, sei = 0, fuku = 0, kokyu = 0, nen = 0, hi = 0
  for (let d = 1; d <= ndays; d++) {
    const v = grid[id]?.[d] ?? ''
    if (v === '日' || v === '/') nichi++
    else if (v === '夜正') sei++
    else if (v === '夜副') fuku++
    else if (v === '✕') kokyu++
    else if (v === '非') hi++
    else if (v.includes('年')) nen += v === '年' ? 1 : 0.5
    if (v.startsWith('/') || v.endsWith('/')) nichi += 0.5
  }
  return { nichi, sei, fuku, kokyu, nen, hi, yakei: sei + fuku }
}
