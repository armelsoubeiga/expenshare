"use client"

import { useEffect, useMemo, useState } from "react"
import { useDatabase } from "./use-database"

export function useUserProjectsSecure(userId?: string | number) {
  const { db, isReady } = useDatabase()
  const [projects, setProjects] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const load = async () => {
    if (!isReady || !db) return
    setIsLoading(true)
    try {
      const uid = userId ?? (typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('expenshare_user') || 'null')?.id : null)
      if (!uid) {
        setProjects([])
        return
      }
      const list = await db.getUserProjects(String(uid))
      setProjects(list)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [isReady, db, userId])

  return { projects, isLoading, hasProjects: projects.length > 0, refetch: load }
}

export function useSecureData() {
  const { db, isReady } = useDatabase()
  const [projectIds, setProjectIds] = useState<number[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const refresh = async () => {
    if (!isReady || !db) return
    setIsLoading(true)
    try {
      const stored = typeof window !== 'undefined' ? (localStorage.getItem('expenshare_user') || localStorage.getItem('expenshare_current_user')) : null
      const uid = stored ? String(JSON.parse(stored).id) : null
      if (!uid) {
        setProjectIds([])
        return
      }
      const userProjects = await db.getUserProjects(uid)
      setProjectIds(userProjects.map((p: any) => Number(p.id)))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [isReady, db])

  const api = useMemo(() => {
    return {
      getTransactions: async () => {
        if (!db || projectIds.length === 0) return []
        // Le db interne est déjà filtré; on double-filtre par sécurité
        const res = await Promise.all(projectIds.map((pid) => db.getProjectTransactions(pid)))
        return res.flat()
      },
      getCategories: async () => {
        if (!db || projectIds.length === 0) return []
        const chunks = await Promise.all(projectIds.map(async (pid) => (await db.getProjectCategories(pid)) || []))
        return chunks.flat()
      },
    }
  }, [db, projectIds])

  return { projectIds, isLoading, ...api, refetch: refresh }
}
