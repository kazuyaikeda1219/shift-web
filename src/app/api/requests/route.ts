import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// GET /api/requests?year=2026&month=7
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const year  = Number(searchParams.get('year'))
  const month = Number(searchParams.get('month'))

  const { data, error } = await supabase
    .from('requests')
    .select('*, staff(name)')
    .eq('year', year)
    .eq('month', month)
    .order('day')
    .order('staff_id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/requests  body: { year, month, day, staff_id, kubun }
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { year, month, day, staff_id, kubun } = body

  const { data, error } = await supabase
    .from('requests')
    .upsert({ year, month, day, staff_id, kubun }, { onConflict: 'year,month,day,staff_id' })
    .select()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE /api/requests?id=123
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = Number(searchParams.get('id'))

  const { error } = await supabase.from('requests').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
