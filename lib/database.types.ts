export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      categories: {
        Row: {
          created_at: string
          id: number
          level: number
          name: string
          parent_id: number | null
          project_id: number
        }
        Insert: {
          created_at?: string
          id?: number
          level?: number
          name: string
          parent_id?: number | null
          project_id: number
        }
        Update: {
          created_at?: string
          id?: number
          level?: number
          name?: string
          parent_id?: number | null
          project_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          }
        ]
      }
      notes: {
        Row: {
          content: string
          content_type: string
          created_at: string
          file_path: string | null
          id: number
          transaction_id: number
        }
        Insert: {
          content: string
          content_type: string
          created_at?: string
          file_path?: string | null
          id?: number
          transaction_id: number
        }
        Update: {
          content?: string
          content_type?: string
          created_at?: string
          file_path?: string | null
          id?: number
          transaction_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "notes_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          }
        ]
      }
      project_users: {
        Row: {
          added_at: string
          project_id: number
          role: string
          user_id: string
        }
        Insert: {
          added_at?: string
          project_id: number
          role: string
          user_id: string
        }
        Update: {
          added_at?: string
          project_id?: number
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_users_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_users_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      projects: {
        Row: {
          color: string
          created_at: string
          created_by: string
          currency: string
          description: string | null
          icon: string
          id: number
          name: string
        }
        Insert: {
          color: string
          created_at?: string
          created_by: string
          currency?: string
          description?: string | null
          icon: string
          id?: number
          name: string
        }
        Update: {
          color?: string
          created_at?: string
          created_by?: string
          currency?: string
          description?: string | null
          icon?: string
          id?: number
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      settings: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          amount: number
          category_id: number | null
          created_at: string
          description: string | null
          id: number
          project_id: number
          title: string
          type: string
          user_id: string
        }
        Insert: {
          amount: number
          category_id?: number | null
          created_at?: string
          description?: string | null
          id?: number
          project_id: number
          title: string
          type: string
          user_id: string
        }
        Update: {
          amount?: number
          category_id?: number | null
          created_at?: string
          description?: string | null
          id?: number
          project_id?: number
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      users: {
        Row: {
          created_at: string
          id: string
          is_admin: boolean
          name: string
          pin_hash: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_admin?: boolean
          name: string
          pin_hash: string
        }
        Update: {
          created_at?: string
          id?: string
          is_admin?: boolean
          name?: string
          pin_hash?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_user_id: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
