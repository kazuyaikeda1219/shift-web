import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GET /api/draft/load?year=2026&month=7&pattern_name=6月案A
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const year         = Number(searchParams.get('year'))
  const month        = Number(searchParams.get('month'))
  const pattern_name = searchParams.get('pattern_name')

  const { data, error } = await supabase
    .from('shifts_draft')
    .select('date, staff_id, position')
    .eq('year', year)
    .eq('month', month)
    .eq('pattern_name', pattern_name)
    .order('date')
    .order('staff_id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}