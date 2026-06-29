import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import {
  generateNurseShift, NurseStaff, NgPair, Locks, NurseConfig, StaffRule,
} from '@/lib/nurseShiftEngine'
import { getHolidaySet } from '@/lib/holidays'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const { year, month, pattern_name } = await req.json()

  const [staffRes, ngRes, reqRes, cfgRes, rulesRes] = await Promise.all([
    supabase.from('nurse_staff').select('*').order('sort_order'),
    supabase.from('nurse_ng_pairs').select('*'),
    supabase.from('nurse_requests').select('*').eq('year', year).eq('month', month),
    supabase.from('nurse_config').select('*').eq('id', 1).single(),
    supabase.from('nurse_staff_rules').select('*'),
  ])
  if (staffRes.error) return NextResponse.json({ error: staffRes.error.message }, { status: 500 })
  if (ngRes.error)    return NextResponse.json({ error: ngRes.error.message }, { status: 500 })
  if (reqRes.error)   return NextResponse.json({ error: reqRes.error.message }, { status: 500 })

  const staff = (staffRes.data ?? []) as NurseStaff[]
  if (staff.length === 0)
    return NextResponse.json({ error: 'スタッフが登録されていません' }, { status: 400 })

  const ngPairs: NgPair[] = (ngRes.data ?? []).map(r => ({ a: r.staff_a, b: r.staff_b }))

  const locks: Locks = {}
  for (const r of reqRes.data ?? []) {
    if (!locks[r.staff_id]) locks[r.staff_id] = {}
    locks[r.staff_id][r.day] = r.symbol
  }

  const c = cfgRes.data
  const config: NurseConfig = {
    need_by_weekday: c
      ? [c.need_mon, c.need_tue, c.need_wed, c.need_thu, c.need_fri, c.need_sat, c.need_sun]
      : [2, 3, 2, 3, 3, 3, 2],
    sei_count: c?.sei_count ?? 1,
    day_sat: c?.day_sat ?? 5,
    day_sun_holiday: c?.day_sun_holiday ?? 3,
    kokyu_target: c?.kokyu_target ?? null,
    seed: c?.seed ?? null,
  }

  const rules: StaffRule[] = (rulesRes.data ?? []).map(r => ({
    staff_id: r.staff_id, rule_type: r.rule_type, weekday: r.weekday,
  }))

  const holidays = getHolidaySet()
  const { grid, ndays, warnings } = generateNurseShift(staff, ngPairs, locks, year, month, config, holidays, rules)

  const pad = (n: number) => String(n).padStart(2, '0')
  const firstDay = `${year}-${pad(month)}-01`
  const lastDay = `${year}-${pad(month)}-${ndays}`

  const rows: { year: number; month: number; date: string; staff_id: string; symbol: string; is_draft: boolean }[] = []
  for (const s of staff) {
    for (let d = 1; d <= ndays; d++) {
      const sym = grid[s.id]?.[d] ?? ''
      if (sym === '') continue
      rows.push({ year, month, date: `${year}-${pad(month)}-${pad(d)}`, staff_id: s.id, symbol: sym, is_draft: true })
    }
  }

  // 当月分を削除してから挿入
  const { error: delErr } = await supabase
    .from('nurse_shifts').delete().gte('date', firstDay).lte('date', lastDay)
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  const { error: insErr } = await supabase
    .from('nurse_shifts').upsert(rows, { onConflict: 'date,staff_id' })
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

  // 下書きパターン保存
  if (pattern_name) {
    const draftRows = rows.map(r => ({
      year, month, pattern_name, date: r.date, staff_id: r.staff_id, symbol: r.symbol,
    }))
    await supabase.from('nurse_shifts_draft').delete()
      .eq('year', year).eq('month', month).eq('pattern_name', pattern_name)
    if (draftRows.length) await supabase.from('nurse_shifts_draft').insert(draftRows)
  }

  return NextResponse.json({ ok: true, warnings, days: ndays })
}
