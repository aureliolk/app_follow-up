// app/follow-up/_components/FunnelStagesView.tsx
"use client"

import type React from "react"
import { useState } from "react"

export interface FunnelStage {
  id: string
  name: string
  order: number
  description?: string | null
  created_at: string
  stepsCount?: number
  activeClientsCount?: number
}

interface FunnelStagesViewProps {
  stages: FunnelStage[]
  isLoading: boolean
  onAddStage: (name: string, description?: string) => void
  onEditStage: (id: string, name: string, description?: string) => void
  onDeleteStage: (id: string) => void
  onSelectStage: (stage: FunnelStage) => void
}

const FunnelStagesView: React.FC<FunnelStagesViewProps> = ({
  stages,
  isLoading,
  onAddStage,
  onEditStage,
  onDeleteStage,
  onSelectStage,
}) => {
  const [showAddForm, setShowAddForm] = useState(false)
  const [newStageName, setNewStageName] = useState("")
  const [newStageDescription, setNewStageDescription] = useState("")
  const [editingStage, setEditingStage] = useState<FunnelStage | null>(null)

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newStageName.trim()) return

    onAddStage(newStageName, newStageDescription)

    // Limpar form
    setNewStageName("")
    setNewStageDescription("")
    setShowAddForm(false)
  }

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingStage || !editingStage.name.trim()) return

    onEditStage(editingStage.id, editingStage.name, editingStage.description || undefined)
    setEditingStage(null)
  }

  const handleStageClick = (stage: FunnelStage) => {
    onSelectStage(stage)
  }

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold text-white">Estágios do Funil</h2>
        <button
          onClick={() => setShowAddForm(true)}
          className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 transition-colors"
        >
          Adicionar Estágio
        </button>
      </div>

      {/* Formulário para adicionar estágio */}
      {showAddForm && (
        <div className="mb-6 bg-gray-700 p-4 rounded-lg">
          <h3 className="text-lg font-medium text-white mb-3">Novo Estágio</h3>
          <form onSubmit={handleAddSubmit}>
            <div className="grid grid-cols-1 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Nome do Estágio *</label>
                <input
                  type="text"
                  value={newStageName}
                  onChange={(e) => setNewStageName(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-600 text-white rounded-md"
                  placeholder="Ex: Qualificação"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Descrição</label>
                <textarea
                  value={newStageDescription}
                  onChange={(e) => setNewStageDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-600 text-white rounded-md"
                  placeholder="Descreva este estágio do funil"
                  rows={3}
                />
              </div>
            </div>
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
              >
                Adicionar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Formulário para editar estágio */}
      {editingStage && (
        <div className="mb-6 bg-gray-700 p-4 rounded-lg">
          <h3 className="text-lg font-medium text-white mb-3">Editar Estágio</h3>
          <form onSubmit={handleEditSubmit}>
            <div className="grid grid-cols-1 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Nome do Estágio *</label>
                <input
                  type="text"
                  value={editingStage.name}
                  onChange={(e) => setEditingStage({ ...editingStage, name: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-600 text-white rounded-md"
                  placeholder="Ex: Qualificação"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Descrição</label>
                <textarea
                  value={editingStage.description || ""}
                  onChange={(e) => setEditingStage({ ...editingStage, description: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-600 text-white rounded-md"
                  placeholder="Descreva este estágio do funil"
                  rows={3}
                />
              </div>
            </div>
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => setEditingStage(null)}
                className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
              >
                Salvar
              </button>
            </div>
          </form>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center p-6">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-orange-500"></div>
        </div>
      ) : stages.length > 0 ? (
        <div className="overflow-hidden rounded-lg">
          <table className="min-w-full divide-y divide-gray-600">
            <thead className="bg-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Ordem
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Estágio
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Descrição
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Etapas
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Clientes Ativos
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="bg-gray-700 divide-y divide-gray-600">
              {stages.map((stage) => (
                <tr
                  key={stage.id}
                  className="hover:bg-gray-650 cursor-pointer transition-colors"
                  onClick={() => handleStageClick(stage)}
                >
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{stage.order}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-white font-medium">{stage.name}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{stage.description || "-"}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{stage.stepsCount || 0}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{stage.activeClientsCount || 0}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex space-x-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setEditingStage(stage)
                        }}
                        className="text-blue-400 hover:text-blue-300"
                      >
                        Editar
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          if (confirm(`Tem certeza que deseja excluir o estágio "${stage.name}"?`)) {
                            onDeleteStage(stage.id)
                          }
                        }}
                        className="text-red-400 hover:text-red-300"
                      >
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-6 text-gray-400">
          Nenhum estágio de funil cadastrado.
          <p className="mt-2">Crie o primeiro estágio clicando no botão "Adicionar Estágio".</p>
        </div>
      )}
    </div>
  )
}

export default FunnelStagesView

