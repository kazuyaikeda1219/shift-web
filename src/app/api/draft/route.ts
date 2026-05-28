import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GET /api/draft?year=2026&month=7  パターン一覧取得
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const year  = Number(searchParams.get('year'))
  const month = Number(searchParams.get('month'))

  const { data, error } = await supabase
    .from('shifts_draft')
    .select('pattern_name')
    .eq('year', year)
    .eq('month', month)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // パターン名の一覧を重複なしで返す
  const patterns = [...new Set((data ?? []).map(r => r.pattern_name))]
  return NextResponse.json(patterns)
}

// POST /api/draft  body: { year, month, pattern_name, rows }
export async function POST(req: NextRequest) {
  const { year, month, pattern_name, rows } = await req.json()

  // 同名パターンは上書き
  const pad   = (n: number) => String(n).padStart(2, '0')
  const first = `${year}-${pad(month)}-01`
  const last  = `${year}-${pad(month)}-${new Date(year, month, 0).getDate()}`

  await supabase
    .from('shifts_draft')
    .delete()
    .eq('year', year)
    .eq('month', month)
    .eq('pattern_name', pattern_name)

  const { error } = await supabase
    .from('shifts_draft')
    .insert(rows.map((r: { date: string; staff_id: string; position: string }) => ({
      year, month, pattern_name, ...r
    })))

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE /api/draft?year=2026&month=7&pattern_name=6月案A
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const year         = Number(searchParams.get('year'))
  const month        = Number(searchParams.get('month'))
  const pattern_name = searchParams.get('pattern_name')

  const { error } = await supabase
    .from('shifts_draft')
    .delete()
    .eq('year', year)
    .eq('month', month)
    .eq('pattern_name', pattern_name)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}