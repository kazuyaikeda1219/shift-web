import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GET /api/nurse/staff
export async function GET() {
  const { data, error } = await supabase
    .from('nurse_staff')
    .select('*')
    .order('sort_order')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/nurse/staff  body: staff row (id optional → 自動採番)
export async function POST(req: NextRequest) {
  const body = await req.json()
  let id: string = body.id

  if (!id) {
    // 既存の最大Nxを採番
    const { data } = await supabase.from('nurse_staff').select('id')
    const nums = (data ?? [])
      .map(r => Number(String(r.id).replace(/^N/, '')))
      .filter(n => !Number.isNaN(n))
    const next = (nums.length ? Math.max(...nums) : 0) + 1
    id = `N${next}`
  }

  const row = {
    id,
    name: body.name ?? '',
    qualification: body.qualification ?? null,
    night_ok: body.night_ok ?? true,
    night_role: body.night_role ?? '両方可',
    max_night: body.max_night ?? 4,
    max_consec: body.max_consec ?? 5,
    is_newbie: body.is_newbie ?? false,
    kokyu_override: body.kokyu_override ?? null,
    sort_order: body.sort_order ?? 999,
  }

  const { data, error } = await supabase
    .from('nurse_staff')
    .upsert(row, { onConflict: 'id' })
    .select()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data?.[0] ?? row)
}

// DELETE /api/nurse/staff?id=N1
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { error } = await supabase.from('nurse_staff').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
