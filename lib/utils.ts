import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { SUPPORTED_CURRENCIES, type CurrencyCode } from "./types"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(amount)
}

export function formatDate(dateString: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateString))
}

export function formatDateShort(dateString: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(dateString))
}

export function formatDateRelative(dateString: string | null): string {
  if (!dateString) return "Jamais";
  
  const date = new Date(dateString);
  const now = new Date();
  
  const diffSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (diffSeconds < 60) {
    return "À l'instant";
  }
  
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    return `Il y a ${diffMinutes} minute${diffMinutes > 1 ? 's' : ''}`;
  }
  
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `Il y a ${diffHours} heure${diffHours > 1 ? 's' : ''}`;
  }
  
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) {
    return `Il y a ${diffDays} jour${diffDays > 1 ? 's' : ''}`;
  }
  
  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks < 4) {
    return `Il y a ${diffWeeks} semaine${diffWeeks > 1 ? 's' : ''}`;
  }
  
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) {
    return `Il y a ${diffMonths} mois`;
  }
  
  const diffYears = Math.floor(diffDays / 365);
  return `Il y a ${diffYears} an${diffYears > 1 ? 's' : ''}`;
}

export function getColorForIndex(index: number): string {
  const colors = [
    "#3b82f6",
    "#10b981",
    "#f59e0b",
    "#ef4444",
    "#8b5cf6",
    "#ec4899",
    "#14b8a6",
    "#f97316",
    "#6366f1",
    "#84cc16",
    "#f43f5e",
    "#06b6d4",
  ]
  return colors[index % colors.length]
}

export function debounce<T extends (...args: any[]) => any>(func: T, wait: number): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null

  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(() => func(...args), wait)
  }
}

export function throttle<T extends (...args: any[]) => any>(func: T, limit: number): (...args: Parameters<T>) => void {
  let inThrottle: boolean

  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args)
      inThrottle = true
      setTimeout(() => (inThrottle = false), limit)
    }
  }
}

export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

export function validatePin(pin: string): boolean {
  return /^\d{4}$/.test(pin)
}

export function announceToScreenReader(message: string): void {
  const announcement = document.createElement("div")
  announcement.setAttribute("aria-live", "polite")
  announcement.setAttribute("aria-atomic", "true")
  announcement.className = "sr-only"
  announcement.textContent = message

  document.body.appendChild(announcement)

  setTimeout(() => {
    document.body.removeChild(announcement)
  }, 1000)
}

export function safeLocalStorage() {
  const isAvailable = typeof window !== "undefined" && window.localStorage

  return {
    getItem: (key: string) => {
      if (!isAvailable) return null
      try {
        return localStorage.getItem(key)
      } catch {
        return null
      }
    },
    setItem: (key: string, value: string) => {
      if (!isAvailable) return false
      try {
        localStorage.setItem(key, value)
        return true
      } catch {
        return false
      }
    },
    removeItem: (key: string) => {
      if (!isAvailable) return false
      try {
        localStorage.removeItem(key)
        return true
      } catch {
        return false
      }
    },
  }
}

export const CURRENCY_LABELS: Record<CurrencyCode, string> = {
  EUR: "Euro (EUR)",
  CFA: "CFA",
  USD: "Dollar (USD)",
}

export const isSupportedCurrency = (value: unknown): value is CurrencyCode =>
  typeof value === "string" && SUPPORTED_CURRENCIES.includes(value as CurrencyCode)

export const normalizeCurrencyCode = (value: unknown): CurrencyCode | null => {
  if (typeof value !== "string") {
    return null
  }

  const normalized = value === "XOF" ? "CFA" : value
  return isSupportedCurrency(normalized) ? normalized : null
}
