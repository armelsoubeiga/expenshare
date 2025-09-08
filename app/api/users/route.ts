import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Database } from '@/lib/database.types'

// Cette route API utilise la clé service (si fournie) pour bypass RLS lors de la création d'un user.
// Ajoutez NEXT_PUBLIC_SUPABASE_URL (déjà présent) et SUPABASE_SERVICE_ROLE_KEY dans .env.local

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

export async function POST(req: NextRequest) {
  if (!url || !serviceKey) {
    return NextResponse.json({ error: 'Service key not configured' }, { status: 503 })
  }

  try {
    const payload = await req.json()
    if (!payload?.name || !payload?.pin_hash) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }
    
    console.log('[API] Creating user with payload:', {
      ...payload,
      pin_hash: '[MASKED]',
      created_at: payload.created_at || new Date().toISOString(),
    })
    
    const supabase = createClient<Database>(url, serviceKey)
    const { data, error } = await supabase
      .from('users')
      .insert({
        name: String(payload.name),
        pin_hash: String(payload.pin_hash),
        is_admin: !!payload.is_admin,
        created_at: payload.created_at || new Date().toISOString(),
      })
      .select('id')
      .single()
    
    if (error) {
      console.error('[API] User creation error:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      })
      return NextResponse.json({ 
        error: error.message, 
        details: error.details, 
        hint: error.hint, 
        code: error.code 
      }, { status: 400 })
    }
    
    console.log('[API] User created successfully:', data)
    return NextResponse.json({ id: data!.id }, { status: 201 })
  } catch (e: any) {
    console.error('[API] Unexpected error:', e)
    return NextResponse.json({ error: e?.message || 'Unknown error' }, { status: 500 })
  }
}
