"use client"

// Importer la nouvelle implémentation Supabase
import { db as supabaseDb } from './database-supabase'

// Re-exporter tous les types depuis le fichier types
export * from './types'

// Exporter l'instance de base de données Supabase
export const db = supabaseDb
