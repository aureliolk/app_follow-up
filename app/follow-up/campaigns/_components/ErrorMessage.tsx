// app/follow-up/campaigns/_components/ErrorMessage.tsx
"use client"

import type React from "react"

interface ErrorMessageProps {
  message: string | null
  onDismiss: () => void
  onClose?: () => void
}

export const ErrorMessage: React.FC<ErrorMessageProps> = ({ message, onDismiss, onClose }) => {
  if (!message) return null

  return (
    <div className="bg-red-900/50 border border-red-500 text-white px-4 py-3 rounded mb-4">
      {message}
      <button className="float-right" onClick={onDismiss}>
        &times;
      </button>
    </div>
  )
}

