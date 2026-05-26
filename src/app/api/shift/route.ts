import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// GET /api/shift?year=2026&month=7
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const year  = Number(searchParams.get('year'))
  const month = Number(searchParams.get('month'))
  const pad   = (n: number) => String(n).padStart(2, '0')
  const first = `${year}-${pad(month)}-01`
  const last  = `${year}-${pad(month)}-${new Date(year, month, 0).getDate()}`

  const { data, error } = await supabase
    .from('shifts')
    .select('date, staff_id, position')
    .gte('date', first)
    .lte('date', last)
    .order('date')
    .order('staff_id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// PATCH /api/shift  body: { date, staff_id, position }  （手動修正）
export async function PATCH(req: NextRequest) {
  const { date, staff_id, position } = await req.json()
  const { error } = await supabase
    .from('shifts')
    .update({ position })
    .eq('date', date)
    .eq('staff_id', staff_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE /api/shift?from=2026-07-01&to=2026-07-31
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to   = searchParams.get('to')
  if (!from || !to) return NextResponse.json({ error: 'from/to required' }, { status: 400 })
  const { error } = await supabase.from('shifts').delete().gte('date', from).lte('date', to)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}