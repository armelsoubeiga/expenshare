"use client"

import { createClient } from '@supabase/supabase-js'
import { Database } from './database.types'

// Création du client Supabase - les clés sont injectées via des variables d'environnement
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://xcipgdjxjhnyiwgltdvn.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhjaXBnZGp4amhueWl3Z2x0ZHZuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcyNzE2MTEsImV4cCI6MjA3Mjg0NzYxMX0.Ll6QEtbqYovT3gvXv8ueCI7xM5pBrdW5N-2OezdLvUo'

// Création du client typé avec les types de la base de données
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true, // Active la persistence de session (localStorage)
    autoRefreshToken: true, // Rafraîchit automatiquement le token
  },
})

// Export des types d'authentification
export type { AuthSession, AuthUser } from '@supabase/supabase-js'
