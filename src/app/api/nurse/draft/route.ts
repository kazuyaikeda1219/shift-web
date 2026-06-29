import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GET /api/nurse/draft?year=2026&month=6  → パターン名一覧
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const year = Number(searchParams.get('year'))
  const month = Number(searchParams.get('month'))
  const { data, error } = await supabase
    .from('nurse_shifts_draft')
    .select('pattern_name')
    .eq('year', year)
    .eq('month', month)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const names = Array.from(new Set((data ?? []).map(r => r.pattern_name)))
  return NextResponse.json(names)
}

// DELETE /api/nurse/draft?year=2026&month=6&pattern_name=案A
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const year = Number(searchParams.get('year'))
  const month = Number(searchParams.get('month'))
  const pattern_name = searchParams.get('pattern_name')!
  const { error } = await supabase
    .from('nurse_shifts_draft')
    .delete()
    .eq('year', year).eq('month', month).eq('pattern_name', pattern_name)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
