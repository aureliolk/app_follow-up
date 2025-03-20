// app/follow-up/_components/TabNavigation.tsx
"use client"

import type React from "react"

interface TabNavigationProps {
  activeTab: string
  onTabChange: (tab: string) => void
}

export const TabNavigation: React.FC<TabNavigationProps> = ({ activeTab, onTabChange }) => {
  const tabs = [
    { id: "active", label: "Ativos" },
    { id: "paused", label: "Pausados" },
    { id: "completed", label: "Concluídos" },
    { id: "canceled", label: "Cancelados" },
  ]

  return (
    <div className="flex space-x-2">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`px-3 py-1 rounded-md text-sm font-medium ${
            activeTab === tab.id ? "bg-orange-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

