import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@libsql/client'

const turso = createClient({
  url: process.env.NEXT_PUBLIC_TURSO_DATABASE_URL!,
  authToken: process.env.NEXT_PUBLIC_TURSO_AUTH_TOKEN!,
})

type UserCreationPayload = {
  name: string
  pin_hash: string
  is_admin?: boolean
  created_at?: string
}

const isUserCreationPayload = (value: unknown): value is UserCreationPayload => {
  if (!value || typeof value !== 'object') return false
  const c = value as Record<string, unknown>
  if (typeof c.name !== 'string' || c.name.trim().length === 0) return false
  if (typeof c.pin_hash !== 'string' || c.pin_hash.trim().length === 0) return false
  return true
}

export async function POST(req: NextRequest) {
  try {
    const payload = (await req.json()) as unknown
    if (!isUserCreationPayload(payload)) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    const { name, pin_hash, is_admin = false, created_at } = payload
    const id = crypto.randomUUID()
    const timestamp = created_at || new Date().toISOString()

    await turso.execute({
      sql: 'INSERT INTO users (id, name, pin_hash, is_admin, created_at) VALUES (?, ?, ?, ?, ?)',
      args: [id, name, pin_hash, is_admin ? 1 : 0, timestamp],
    })

    console.log('[API] User created:', { id, name, is_admin })
    return NextResponse.json({ id }, { status: 201 })
  } catch (error: unknown) {
    console.error('[API] User creation error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
