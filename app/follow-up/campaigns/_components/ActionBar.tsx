// app/follow-up/_components/ActionBar.tsx
"use client"

import type React from "react"
import { TabNavigation } from "./TabNavigation"
import { SearchBar } from "./SearchBar"

interface ActionBarProps {
  activeTab: string
  onTabChange: (tab: string) => void
  searchTerm: string
  onSearch: (term: string) => void
  showNewForm: boolean
  onToggleForm: () => void
}

export const ActionBar: React.FC<ActionBarProps> = ({
  activeTab,
  onTabChange,
  searchTerm,
  onSearch,
  showNewForm,
  onToggleForm,
}) => {
  return (
    <div className="flex justify-between items-center mb-6">
      <TabNavigation activeTab={activeTab} onTabChange={onTabChange} />
      <SearchBar searchTerm={searchTerm} onSearch={onSearch} showNewForm={showNewForm} onToggleForm={onToggleForm} />
    </div>
  )
}

