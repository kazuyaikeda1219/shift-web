import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GET /api/nurse/config
export async function GET() {
  const { data, error } = await supabase
    .from('nurse_config')
    .select('*')
    .eq('id', 1)
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// PATCH /api/nurse/config  body: 部分更新
export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const allowed = [
    'need_mon', 'need_tue', 'need_wed', 'need_thu', 'need_fri', 'need_sat', 'need_sun',
    'sei_count', 'day_sat', 'day_sun_holiday', 'kokyu_target', 'seed',
  ]
  const patch: Record<string, unknown> = { id: 1 }
  for (const k of allowed) if (k in body) patch[k] = body[k]
  const { data, error } = await supabase
    .from('nurse_config')
    .upsert(patch, { onConflict: 'id' })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
