import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// POST /api/confirm  body: { year, month }
export async function POST(req: NextRequest) {
  const { year, month } = await req.json()
  const pad   = (n: number) => String(n).padStart(2, '0')
  const first = `${year}-${pad(month)}-01`
  const last  = `${year}-${pad(month)}-${new Date(year, month, 0).getDate()}`

  const { error } = await supabase
    .from('shifts')
    .update({ is_draft: false })
    .gte('date', first)
    .lte('date', last)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}