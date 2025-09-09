import type React from "react"
import type { Metadata, Viewport } from "next"
import { GeistSans } from "geist/font/sans"
import { GeistMono } from "geist/font/mono"
import { Analytics } from "@vercel/analytics/next"
import { Suspense } from "react"
import { ErrorBoundary } from "@/components/ui/error-boundary"
import { ToastProvider, ToastViewport } from "@/components/ui/toast"
import "./globals.css"

export const viewport: Viewport = {
  themeColor: "#3b82f6",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export const metadata: Metadata = {
  title: "ExpenseShare",
  description: "Application de gestion collaborative de projets et suivi des dépenses/budgets",
  generator: "ExpenseShare v1.0",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "ExpenseShare",
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    type: "website",
    siteName: "ExpenseShare",
    title: "ExpenseShare",
    description: "Application de gestion collaborative de projets et suivi des dépenses/budgets",
  },
  robots: {
    index: false,
    follow: false,
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="fr">
      <head>
        <link rel="apple-touch-icon" href="/icon-192.jpg" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className={`font-sans ${GeistSans.variable} ${GeistMono.variable} antialiased`}>
        <ErrorBoundary>
          <ToastProvider>
            <Suspense fallback={null}>{children}</Suspense>
            <ToastViewport />
          </ToastProvider>
        </ErrorBoundary>
        <Analytics />
      </body>
    </html>
  )
}
