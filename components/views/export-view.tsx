"use client"

import { ExportDialog } from "@/components/export/export-dialog"

interface ExportViewProps {
  onBack: () => void
}

export function ExportView({ onBack }: ExportViewProps) {
  return <ExportDialog isOpen={true} onClose={onBack} mode="page" />
}
