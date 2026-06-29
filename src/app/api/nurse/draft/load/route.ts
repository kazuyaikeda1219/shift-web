import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GET /api/nurse/draft/load?year=&month=&pattern_name=
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const year = Number(searchParams.get('year'))
  const month = Number(searchParams.get('month'))
  const pattern_name = searchParams.get('pattern_name')!
  const { data, error } = await supabase
    .from('nurse_shifts_draft')
    .select('date, staff_id, symbol')
    .eq('year', year).eq('month', month).eq('pattern_name', pattern_name)
    .order('date')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json((data ?? []).map(r => ({ ...r, is_draft: true })))
}
