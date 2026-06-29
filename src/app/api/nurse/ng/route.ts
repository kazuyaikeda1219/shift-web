import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GET /api/nurse/ng
export async function GET() {
  const { data, error } = await supabase
    .from('nurse_ng_pairs')
    .select('*')
    .order('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/nurse/ng  body: { staff_a, staff_b, note? }
export async function POST(req: NextRequest) {
  const { staff_a, staff_b, note } = await req.json()
  if (!staff_a || !staff_b || staff_a === staff_b)
    return NextResponse.json({ error: '異なる2名を指定してください' }, { status: 400 })
  // a<b に正規化（unique 制約のため）
  const [a, b] = staff_a < staff_b ? [staff_a, staff_b] : [staff_b, staff_a]
  const { data, error } = await supabase
    .from('nurse_ng_pairs')
    .upsert({ staff_a: a, staff_b: b, note: note ?? null }, { onConflict: 'staff_a,staff_b' })
    .select()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data?.[0])
}

// DELETE /api/nurse/ng?id=1
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = Number(searchParams.get('id'))
  const { error } = await supabase.from('nurse_ng_pairs').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
