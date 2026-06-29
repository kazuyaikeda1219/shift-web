import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GET /api/radiation/requests?year=2026&month=6
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const year = Number(searchParams.get('year'))
  const month = Number(searchParams.get('month'))
  const { data, error } = await supabase
    .from('radiation_requests')
    .select('*')
    .eq('year', year)
    .eq('month', month)
    .order('day')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/radiation/requests  body: { year, month, day, staff_id, kubun }
// kubun が空なら削除扱い
export async function POST(req: NextRequest) {
  const { year, month, day, staff_id, kubun } = await req.json()
  if (!kubun) {
    const { error } = await supabase
      .from('radiation_requests')
      .delete()
      .eq('year', year).eq('month', month).eq('day', day).eq('staff_id', staff_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, deleted: true })
  }
  const { data, error } = await supabase
    .from('radiation_requests')
    .upsert({ year, month, day, staff_id, kubun }, { onConflict: 'year,month,day,staff_id' })
    .select()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data?.[0])
}

// DELETE /api/radiation/requests?id=123
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = Number(searchParams.get('id'))
  const { error } = await supabase.from('radiation_requests').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
