"use client"

import { createClient } from '@supabase/supabase-js'
import { Database } from './database.types'

function getLocalUserId(): string | null {
  if (typeof window === 'undefined') {
    return null
  }
  try {
    const stored =
      window.localStorage.getItem('expenshare_current_user') ||
      window.localStorage.getItem('expenshare_user') ||
      null
    if (!stored) return null
    const parsed = JSON.parse(stored)
    if (!parsed || !parsed.id) return null
    return String(parsed.id)
  } catch {
    return null
  }
}

const withUserHeader = (init?: RequestInit): RequestInit => {
  const headers = new Headers(init?.headers ?? {})
  const userId = getLocalUserId()
  if (userId) {
    headers.set('x-expenshare-user-id', userId)
  } else {
    headers.delete('x-expenshare-user-id')
  }
  return { ...init, headers }
}

const supabaseFetch: typeof fetch = (input, init) => {
  if (input instanceof Request) {
    return fetch(new Request(input, withUserHeader(init)))
  }
  return fetch(input, withUserHeader(init))
}

// Création du client Supabase - les clés sont injectées via des variables d'environnement
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://xcipgdjxjhnyiwgltdvn.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhjaXBnZGp4amhueWl3Z2x0ZHZuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcyNzE2MTEsImV4cCI6MjA3Mjg0NzYxMX0.Ll6QEtbqYovT3gvXv8ueCI7xM5pBrdW5N-2OezdLvUo'

// Création du client typé avec les types de la base de données
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true, // Active la persistence de session (localStorage)
    autoRefreshToken: true, // Rafraîchit automatiquement le token
  },
  global: {
    fetch: supabaseFetch,
  },
})

// Export des types d'authentification
export type { AuthSession, AuthUser } from '@supabase/supabase-js'
