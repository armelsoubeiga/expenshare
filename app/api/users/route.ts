import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Database } from '@/lib/database.types'

// Cette route API utilise la clé service (si fournie) pour bypass RLS lors de la création d'un user.
// Ajoutez NEXT_PUBLIC_SUPABASE_URL (déjà présent) et SUPABASE_SERVICE_ROLE_KEY dans .env.local

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

type UserCreationPayload = {
  name: string
  pin_hash: string
  is_admin?: boolean
  created_at?: string
}

const isUserCreationPayload = (value: unknown): value is UserCreationPayload => {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Record<string, unknown>

  if (typeof candidate.name !== 'string' || candidate.name.trim().length === 0) {
    return false
  }

  if (typeof candidate.pin_hash !== 'string' || candidate.pin_hash.trim().length === 0) {
    return false
  }

  if (
    'is_admin' in candidate &&
    typeof candidate.is_admin !== 'boolean' &&
    typeof candidate.is_admin !== 'undefined'
  ) {
    return false
  }

  if (
    'created_at' in candidate &&
    typeof candidate.created_at !== 'string' &&
    typeof candidate.created_at !== 'undefined'
  ) {
    return false
  }

  return true
}

export async function POST(req: NextRequest) {
  if (!url || !serviceKey) {
    return NextResponse.json({ error: 'Service key not configured' }, { status: 503 })
  }

  try {
    const payload = (await req.json()) as unknown

    if (!isUserCreationPayload(payload)) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    const { name, pin_hash, is_admin = false, created_at } = payload

    const timestamp = created_at || new Date().toISOString()

    console.log('[API] Creating user with payload:', {
      name,
      is_admin,
      created_at: timestamp,
      pin_hash: '[MASKED]',
    })

    const supabase = createClient<Database>(url, serviceKey)
    const { data, error } = await supabase
      .from('users')
      .insert({
        name,
        pin_hash,
        is_admin,
        created_at: timestamp,
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
    
    if (!data) {
      console.error('[API] Unexpected: insertion succeeded but no data returned')
      return NextResponse.json({ error: 'User creation succeeded without response data' }, { status: 500 })
    }

    console.log('[API] User created successfully:', data)
    return NextResponse.json({ id: data.id }, { status: 201 })
  } catch (error: unknown) {
    console.error('[API] Unexpected error:', error)

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ error: 'Unknown error' }, { status: 500 })
  }
}
