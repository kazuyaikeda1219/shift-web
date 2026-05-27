import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { generateMonth, RequestEntry, SaturdayEntry } from '@/lib/shiftEngine'
import { getHolidaySet } from '@/lib/holidays'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const { year, month } = await req.json()

  const [staffRes, reqRes, satRes] = await Promise.all([
    supabase.from('staff').select('*').order('sort_order'),
    supabase.from('requests').select('*').eq('year', year).eq('month', month),
    supabase.from('saturday_entries').select('*').eq('year', year).eq('month', month),
  ])

  if (staffRes.error) return NextResponse.json({ error: staffRes.error.message }, { status: 500 })
  if (reqRes.error)   return NextResponse.json({ error: reqRes.error.message },   { status: 500 })
  if (satRes.error)   return NextResponse.json({ error: satRes.error.message },   { status: 500 })

  const requests: RequestEntry[] = (reqRes.data ?? []).map(r => ({
    year: r.year, month: r.month, day: r.day,
    staff_id: r.staff_id, kubun: r.kubun,
  }))

  const saturdayEntries: SaturdayEntry[] = (satRes.data ?? []).map(r => ({
    year: r.year, month: r.month, day: r.day,
    a_staff_id: r.a_staff_id, e1_staff_id: r.e1_staff_id,
  }))

  const holidays = getHolidaySet()
  const { result, warnings } = generateMonth(
    year, month, staffRes.data ?? [], requests, holidays, saturdayEntries
  )

  // 当月分を削除してから挿入
  const pad     = (n: number) => String(n).padStart(2, '0')
  const firstDay = `${year}-${pad(month)}-01`
  const lastDay  = `${year}-${pad(month)}-${new Date(year, month, 0).getDate()}`

  const { error: deleteErr } = await supabase
    .from('shifts')
    .delete()
    .gte('date', firstDay)
    .lte('date', lastDay)
  if (deleteErr) return NextResponse.json({ error: deleteErr.message }, { status: 500 })

  const rows = result.flatMap(day =>
    Object.entries(day.assignments).map(([staff_id, position]) => ({
      year, month, date: day.date, staff_id, position,
    }))
  )

  const { error: insertErr } = await supabase
    .from('shifts')
    .upsert(rows, { onConflict: 'date,staff_id' })
  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

  // saturday_pmも保存
  const pmRows = result
    .filter(d => d.saturday_pm.length > 0)
    .flatMap(d => d.saturday_pm.map(sid => ({
      year, month, date: d.date, staff_id: sid,
    })))

  if (pmRows.length > 0) {
    await supabase.from('saturday_pm').delete().gte('date', firstDay).lte('date', lastDay)
    await supabase.from('saturday_pm').insert(pmRows)
  }

  return NextResponse.json({ ok: true, warnings, days: result.length })
}