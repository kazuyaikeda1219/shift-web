import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GET /api/nurse/rules            … 全件
// GET /api/nurse/rules?staff_id=N1 … 指定スタッフ
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const staffId = searchParams.get('staff_id')
  let q = supabase.from('nurse_staff_rules').select('*')
  if (staffId) q = q.eq('staff_id', staffId)
  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/nurse/rules  body: { staff_id, rule_type, weekday, on }
// on=false なら削除、on=true（既定）なら追加
export async function POST(req: NextRequest) {
  const { staff_id, rule_type, weekday, on = true } = await req.json()
  if (!staff_id || !rule_type || weekday === undefined)
    return NextResponse.json({ error: 'staff_id, rule_type, weekday は必須です' }, { status: 400 })

  if (!on) {
    const { error } = await supabase
      .from('nurse_staff_rules')
      .delete()
      .eq('staff_id', staff_id).eq('rule_type', rule_type).eq('weekday', weekday)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, deleted: true })
  }

  const { data, error } = await supabase
    .from('nurse_staff_rules')
    .upsert({ staff_id, rule_type, weekday }, { onConflict: 'staff_id,rule_type,weekday' })
    .select()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data?.[0])
}

// DELETE /api/nurse/rules?id=1
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = Number(searchParams.get('id'))
  const { error } = await supabase.from('nurse_staff_rules').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
