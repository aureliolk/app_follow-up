// app/follow-up/campaigns/_components/FunnelStagesTabs.tsx
"use client"

import type React from "react"
import { useState, useEffect, useMemo } from "react"
import { toast } from "react-hot-toast"
import type { FunnelStep, FunnelStage } from "@/app/follow-up/_types/schema"
import { useFunnelSteps } from "@/app/follow-up/_services/funnelService"
import StepFormRHF from "./StepFormRHF" // Make sure this path is correct

interface FunnelStagesTabsProps {
  steps: FunnelStep[]
  funnelStages: FunnelStage[]
  campaignId?: string
  onRefreshSteps: () => Promise<void>
}

const FunnelStagesTabs: React.FC<FunnelStagesTabsProps> = ({ steps, funnelStages, campaignId, onRefreshSteps }) => {
  // Estados para gerenciamento de formulários
  const [isEditMode, setIsEditMode] = useState(false)
  const [currentStep, setCurrentStep] = useState<FunnelStep | null>(null)
  const [selectedStageId, setSelectedStageId] = useState<string>("")

  // Hook personalizado para operações de passos
  const { updateStep, deleteStep, createStep, isLoading } = useFunnelSteps()

  // Agrupar os estágios por etapa do funil
  const stageGroups = useMemo(() => {
    const groups: Record<string, FunnelStep[]> = {}

    // Agrupar por etapa usando stage_id como chave
    steps.forEach((step) => {
      const stageId = step.stage_id || "undefined"
      const stageName = step.stage_name || "Sem etapa definida"

      // Criar uma chave composta para garantir unicidade
      const groupKey = `${stageId}:${stageName}`

      if (!groups[groupKey]) {
        groups[groupKey] = []
      }
      groups[groupKey].push(step)
    })

    // Ordenar os grupos de etapas
    return Object.entries(groups).map(([key, steps]) => {
      // Extrair o nome do estágio da chave composta
      const stageName = key.split(":")[1]
      return [stageName, steps] as [string, FunnelStep[]]
    })
  }, [steps])

  // Estado para controlar qual guia está ativa
  const [activeStage, setActiveStage] = useState<string>("")

  // Atualizar a guia ativa quando os grupos forem carregados
  useEffect(() => {
    if (stageGroups.length > 0) {
      setActiveStage(stageGroups[0][0])
    }
  }, [stageGroups])

  // Ao mudar de guia, se estiver editando, cancelar a edição
  useEffect(() => {
    if (isEditMode) {
      setIsEditMode(false)
      setCurrentStep(null)
    }
  }, [activeStage])

  // Manipuladores de eventos
  const handleEditStep = (step: FunnelStep) => {
    if (!step.id) {
      toast.error("Este estágio não possui um identificador válido")
      return
    }

    if (!step.stage_id) {
      toast.error("Este estágio não está associado a uma etapa válida")
      return
    }

    setCurrentStep(step)
    setIsEditMode(true)
    setSelectedStageId(step.stage_id)
  }

  const handleRemoveStep = async (step: FunnelStep) => {
    if (!step.id) {
      toast.error("Este estágio não possui um identificador válido")
      return
    }

    // Confirmar antes de remover
    if (!confirm(`Tem certeza que deseja remover o estágio "${step.template_name}"`)) {
      return
    }

    try {
      await deleteStep(step.id)
      await onRefreshSteps()
      toast.success("Estágio removido com sucesso")
    } catch (err) {
      console.error("Erro ao remover estágio:", err)
      toast.error("Erro ao remover estágio")
    }
  }

  const handleSubmitStep = async (data: FunnelStep) => {
    try {
      if (!data.stage_id || !data.template_name || !data.wait_time || !data.message) {
        const missingFields = []
        if (!data.stage_id) missingFields.push("etapa do funil")
        if (!data.template_name) missingFields.push("nome do template")
        if (!data.wait_time) missingFields.push("tempo de espera")
        if (!data.message) missingFields.push("mensagem")

        toast.error(`Por favor, preencha todos os campos obrigatórios: ${missingFields.join(", ")}`)
        return
      }

      // Adicionar ID do campanha quando disponível
      if (campaignId) {
        console.log(`Associando estágio à campanha: ${campaignId}`)
      }

      if (isEditMode && currentStep?.id) {
        await updateStep(currentStep.id, data)
      } else {
        await createStep(data)
      }

      await onRefreshSteps()
      setIsEditMode(false)
      setCurrentStep(null)
      toast.success(isEditMode ? "Estágio atualizado com sucesso" : "Estágio adicionado com sucesso")
    } catch (err) {
      console.error("Erro ao salvar estágio:", err)
      toast.error("Erro ao salvar estágio")
    }
  }

  const cancelEditMode = () => {
    setIsEditMode(false)
    setCurrentStep(null)
  }

  // Adicionar novo passo
  const handleAddNewStep = () => {
    // Selecionar o estágio ativo para pré-preencher o formulário
    const activeStepGroup = stageGroups.find(([name]) => name === activeStage)
    if (activeStepGroup && activeStepGroup[1].length > 0) {
      const sampleStep = activeStepGroup[1][0]
      if (sampleStep && sampleStep.stage_id) {
        setSelectedStageId(sampleStep.stage_id)
      }
    } else if (funnelStages.length > 0) {
      // Se não tiver estágios ativos, selecionar o primeiro estágio disponível
      setSelectedStageId(funnelStages[0].id)
    }
    setIsEditMode(false)
    setCurrentStep(null)
  }

  // Se não houver estágios, mostrar mensagem
  if (stageGroups.length === 0 && !isEditMode) {
    return (
      <div className="space-y-4">
        <div className="p-8 text-center text-gray-400">Nenhum estágio encontrado para esta campanha.</div>
        {funnelStages.length > 0 ? (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={handleAddNewStep}
              className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 transition-colors"
            >
              Adicionar Primeiro Estágio
            </button>
          </div>
        ) : (
          <div className="text-center text-sm text-gray-500 mt-2">
            Adicione primeiro uma etapa do funil antes de adicionar estágios.
          </div>
        )}
      </div>
    )
  }

  // Calcular qual estágio está ativo
  const activeStageGroup = stageGroups.find(([name]) => name === activeStage)
  const activeSteps = activeStageGroup ? activeStageGroup[1] : []

  return (
    <div>
      {/* Formulário de edição/adição */}
      {(isEditMode || (currentStep === null && !isEditMode && selectedStageId)) && (
        <StepFormRHF
          defaultValues={currentStep || undefined}
          funnelStages={funnelStages}
          isEditing={isEditMode}
          onCancel={cancelEditMode}
          onSubmit={handleSubmitStep}
          isLoading={isLoading}
          selectedStage={selectedStageId}
        />
      )}

      {/* Guias de navegação horizontal */}
      <div className="flex justify-between items-center border-b border-gray-700">
        <div className="flex overflow-x-auto">
          {stageGroups.map(([stageName, stageSteps], index) => (
            <button
              type="button"
              key={stageName}
              onClick={(e) => {
                e.preventDefault()
                setActiveStage(stageName)
              }}
              className={`px-6 py-3 whitespace-nowrap ${
                activeStage === stageName
                  ? "text-orange-500 border-b-2 border-orange-500 font-medium"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              {stageName} ({stageSteps.length})
            </button>
          ))}
        </div>
        <div className="pr-4 flex items-center">
          {isLoading ? (
            <span className="text-xs text-gray-400 flex items-center">
              <svg
                className="animate-spin h-4 w-4 mr-1 text-orange-500"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              Carregando...
            </span>
          ) : (
            <button
              type="button"
              onClick={handleAddNewStep}
              className="px-3 py-1 bg-orange-600 text-sm text-white rounded-md hover:bg-orange-700 transition-colors disabled:opacity-50"
              disabled={isLoading || funnelStages.length === 0}
            >
              Adicionar Estágio
            </button>
          )}
        </div>
      </div>

      {/* Conteúdo da guia ativa */}
      <div className="p-4">
        {activeSteps.length > 0 ? (
          <table className="min-w-full divide-y divide-gray-600">
            <thead className="bg-gray-800/50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-400">Ordem</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-400">Template</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-400">Tempo de Espera</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-400">Mensagem</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-400">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-600">
              {activeSteps.map((step, idx) => (
                <tr key={step.id || `step-${idx}-${step.template_name}`} className="hover:bg-gray-600/30">
                  <td className="px-4 py-2 text-sm font-medium text-white">{idx + 1}</td>
                  <td className="px-4 py-2 text-sm text-orange-400">{step.template_name || "Não definido"}</td>
                  <td className="px-4 py-2 text-sm text-gray-300">{step.wait_time}</td>
                  <td className="px-4 py-2 text-sm text-gray-300">
                    <div className="max-w-md truncate">
                      {step.message?.substring(0, 60)}
                      {step.message?.length > 60 ? "..." : ""}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-sm">
                    <div className="flex space-x-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          handleEditStep(step)
                        }}
                        className="text-blue-400 hover:text-blue-300"
                        disabled={isLoading}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-5 w-5"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          handleRemoveStep(step)
                        }}
                        className="text-red-400 hover:text-red-300"
                        disabled={isLoading}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-5 w-5"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path
                            fillRule="evenodd"
                            d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="text-center text-gray-400 py-8">
            Nenhum estágio encontrado nesta etapa.
            <button
              onClick={handleAddNewStep}
              className="block mx-auto mt-4 px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 transition-colors"
            >
              Adicionar Estágio
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default FunnelStagesTabs

