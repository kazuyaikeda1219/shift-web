import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { DEFAULT_CONFIG } from '@/lib/radiationShiftEngine'

export const dynamic = 'force-dynamic'

// GET /api/radiation/config
export async function GET() {
  const { data, error } = await supabase
    .from('radiation_config').select('*').eq('id', 1).single()
  if (error) return NextResponse.json({ id: 1, ...DEFAULT_CONFIG })
  return NextResponse.json(data)
}

// PATCH /api/radiation/config  body: partial config
export async function PATCH(req: NextRequest) {
  const patch = await req.json()
  const { data, error } = await supabase
    .from('radiation_config')
    .upsert({ id: 1, ...patch }, { onConflict: 'id' })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
