import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// POST /api/saturday_pm  body: { date, staff_id }
export async function POST(req: NextRequest) {
  const { date, staff_id } = await req.json()
  const { error } = await supabase
    .from('saturday_pm')
    .upsert({ date, staff_id, year: Number(date.slice(0,4)), month: Number(date.slice(5,7)) },
      { onConflict: 'date,staff_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE /api/saturday_pm?date=2026-07-12&staff_id=S1
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const date     = searchParams.get('date')
  const staff_id = searchParams.get('staff_id')
  const { error } = await supabase
    .from('saturday_pm')
    .delete()
    .eq('date', date)
    .eq('staff_id', staff_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}