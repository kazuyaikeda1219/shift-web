import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GET /api/radiation/staff
export async function GET() {
  const { data, error } = await supabase
    .from('radiation_staff')
    .select('*')
    .order('sort_order')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/radiation/staff  body: { id, name, role, sort_order }
export async function POST(req: NextRequest) {
  const body = await req.json()
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const row = {
    id: body.id,
    name: body.name ?? '',
    role: body.role ?? 'A',
    sort_order: body.sort_order ?? 0,
  }
  const { data, error } = await supabase
    .from('radiation_staff')
    .upsert(row, { onConflict: 'id' })
    .select()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data?.[0] ?? row)
}
