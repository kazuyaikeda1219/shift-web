import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// POST /api/nurse/confirm  body: { year, month }
export async function POST(req: NextRequest) {
  const { year, month } = await req.json()
  const { error } = await supabase
    .from('nurse_shifts')
    .update({ is_draft: false })
    .eq('year', year)
    .eq('month', month)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
