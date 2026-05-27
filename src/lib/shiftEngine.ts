// シフト生成エンジン
export type Position =
  | 'A' | 'B' | 'C' | 'D'
  | 'E1' | 'E2' | 'E3' | 'E4'  // ★付き番号あり
  | 'E'                          // ★なし番号なし
  | '全休' | '午前半休' | '午後半休' | '－'

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

// 土曜午後勤務登録
export interface SaturdayEntry {
  year: number
  month: number
  day: number
  a_staff_id: StaffId    // A担当（午後まで）
  e1_staff_id: StaffId   // E①担当（午後まで）
}

export interface DayAssignment {
  date: string
  weekday: string
  is_closed: boolean
  is_heavy: boolean
  is_saturday: boolean
  assignments: Record<StaffId, Position>
  saturday_pm: StaffId[]  // 土曜午後稼働の人（A・E①担当）
}

const WEEKDAY_JP = ['月', '火', '水', '木', '金', '土', '日']
const HEAVY_DAYS = ['月', '水']

function weekdayJp(d: Date): string {
  const utcDay = d.getUTCDay()
  return WEEKDAY_JP[utcDay === 0 ? 6 : utcDay - 1]
}

function weekOfMonth(d: Date): number {
  return Math.floor((d.getDate() - 1) / 7) + 1
}

export function isClosed(d: Date, holidays: Set<string>): boolean {
  const dow = d.getUTCDay()
  const dateStr = d.toISOString().slice(0, 10)
  if (dow === 0) return true
  if (holidays.has(dateStr)) return true
  if (dow === 6 && weekOfMonth(d) % 2 === 1) return true
  return false
}

function isSaturday(d: Date): boolean {
  return d.getUTCDay() === 6
}

function blocked(
  sid: StaffId,
  isE: boolean,
  pos: string,
  halfAm: Set<StaffId>,
  halfPm: Set<StaffId>
): boolean {
  if (isE && (halfAm.has(sid) || halfPm.has(sid))) return true
  if (pos === 'D' && halfPm.has(sid)) return true
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
    const prevIsE = ['E1','E2','E3','E4','E'].includes(prev)
    const curIsE  = isESlot

    if (curIsE && prevIsE) sc += 80
    else if (!curIsE && prev === posKey) sc += 100

    if (curIsE) {
      const eTotal = (['E1','E2','E3','E4','E'] as const)
        .reduce((a, k) => a + (posCount[s]?.[k] ?? 0), 0)
      sc += eTotal * 12
      if (isHeavy) sc += (heavyECount[s] ?? 0) * 8
    } else {
      sc += (posCount[s]?.[posKey] ?? 0) * 10
    }

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
  saturdayEntries: SaturdayEntry[],
): { result: DayAssignment[], warnings: string[] } {
  const warnings: string[] = []
  const result: DayAssignment[] = []

  const sortedStaff = [...staffList].sort((a, b) => a.sort_order - b.sort_order)
  const staffIds    = sortedStaff.map(s => s.id)
  const usStaff     = new Set(staffList.filter(s => s.can_us).map(s => s.id))

  const reqMap: Record<string, Record<StaffId, string>> = {}
  for (const r of requests) {
    const key = `${r.year}-${String(r.month).padStart(2,'0')}-${String(r.day).padStart(2,'0')}`
    if (!reqMap[key]) reqMap[key] = {}
    reqMap[key][r.staff_id] = r.kubun
  }

  // 土曜午後勤務マップ
  const satMap: Record<string, SaturdayEntry> = {}
  for (const s of saturdayEntries) {
    const key = `${s.year}-${String(s.month).padStart(2,'0')}-${String(s.day).padStart(2,'0')}`
    satMap[key] = s
  }

  const prevPos: Record<StaffId, string> = {}
  const posCount: Record<StaffId, Record<string, number>> = {}
  const heavyECount: Record<StaffId, number> = {}
  const e1Count: Record<StaffId, number> = {}
  for (const sid of staffIds) {
    posCount[sid] = {}
    heavyECount[sid] = 0
    e1Count[sid] = 0
  }

  const daysInMonth = new Date(year, month, 0).getDate()

  for (let day = 1; day <= daysInMonth; day++) {
    const d       = new Date(Date.UTC(year, month - 1, day))
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
        saturday_pm: [],
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
    const saturdayPm: StaffId[] = []

    if (isSat) {
      // ── 土曜（偶数週）のロジック ──
      const satEntry = satMap[dateStr]

      // A担当（午後まで・★のみ）
      let aPerson: StaffId | null = null
      if (satEntry?.a_staff_id && available.includes(satEntry.a_staff_id)) {
        aPerson = satEntry.a_staff_id
      } else {
        const aCands = available.filter(s => usStaff.has(s) && !assigned.has(s))
        aPerson = pickOne(aCands, assigned, prevPos, posCount, heavyECount, false, false, 'A')
      }
      if (aPerson) {
        assignment[aPerson] = 'A'
        assigned.add(aPerson)
        posCount[aPerson]['A'] = (posCount[aPerson]['A'] ?? 0) + 1
        prevPos[aPerson] = 'A'
        saturdayPm.push(aPerson)
      }

      // E①担当（午後まで・★のみ）
      let e1Person: StaffId | null = null
      if (satEntry?.e1_staff_id && available.includes(satEntry.e1_staff_id) && !assigned.has(satEntry.e1_staff_id)) {
        e1Person = satEntry.e1_staff_id
      } else {
        const e1Cands = available.filter(s => usStaff.has(s) && !assigned.has(s))
        const e1Sorted = [...e1Cands].sort((a, b) => {
          const diff = (e1Count[a] ?? 0) - (e1Count[b] ?? 0)
          if (diff !== 0) return diff
          return Math.random() - 0.5
        })
        e1Person = e1Sorted[0] ?? null
      }
      if (e1Person) {
        assignment[e1Person] = 'E1'
        assigned.add(e1Person)
        posCount[e1Person]['E1'] = (posCount[e1Person]['E1'] ?? 0) + 1
        e1Count[e1Person] = (e1Count[e1Person] ?? 0) + 1
        prevPos[e1Person] = 'E1'
        saturdayPm.push(e1Person)
      }

      // E②（★のみ・午前のみ）
      const e2Cands = available.filter(s => usStaff.has(s) && !assigned.has(s))
      const e2Person = pickOne(e2Cands, assigned, prevPos, posCount, heavyECount, false, true, 'E2')
      if (e2Person) {
        assignment[e2Person] = 'E2'
        assigned.add(e2Person)
        posCount[e2Person]['E2'] = (posCount[e2Person]['E2'] ?? 0) + 1
        prevPos[e2Person] = 'E2'
      }

      // B・C（誰でも可）
      for (const pos of ['B', 'C']) {
        const cands = available.filter(s => !assigned.has(s))
        const picked = pickOne(cands, assigned, prevPos, posCount, heavyECount, false, false, pos)
        if (picked) {
          assignment[picked] = pos as Position
          assigned.add(picked)
          posCount[picked][pos] = (posCount[picked][pos] ?? 0) + 1
          prevPos[picked] = pos
        }
      }

      // 残りはE（★なし・番号なし）
      for (const sid of available) {
        if (!assignment[sid]) {
          assignment[sid] = 'E'
          posCount[sid]['E'] = (posCount[sid]['E'] ?? 0) + 1
          prevPos[sid] = 'E'
        }
      }

    } else {
      // ── 平日のロジック ──
      const US_AB_MAX = 1
      for (const pos of ['A', 'B', 'C', 'D']) {
        let cands = available.filter(s => !assigned.has(s) && !blocked(s, false, pos, halfAm, halfPm))
        if (pos === 'A' || pos === 'B') {
          const usAbUsed = Object.entries(assignment)
            .filter(([sid, p]) => (p === 'A' || p === 'B') && usStaff.has(sid)).length
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

      // Eグループ（平日）
      const eCandidates = available.filter(s => !assigned.has(s) && !blocked(s, true, '', halfAm, halfPm))
      const eCount = Math.max(0, 4 - restCount)
      const eSelected: StaffId[] = []

      if (eCount > 0) {
        // ★候補
        const usECands = eCandidates.filter(s => usStaff.has(s))

        if (wd === '月') {
          // 月曜：★をE①・E②に優先配置
          // E①回数が最少かつ直前がE①でない★を選出
          const usSorted = [...usECands].sort((a, b) => {
            // 直前がE①の場合は強いペナルティ
            const aPrevE1 = prevPos[a] === 'E1' ? 50 : 0
            const bPrevE1 = prevPos[b] === 'E1' ? 50 : 0
            const aScore = (e1Count[a] ?? 0) + aPrevE1
            const bScore = (e1Count[b] ?? 0) + bPrevE1
            if (aScore !== bScore) return aScore - bScore
            return Math.random() - 0.5
          })
          // E①に1名（★）
          if (usSorted[0]) {
            eSelected.push(usSorted[0])
            e1Count[usSorted[0]] = (e1Count[usSorted[0]] ?? 0) + 1
          }
          // E②にもう1名（★・E①と別人）
          if (usSorted[1]) eSelected.push(usSorted[1])
          // 残り枠
          const remAssigned = new Set<StaffId>(eSelected)
          for (let i = eSelected.length; i < eCount; i++) {
            const remaining = eCandidates.filter(s => !remAssigned.has(s))
            const picked = pickOne(remaining, remAssigned, prevPos, posCount, heavyECount, isHeavy, true, 'E')
            if (picked) { eSelected.push(picked); remAssigned.add(picked) }
          }
        } else {
          // 通常：E①に★1名確保
          if (usECands.length > 0) {
            const usSorted = [...usECands].sort((a, b) => {
              // 直前がE①なら強いペナルティ（連続防止）
              const aPrevE1 = prevPos[a] === 'E1' ? 30 : 0
              const bPrevE1 = prevPos[b] === 'E1' ? 30 : 0
              const aScore = (e1Count[a] ?? 0) * 3 + aPrevE1
              const bScore = (e1Count[b] ?? 0) * 3 + bPrevE1
              if (aScore !== bScore) return aScore - bScore
              const aPrevE = ['E1','E2','E3','E4','E'].includes(prevPos[a] ?? '') ? 1 : 0
              const bPrevE = ['E1','E2','E3','E4','E'].includes(prevPos[b] ?? '') ? 1 : 0
              if (aPrevE !== bPrevE) return aPrevE - bPrevE
              return (heavyECount[a] ?? 0) - (heavyECount[b] ?? 0)
            })
            eSelected.push(usSorted[0])
            e1Count[usSorted[0]] = (e1Count[usSorted[0]] ?? 0) + 1
          } else {
            warnings.push(`${dateStr}：Eグループに★を割り当てできません`)
          }
          const remAssigned = new Set<StaffId>(eSelected)
          for (let i = eSelected.length; i < eCount; i++) {
            const remaining = eCandidates.filter(s => !remAssigned.has(s))
            const picked = pickOne(remaining, remAssigned, prevPos, posCount, heavyECount, isHeavy, true, 'E')
            if (picked) { eSelected.push(picked); remAssigned.add(picked) }
          }
        }

        // 番号付与：★はE①〜、★なしはE
        // E①に入る★（先頭）
        const e1Sid = eSelected[0]
        const others = eSelected.slice(1)

        // ★かどうかでE番号 or E
        // sort_order順に並べて番号付与
        const usInE   = eSelected.filter(s => usStaff.has(s))
        const nonUsInE = eSelected.filter(s => !usStaff.has(s))

        // E①は選出された★の先頭（e1Count最少の人）、残りはsort_order順
        const e1Winner = eSelected[0]  // E①確定（既にe1Countで選ばれた人）
        const otherUs = usInE.filter(s => s !== e1Winner).sort((a, b) => {
          const oa = staffList.find(s => s.id === a)?.sort_order ?? 99
          const ob = staffList.find(s => s.id === b)?.sort_order ?? 99
          return oa - ob
        })
        const usFinal = [e1Winner, ...otherUs].filter(Boolean)
        const eStarSlots = ['E1','E2','E3','E4'] as const

        for (let i = 0; i < usFinal.length; i++) {
          const sid  = usFinal[i]
          const slot = eStarSlots[i]
          assignment[sid] = slot
          assigned.add(sid)
          posCount[sid][slot] = (posCount[sid][slot] ?? 0) + 1
          prevPos[sid] = slot
          if (isHeavy) heavyECount[sid] = (heavyECount[sid] ?? 0) + 1
        }

        // ★なしはE
        for (const sid of nonUsInE) {
          assignment[sid] = 'E'
          assigned.add(sid)
          posCount[sid]['E'] = (posCount[sid]['E'] ?? 0) + 1
          prevPos[sid] = 'E'
          if (isHeavy) heavyECount[sid] = (heavyECount[sid] ?? 0) + 1
        }
      }

      // 未配置は「－」
      for (const sid of available) {
        if (!assignment[sid]) assignment[sid] = '－'
      }
    }

    result.push({
      date: dateStr, weekday: wd,
      is_closed: false, is_heavy: isHeavy, is_saturday: isSat,
      assignments: assignment,
      saturday_pm: saturdayPm,
    })
  }

  return { result, warnings }
}