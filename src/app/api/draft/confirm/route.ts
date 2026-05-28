import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// POST /api/draft/confirm  body: { year, month, pattern_name }
// 下書きパターンを本番shiftsに反映
export async function POST(req: NextRequest) {
  const { year, month, pattern_name } = await req.json()
  const pad   = (n: number) => String(n).padStart(2, '0')
  const first = `${year}-${pad(month)}-01`
  const last  = `${year}-${pad(month)}-${new Date(year, month, 0).getDate()}`

  // 下書きデータ取得
  const { data, error: fetchErr } = await supabase
    .from('shifts_draft')
    .select('date, staff_id, position')
    .eq('year', year)
    .eq('month', month)
    .eq('pattern_name', pattern_name)

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })

  // 本番データを削除して上書き
  await supabase.from('shifts').delete().gte('date', first).lte('date', last)

  const rows = (data ?? []).map(r => ({
    year, month, date: r.date, staff_id: r.staff_id, position: r.position, is_draft: false,
  }))

  const { error: insertErr } = await supabase
    .from('shifts')
    .upsert(rows, { onConflict: 'date,staff_id' })

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
