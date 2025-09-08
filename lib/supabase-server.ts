import { createClient } from '@supabase/supabase-js'
import { Database } from './database.types'

// Client Supabase côté serveur avec service role (bypass RLS pour maintenance/seed)
export function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return null
  return createClient<Database>(url, serviceKey)
}
