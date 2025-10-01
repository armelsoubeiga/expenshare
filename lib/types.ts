"use client"

// Database schema types
export interface User {
  id?: string
  name: string
  pin_hash: string
  created_at?: Date | string
}

export interface Project {
  id?: number
  name: string
  description?: string
  icon: string
  color: string
  currency: string
  created_by: string | number
  created_at?: Date | string
  role?: string // Pour les requêtes JOIN
}

export interface ProjectUser {
  project_id: number
  user_id: string | number
  role: string
  added_at?: Date | string
}

export interface Category {
  id?: number
  project_id: number
  name: string
  parent_id?: number | null
  level: number
  created_at?: Date | string
}

export interface Transaction {
  id?: number
  project_id: number
  user_id: string | number
  category_id?: number | null
  type: "expense" | "budget"
  amount: number
  title: string
  description?: string
  created_at?: Date | string
  // Champs joints pour les requêtes
  project_name?: string
  project_icon?: string
  project_color?: string
  user_name?: string
  category_name?: string
  parent_category_name?: string
  project_currency?: string
  amount_eur?: number
  amount_cfa?: number
  amount_usd?: number
  has_text?: boolean
  has_document?: boolean
  has_image?: boolean
  has_audio?: boolean
}

export interface Note {
  id?: number
  transaction_id: number
  content_type: "text" | "image" | "audio"
  content: string
  file_path?: string
  created_at?: Date | string
}

export interface Setting {
  key: string
  value: string
  updated_at?: Date | string
}

export const SUPPORTED_CURRENCIES = ["EUR", "CFA", "USD"] as const

export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number]

export type ProjectWithId = Project & { id: number }
