import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GET /api/saturday?year=2026&month=7
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const year  = Number(searchParams.get('year'))
  const month = Number(searchParams.get('month'))

  const { data, error } = await supabase
    .from('saturday_entries')
    .select('*, a_staff:staff!saturday_entries_a_staff_id_fkey(name), e1_staff:staff!saturday_entries_e1_staff_id_fkey(name)')
    .eq('year', year)
    .eq('month', month)
    .order('day')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/saturday  body: { year, month, day, a_staff_id, e1_staff_id }
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { year, month, day, a_staff_id, e1_staff_id } = body

  const { data, error } = await supabase
    .from('saturday_entries')
    .upsert({ year, month, day, a_staff_id, e1_staff_id }, { onConflict: 'year,month,day' })
    .select()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE /api/saturday?id=123
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = Number(searchParams.get('id'))

  const { error } = await supabase.from('saturday_entries').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}