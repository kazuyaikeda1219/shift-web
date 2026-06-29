import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GET /api/nurse/shift?year=2026&month=6
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const year = Number(searchParams.get('year'))
  const month = Number(searchParams.get('month'))
  const { data, error } = await supabase
    .from('nurse_shifts')
    .select('*')
    .eq('year', year)
    .eq('month', month)
    .order('date')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ shifts: data })
}

// PATCH /api/nurse/shift  body: { date, staff_id, symbol }
// symbol が空なら該当セル削除
export async function PATCH(req: NextRequest) {
  const { date, staff_id, symbol } = await req.json()
  if (!symbol) {
    const { error } = await supabase
      .from('nurse_shifts').delete().eq('date', date).eq('staff_id', staff_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, deleted: true })
  }
  const [y, m] = date.split('-').map(Number)
  const { error } = await supabase
    .from('nurse_shifts')
    .upsert({ year: y, month: m, date, staff_id, symbol }, { onConflict: 'date,staff_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE /api/nurse/shift?from=2026-06-01&to=2026-06-30
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')!
  const to = searchParams.get('to')!
  const { error } = await supabase
    .from('nurse_shifts').delete().gte('date', from).lte('date', to)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
