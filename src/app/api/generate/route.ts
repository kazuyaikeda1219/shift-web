import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { generateMonth, RequestEntry } from '@/lib/shiftEngine'
import { getHolidaySet } from '@/lib/holidays'

// POST /api/generate  body: { year, month }
export async function POST(req: NextRequest) {
  const { year, month } = await req.json()

  // スタッフ取得
  const { data: staffData, error: staffErr } = await supabase
    .from('staff').select('*').order('sort_order')
  if (staffErr) return NextResponse.json({ error: staffErr.message }, { status: 500 })

  // 休み申請取得
  const { data: reqData, error: reqErr } = await supabase
    .from('requests').select('*').eq('year', year).eq('month', month)
  if (reqErr) return NextResponse.json({ error: reqErr.message }, { status: 500 })

  const requests: RequestEntry[] = (reqData ?? []).map(r => ({
    year: r.year, month: r.month, day: r.day,
    staff_id: r.staff_id, kubun: r.kubun,
  }))

  const holidays = getHolidaySet()
  const { result, warnings } = generateMonth(year, month, staffData ?? [], requests, holidays)

  // shifts テーブルに保存（当月分を一度削除してから挿入）
  const firstDay = `${year}-${String(month).padStart(2,'0')}-01`
  const lastDay  = `${year}-${String(month).padStart(2,'0')}-${new Date(year, month, 0).getDate()}`
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

  return NextResponse.json({ ok: true, warnings, days: result.length })
}
