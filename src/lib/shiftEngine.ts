// シフト生成エンジン
// E1〜E4: Eグループ（4名）、スタッフ並び順で番号付与
// 制約: 4名のうち必ず1名はUS担当者（★）を含む

export type Position = 'A' | 'B' | 'C' | 'D' | 'E1' | 'E2' | 'E3' | 'E4' | '全休' | '午前半休' | '午後半休' | '－'
export type StaffId = string

export interface Staff {
  id: StaffId
  name: string
  can_us: boolean
  sort_order: number
}

export interface RequestEntry {
  year: number
  month: number
  day: number
  staff_id: StaffId
  kubun: '全休' | '午前半休' | '午後半休'
}

export interface DayAssignment {
  date: string
  weekday: string
  is_closed: boolean
  is_heavy: boolean
  is_saturday: boolean
  assignments: Record<StaffId, Position>
}

const WEEKDAY_JP = ['月', '火', '水', '木', '金', '土', '日']
const HEAVY_DAYS = ['月', '水']

function weekdayJp(d: Date): string {
  return WEEKDAY_JP[d.getDay() === 0 ? 6 : d.getDay() - 1]
}

function weekOfMonth(d: Date): number {
  return Math.floor((d.getDate() - 1) / 7) + 1
}

export function isClosed(d: Date, holidays: Set<string>): boolean {
  const dow = d.getDay()
  const dateStr = d.toISOString().slice(0, 10)
  if (dow === 0) return true
  if (holidays.has(dateStr)) return true
  if (dow === 6 && weekOfMonth(d) % 2 === 1) return true
  return false
}

function isSaturday(d: Date): boolean {
  return d.getDay() === 6
}

// 半休による配置制限
function blocked(sid: StaffId, isE: boolean, pos: string, halfAm: Set<StaffId>, halfPm: Set<StaffId>): boolean {
  if (isE && (halfAm.has(sid) || halfPm.has(sid))) return true   // E系は半休全員NG
  if (pos === 'D' && halfPm.has(sid)) return true                 // 午後半休はD不可
  return false
}

function pickOne(
  candidates: StaffId[],
  assigned: Set<StaffId>,
  prevPos: Record<StaffId, string>,
  posCount: Record<StaffId, Record<string, number>>,
  heavyECount: Record<StaffId, number>,
  isHeavy: boolean,
  isESlot: boolean,
  posKey: string,
): StaffId | null {
  const valid = candidates.filter(s => !assigned.has(s))
  if (valid.length === 0) return null

  function score(s: StaffId): number {
    let sc = 0
    const prev    = prevPos[s] ?? ''
    const prevIsE = ['E1','E2','E3','E4'].includes(prev)
    const curIsE  = isESlot

    // 連続同配置ペナルティ
    if (curIsE && prevIsE) sc += 80
    else if (!curIsE && prev === posKey) sc += 100

    if (posKey === 'E1') {
      // ── E①専用スコア：E全体合計と切り離して個別管理 ──
      const e1Count = posCount[s]?.['E1'] ?? 0
      sc += e1Count * 30                              // E①回数に強いペナルティ
      if (isHeavy) sc += (heavyECount[s] ?? 0) * 15  // 月・水偏り防止
    } else if (curIsE) {
      // ── E②③④：E全体合計で均等化 ──
      const eTotal = (['E1','E2','E3','E4'] as const)
        .reduce((a, k) => a + (posCount[s]?.[k] ?? 0), 0)
      sc += eTotal * 12
      if (isHeavy) sc += (heavyECount[s] ?? 0) * 8
    } else {
      // ── A/B/C/D：配置ごとの回数で均等化 ──
      sc += (posCount[s]?.[posKey] ?? 0) * 10
    }

    // 総出勤数均等化
    const total = Object.values(posCount[s] ?? {}).reduce((a, b) => a + b, 0)
    sc += total * 2
    sc += Math.random()
    return sc
  }

  valid.sort((a, b) => score(a) - score(b))
  return valid[0]
}

export function generateMonth(
  year: number,
  month: number,
  staffList: Staff[],
  requests: RequestEntry[],
  holidays: Set<string>,
): { result: DayAssignment[], warnings: string[] } {
  const warnings: string[] = []
  const result: DayAssignment[] = []

  // sort_order順に並べたスタッフID（番号付与の基準）
  const sortedStaff = [...staffList].sort((a, b) => a.sort_order - b.sort_order)
  const staffIds    = sortedStaff.map(s => s.id)
  const usStaff     = new Set(staffList.filter(s => s.can_us).map(s => s.id))

  const reqMap: Record<string, Record<StaffId, string>> = {}
  for (const r of requests) {
    const key = `${r.year}-${String(r.month).padStart(2,'0')}-${String(r.day).padStart(2,'0')}`
    if (!reqMap[key]) reqMap[key] = {}
    reqMap[key][r.staff_id] = r.kubun
  }

  const prevPos: Record<StaffId, string> = {}
  const posCount: Record<StaffId, Record<string, number>> = {}
  const heavyECount: Record<StaffId, number> = {}
  for (const sid of staffIds) { posCount[sid] = {}; heavyECount[sid] = 0 }

  const daysInMonth = new Date(year, month, 0).getDate()

  for (let day = 1; day <= daysInMonth; day++) {
    const d       = new Date(year, month - 1, day)
    const dateStr = d.toISOString().slice(0, 10)
    const wd      = weekdayJp(d)
    const closed  = isClosed(d, holidays)
    const isHeavy = HEAVY_DAYS.includes(wd)
    const isSat   = isSaturday(d)

    if (closed) {
      result.push({
        date: dateStr, weekday: wd,
        is_closed: true, is_heavy: false, is_saturday: isSat,
        assignments: Object.fromEntries(staffIds.map(sid => [sid, '全休'])) as Record<StaffId, Position>,
      })
      continue
    }

    const dayReq   = reqMap[dateStr] ?? {}
    const restIds  = new Set(Object.entries(dayReq).filter(([,k]) => k === '全休').map(([s]) => s))
    const halfAm   = new Set(Object.entries(dayReq).filter(([,k]) => k === '午前半休').map(([s]) => s))
    const halfPm   = new Set(Object.entries(dayReq).filter(([,k]) => k === '午後半休').map(([s]) => s))
    const available = staffIds.filter(sid => !restIds.has(sid))
    const restCount = restIds.size

    const assignment: Record<StaffId, Position> = {}
    for (const sid of restIds) assignment[sid] = '全休'
    for (const sid of halfAm)  assignment[sid] = '午前半休'
    for (const sid of halfPm)  assignment[sid] = '午後半休'

    const assigned = new Set<StaffId>()

    // ── A/B/C/D を割り当て ──
    const US_AB_MAX = 1
    for (const pos of ['A', 'B', 'C', 'D']) {
      let cands = available.filter(s => !assigned.has(s) && !blocked(s, false, pos, halfAm, halfPm))
      if (pos === 'A' || pos === 'B') {
        const usAbUsed = Object.entries(assignment).filter(([sid, p]) => (p === 'A' || p === 'B') && usStaff.has(sid)).length
        if (usAbUsed >= US_AB_MAX) cands = cands.filter(s => !usStaff.has(s))
      }
      const picked = pickOne(cands, assigned, prevPos, posCount, heavyECount, isHeavy, false, pos)
      if (picked) {
        assignment[picked] = pos as Position
        assigned.add(picked)
        posCount[picked][pos] = (posCount[picked][pos] ?? 0) + 1
        prevPos[picked] = pos
      } else {
        warnings.push(`${dateStr} (${pos})：割り当て可能なスタッフ不足`)
      }
    }

// ── Eグループ4名を選出 ──
    const eCandidates = available.filter(s => !assigned.has(s) && !blocked(s, true, '', halfAm, halfPm))
    const eCount = Math.max(0, 4 - restCount)

    const eSelected: StaffId[] = []

    if (eCount > 0) {
      // E①担当者（★）を確定的に選出
      // 「E①回数が最少」→「直前がE系でない」→「月水E回数が最少」の優先順で決定
      const usECands = eCandidates.filter(s => usStaff.has(s))
      if (usECands.length > 0) {
        const usSorted = [...usECands].sort((a, b) => {
          // ① E①回数が少ない順（最優先）
          const e1Diff = (posCount[a]?.['E1'] ?? 0) - (posCount[b]?.['E1'] ?? 0)
          if (e1Diff !== 0) return e1Diff
          // ② 直前がE系でない人を優先
          const aPrevE = ['E1','E2','E3','E4'].includes(prevPos[a] ?? '') ? 1 : 0
          const bPrevE = ['E1','E2','E3','E4'].includes(prevPos[b] ?? '') ? 1 : 0
          if (aPrevE !== bPrevE) return aPrevE - bPrevE
          // ③ 月・水のE担当回数が少ない順
          const heavyDiff = (heavyECount[a] ?? 0) - (heavyECount[b] ?? 0)
          if (heavyDiff !== 0) return heavyDiff
          // ④ 乱数（同条件時）
          return Math.random() - 0.5
        })
        eSelected.push(usSorted[0])
      } else {
        warnings.push(`${dateStr}：Eグループに★（US担当者）を割り当てできません`)
      }

      // 残り枠（E②③④）をスコアで選出
      const remAssigned = new Set<StaffId>(eSelected)
      for (let i = eSelected.length; i < eCount; i++) {
        const remaining = eCandidates.filter(s => !remAssigned.has(s))
        const picked = pickOne(remaining, remAssigned, prevPos, posCount, heavyECount, isHeavy, true, 'Eb')
        if (picked) {
          eSelected.push(picked)
          remAssigned.add(picked)
        }
      }
    }

// E①は先頭（US担当者）、E②③④はE②③④回数が少ない順に割り当て
    const e1Person   = eSelected[0]  // US担当者（確定）
    const ebPersons  = eSelected.slice(1)  // 残り

    // E②③④をそれぞれの回数が少ない順に割り当て
    const ebSlots = ['E2','E3','E4'] as const
    // 各スロットの累計回数が少ない人から順に割り当て
    const ebSorted = [...ebPersons].sort((a, b) => {
      const aTotal = (posCount[a]?.['E2'] ?? 0) + (posCount[a]?.['E3'] ?? 0) + (posCount[a]?.['E4'] ?? 0)
      const bTotal = (posCount[b]?.['E2'] ?? 0) + (posCount[b]?.['E3'] ?? 0) + (posCount[b]?.['E4'] ?? 0)
      if (aTotal !== bTotal) return aTotal - bTotal
      return Math.random() - 0.5
    })

    // E①を割り当て
    if (e1Person) {
      assignment[e1Person] = 'E1'
      assigned.add(e1Person)
      posCount[e1Person]['E1'] = (posCount[e1Person]['E1'] ?? 0) + 1
      prevPos[e1Person] = 'E1'
      if (isHeavy) heavyECount[e1Person] = (heavyECount[e1Person] ?? 0) + 1
    }

// E②③④を割り当て（人ごとのE②③④合計回数で均等化、スロットはランダム）
    const ebSlotsList = ebSlots.slice(0, ebSorted.length)
    // スロットをシャッフル
    const shuffledSlots = [...ebSlotsList].sort(() => Math.random() - 0.5)

    for (let i = 0; i < ebSorted.length; i++) {
      const sid  = ebSorted[i]
      const slot = shuffledSlots[i]
      assignment[sid] = slot
      assigned.add(sid)
      posCount[sid][slot] = (posCount[sid][slot] ?? 0) + 1
      prevPos[sid] = slot
      if (isHeavy) heavyECount[sid] = (heavyECount[sid] ?? 0) + 1
    }

    // 未配置は「－」
    for (const sid of available) {
      if (!assignment[sid]) assignment[sid] = '－'
    }

    result.push({ date: dateStr, weekday: wd, is_closed: false, is_heavy: isHeavy, is_saturday: isSat, assignments: assignment })
  }

  return { result, warnings }
}
