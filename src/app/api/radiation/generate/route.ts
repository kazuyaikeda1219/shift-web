import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import {
  generateRadiationShift, RadiationStaff, RadiationConfig, Locks, DEFAULT_CONFIG,
} from '@/lib/radiationShiftEngine'
import { getHolidaySet } from '@/lib/holidays'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const { year, month } = await req.json()

  const [staffRes, reqRes, cfgRes] = await Promise.all([
    supabase.from('radiation_staff').select('*').order('sort_order'),
    supabase.from('radiation_requests').select('*').eq('year', year).eq('month', month),
    supabase.from('radiation_config').select('*').eq('id', 1).single(),
  ])
  if (staffRes.error) return NextResponse.json({ error: staffRes.error.message }, { status: 500 })
  if (reqRes.error)   return NextResponse.json({ error: reqRes.error.message }, { status: 500 })

  const staff = (staffRes.data ?? []) as RadiationStaff[]
  if (staff.length === 0)
    return NextResponse.json({ error: 'スタッフが登録されていません' }, { status: 400 })

  const locks: Locks = {}
  for (const r of reqRes.data ?? []) {
    if (!locks[r.staff_id]) locks[r.staff_id] = {}
    locks[r.staff_id][r.day] = r.kubun
  }

  const c = cfgRes.data
  const config: RadiationConfig = {
    anchor_monday:         c?.anchor_monday         ?? DEFAULT_CONFIG.anchor_monday,
    sat_work_week0:        c?.sat_work_week0         ?? DEFAULT_CONFIG.sat_work_week0,
    weekday_hayaban_week0: c?.weekday_hayaban_week0  ?? DEFAULT_CONFIG.weekday_hayaban_week0,
    sat_hayaban_first:     c?.sat_hayaban_first      ?? DEFAULT_CONFIG.sat_hayaban_first,
  }

  const holidays = getHolidaySet()
  const { grid, ndays, warnings } = generateRadiationShift(staff, locks, year, month, config, holidays)

  const pad = (n: number) => String(n).padStart(2, '0')
  const firstDay = `${year}-${pad(month)}-01`
  const lastDay = `${year}-${pad(month)}-${ndays}`

  const rows: { year: number; month: number; date: string; staff_id: string; position: string; is_draft: boolean }[] = []
  for (const s of staff) {
    for (let d = 1; d <= ndays; d++) {
      const pos = grid[s.id]?.[d] ?? ''
      if (pos === '') continue
      rows.push({ year, month, date: `${year}-${pad(month)}-${pad(d)}`, staff_id: s.id, position: pos, is_draft: true })
    }
  }

  // 当月分を削除してから挿入
  const { error: delErr } = await supabase
    .from('radiation_shifts').delete().gte('date', firstDay).lte('date', lastDay)
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  const { error: insErr } = await supabase
    .from('radiation_shifts').upsert(rows, { onConflict: 'date,staff_id' })
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

  return NextResponse.json({ ok: true, warnings, days: ndays })
}
