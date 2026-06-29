import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// POST /api/nurse/draft/confirm  body: { year, month, pattern_name }
// 下書きパターンを本番 nurse_shifts に反映
export async function POST(req: NextRequest) {
  const { year, month, pattern_name } = await req.json()

  const { data, error } = await supabase
    .from('nurse_shifts_draft')
    .select('date, staff_id, symbol')
    .eq('year', year).eq('month', month).eq('pattern_name', pattern_name)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const pad = (n: number) => String(n).padStart(2, '0')
  const firstDay = `${year}-${pad(month)}-01`
  const lastDay = `${year}-${pad(month)}-${new Date(year, month, 0).getDate()}`

  await supabase.from('nurse_shifts').delete().gte('date', firstDay).lte('date', lastDay)

  const rows = (data ?? []).map(r => ({
    year, month, date: r.date, staff_id: r.staff_id, symbol: r.symbol, is_draft: true,
  }))
  if (rows.length) {
    const { error: insErr } = await supabase
      .from('nurse_shifts').upsert(rows, { onConflict: 'date,staff_id' })
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
