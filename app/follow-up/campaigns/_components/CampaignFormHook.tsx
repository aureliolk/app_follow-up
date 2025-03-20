"use client"

import type React from "react"
import { useState, useEffect, useCallback } from "react"
import { useFormContext, Controller } from "react-hook-form"
import FunnelStageForm from "./FunnelStageForm"
import FunnelStageList from "./FunnelStageList"
import StepFormHook from "./StepFormHook"
import FunnelStagesTabs from "./FunnelStagesTabs"

// Adiciona handleShowAddForm como propriedade global do window
declare global {
  interface Window {
    addStageStep: (stageId: string) => void
  }
}

interface FunnelStage {
  id: string
  name: string
  order: number
  description?: string
}

interface Step {
  id?: string
  stage_id: string
  stage_name: string
  template_name: string
  wait_time: string
  message: string
  category?: string
  auto_respond?: boolean
}

interface CampaignFormHookProps {
  funnelStages: FunnelStage[]
  campaignSteps: Step[]
  onSubmit: () => void
  onCancel: () => void
  onRefreshCampaign?: () => Promise<void>
  campaignId?: string
  isLoading: boolean
  onAddStep?: (newStep: Step) => Promise<boolean>
  onUpdateStep?: (index: number, updatedStep: Step) => Promise<boolean>
  onRemoveStep?: (index: number, step: Step) => Promise<boolean>
  onAddFunnelStage?: (newStage: Omit<FunnelStage, "id">) => Promise<boolean>
  onUpdateFunnelStage?: (stageId: string, updatedStage: Partial<FunnelStage>) => Promise<boolean>
  onRemoveFunnelStage?: (stageId: string) => Promise<boolean>
}

const CampaignFormHook: React.FC<CampaignFormHookProps> = ({
  funnelStages,
  campaignSteps,
  onSubmit,
  onCancel,
  isLoading,
  onAddStep,
  onUpdateStep,
  onRemoveStep,
  onAddFunnelStage,
  onUpdateFunnelStage,
  onRemoveFunnelStage,
  onRefreshCampaign,
  campaignId,
}) => {
  // Acesso ao contexto do formulário
  const {
    register,
    control,
    formState: { errors },
  } = useFormContext()

  // Estados para gerenciar estágios (steps)
  const [selectedStage, setSelectedStage] = useState<string>("")
  const [editingStepIndex, setEditingStepIndex] = useState<number | null>(null)
  const [showStepForm, setShowStepForm] = useState(false)
  const [loadingStep, setLoadingStep] = useState(false)

  // Estados para gerenciamento de etapas do funil
  const [showFunnelStageForm, setShowFunnelStageForm] = useState(false)
  const [editingFunnelStage, setEditingFunnelStage] = useState<FunnelStage | null>(null)
  const [loadingFunnelStage, setLoadingFunnelStage] = useState(false)
  const [newFunnelStage, setNewFunnelStage] = useState<Omit<FunnelStage, "id">>({
    name: "",
    description: "",
    order: 0,
  })

  // Estado para o formulário de estágio
  const [newStep, setNewStep] = useState<Step>({
    stage_id: "",
    stage_name: "",
    template_name: "",
    wait_time: "30 minutos",
    message: "",
    category: "Utility",
    auto_respond: true,
  })

  // Função para mostrar o formulário para adicionar um novo estágio
  const handleShowAddForm = useCallback(
    (stageId?: string) => {
      // Resetar o formulário para um novo estágio
      setNewStep({
        stage_id: stageId || "",
        stage_name: stageId ? funnelStages.find((s) => s.id === stageId)?.name || "" : "",
        template_name: "",
        wait_time: "30 minutos",
        message: "",
        category: "Utility",
        auto_respond: true,
      })
      setEditingStepIndex(null)
      setSelectedStage(stageId || "")
      setShowStepForm(true)

      // Rolar até o formulário
      setTimeout(() => {
        document.getElementById("step-form")?.scrollIntoView({ behavior: "smooth" })
      }, 100)
    },
    [funnelStages],
  )

  // Função para editar um passo existente
  const handleEditStep = (index: number) => {
    // Validar o índice antes de prosseguir
    if (index < 0 || index >= campaignSteps.length) {
      console.error(`Erro ao editar estágio: índice inválido ${index}`)
      alert("Índice de estágio inválido")
      return
    }

    const stepToEdit = campaignSteps[index]

    // Garantir que todos os campos necessários estejam presentes
    setNewStep({
      id: stepToEdit.id,
      stage_id: stepToEdit.stage_id,
      stage_name: stepToEdit.stage_name,
      template_name: stepToEdit.template_name || "",
      wait_time: stepToEdit.wait_time || "30 minutos",
      message: stepToEdit.message || "",
      category: stepToEdit.category || "Utility",
      auto_respond: stepToEdit.auto_respond !== undefined ? stepToEdit.auto_respond : true,
    })

    setEditingStepIndex(index)
    setShowStepForm(true)

    // Se o estágio está definido, selecionar o estágio correto no dropdown
    if (stepToEdit.stage_id) {
      setSelectedStage(stepToEdit.stage_id)
    }

    // Rolar até o formulário de edição
    setTimeout(() => {
      document.getElementById("step-form")?.scrollIntoView({ behavior: "smooth" })
    }, 100)
  }

  const handleAddOrUpdateStep = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (!newStep.stage_id || !newStep.template_name || !newStep.wait_time || !newStep.message) {
      alert("Preencha todos os campos obrigatórios")
      return
    }

    setLoadingStep(true)
    try {
      if (editingStepIndex !== null && onUpdateStep) {
        // Estamos editando um passo existente
        const success = await onUpdateStep(editingStepIndex, newStep)
        if (!success) {
          alert("Erro ao atualizar o estágio no servidor")
          return
        }
        setEditingStepIndex(null) // Sair do modo de edição
      } else if (onAddStep) {
        // Estamos adicionando um novo passo
        const success = await onAddStep({ ...newStep })
        if (!success) {
          alert("Erro ao adicionar o estágio no servidor")
          return
        }
      }

      // Se chegou até aqui, deu tudo certo
      setShowStepForm(false) // Esconder o formulário

      // Resetar o formulário mas manter o estágio selecionado
      setNewStep({
        stage_id: newStep.stage_id,
        stage_name: newStep.stage_name,
        template_name: "",
        wait_time: "30 minutos",
        message: "",
        category: "Utility",
        auto_respond: true,
      })
    } catch (error) {
      console.error("Erro ao salvar estágio:", error)
      alert("Ocorreu um erro ao salvar o estágio")
    } finally {
      setLoadingStep(false)
    }
  }

  const handleCancelEdit = () => {
    setEditingStepIndex(null)
    setShowStepForm(false)
    // Resetar o formulário
    setNewStep({
      stage_id: "",
      stage_name: "",
      template_name: "",
      wait_time: "30 minutos",
      message: "",
      category: "Utility",
      auto_respond: true,
    })
  }

  // Função chamada para remover um estágio
  const handleRemoveStepInternal = async (index: number) => {
    if (onRemoveStep) {
      await onRemoveStep(index, campaignSteps[index])
    }
  }

  // Funções para gerenciar etapas do funil
  const handleShowAddFunnelStageForm = () => {
    setEditingFunnelStage(null)
    setNewFunnelStage({
      name: "",
      description: "",
      order: funnelStages.length, // Próxima ordem disponível
    })
    setShowFunnelStageForm(true)
  }

  const handleEditFunnelStage = (stage: FunnelStage) => {
    setEditingFunnelStage(stage)
    setNewFunnelStage({
      name: stage.name,
      description: stage.description || "",
      order: stage.order,
    })
    setShowFunnelStageForm(true)
  }

  const handleCancelFunnelStageEdit = () => {
    setEditingFunnelStage(null)
    setShowFunnelStageForm(false)
  }

  const handleAddOrUpdateFunnelStage = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (!newFunnelStage.name) {
      alert("O nome da etapa é obrigatório")
      return
    }

    setLoadingFunnelStage(true)

    try {
      if (editingFunnelStage && onUpdateFunnelStage) {
        // Atualizar etapa existente
        const success = await onUpdateFunnelStage(editingFunnelStage.id, newFunnelStage)
        if (success) {
          setShowFunnelStageForm(false)
          setEditingFunnelStage(null)
        } else {
          alert("Erro ao atualizar a etapa do funil")
        }
      } else if (onAddFunnelStage) {
        // Adicionar nova etapa
        const success = await onAddFunnelStage(newFunnelStage)
        if (success) {
          setShowFunnelStageForm(false)
        } else {
          alert("Erro ao adicionar a etapa do funil")
        }
      }
    } catch (error) {
      console.error("Erro ao salvar etapa do funil:", error)
      alert("Ocorreu um erro ao salvar a etapa do funil")
    } finally {
      setLoadingFunnelStage(false)
    }
  }

  const handleRemoveFunnelStageInternal = async (stageId: string) => {
    if (onRemoveFunnelStage) {
      await onRemoveFunnelStage(stageId)
    }
  }

  // Registramos a função global depois que handleShowAddForm está definida
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.addStageStep = handleShowAddForm
    }

    return () => {
      // Limpar ao desmontar
      if (typeof window !== "undefined") {
        delete window.addStageStep
      }
    }
  }, [handleShowAddForm])

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <h2 className="text-xl font-semibold text-white mb-4">Editar Campanha</h2>

      {/* Informações básicas da campanha */}
      <div className="grid grid-cols-1 gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Nome da Campanha *</label>
          <input
            {...register("name", { required: "Nome é obrigatório" })}
            className="w-full px-3 py-2 bg-gray-700 text-white rounded-md border border-gray-600"
            placeholder="Ex: Campanha de Vendas"
          />
          {errors.name && <p className="mt-1 text-sm text-red-500">{errors.name.message?.toString()}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Descrição</label>
          <textarea
            {...register("description")}
            className="w-full px-3 py-2 bg-gray-700 text-white rounded-md border border-gray-600"
            placeholder="Descreva o objetivo desta campanha"
            rows={3}
          />
        </div>
      </div>

      {/* Seção para gerenciar etapas do funil */}
      <div className="mb-6 mt-8">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-white">Gerenciar Etapas do Funil</h3>
        </div>

        {/* Formulário para adicionar/editar etapas do funil */}
        {showFunnelStageForm && (
          <FunnelStageForm
            editingStage={editingFunnelStage}
            newStage={newFunnelStage}
            setNewStage={setNewFunnelStage}
            onCancel={handleCancelFunnelStageEdit}
            onSave={handleAddOrUpdateFunnelStage}
            isLoading={loadingFunnelStage}
          />
        )}

        {/* Tabela de etapas do funil */}
        {funnelStages.length > 0 && (
          <FunnelStageList
            stages={funnelStages}
            onEdit={handleEditFunnelStage}
            onRemove={handleRemoveFunnelStageInternal}
          />
        )}

        {/* Mensagem quando não há etapas */}
        {funnelStages.length === 0 && (
          <div className="bg-gray-700 p-4 rounded-lg mb-4 text-center">
            <p className="mb-4">Nenhuma etapa do funil cadastrada.</p>
            <p className="italic text-sm text-gray-500 mb-4">
              Adicione etapas do funil para poder organizar seus estágios de campanha.
            </p>
          </div>
        )}

        <button
          type="button"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            handleShowAddFunnelStageForm()
          }}
          className="px-3 py-1 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors flex items-center text-sm"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z"
              clipRule="evenodd"
            />
          </svg>
          Nova Etapa do Funil
        </button>
      </div>

      {/* Seção para adicionar estágios ao funil */}
      {funnelStages.length > 0 && (
        <div className="mb-6">
          <h3 className="text-lg font-medium text-white mb-2">Estágios da Campanha</h3>

          {campaignSteps.length > 0 ? (
            <div className="bg-gray-700 rounded-lg overflow-hidden mb-4">
              <Controller
                name="steps"
                control={control}
                render={({ field }) => (
                  <FunnelStagesTabs
                    steps={field.value}
                    funnelStages={funnelStages}
                    campaignId={campaignId || ""}
                    onRefreshSteps={() => {
                      // Recarregar os passos após alterações
                      if (onRefreshCampaign) {
                        return onRefreshCampaign()
                      }
                      return Promise.resolve()
                    }}
                  />
                )}
              />
            </div>
          ) : (
            <div className="text-gray-400 bg-gray-700 rounded-lg p-6 my-4 text-center">
              <p className="mb-4">
                Nenhum estágio adicionado. Use o botão abaixo para adicionar estágios às etapas do funil.
              </p>
              <p className="italic text-sm text-gray-500">
                É necessário adicionar pelo menos um estágio em cada etapa do funil para que a campanha funcione
                corretamente.
              </p>
            </div>
          )}

          {/* Botão para adicionar novo estágio */}
          {!showStepForm && (
            <div className="mb-4">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  handleShowAddForm()
                }}
                className="px-3 py-1 bg-orange-600 text-white rounded-md hover:bg-orange-700 transition-colors flex items-center"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5 mr-1"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z"
                    clipRule="evenodd"
                  />
                </svg>
                Adicionar Novo Estágio
              </button>
            </div>
          )}

          {/* Formulário para adicionar/editar estágio */}
          {showStepForm && (
            <StepFormHook
              newStep={newStep}
              setNewStep={setNewStep}
              funnelStages={funnelStages}
              isEditing={editingStepIndex !== null}
              onCancel={handleCancelEdit}
              onSave={handleAddOrUpdateStep}
              isLoading={loadingStep}
              selectedStage={selectedStage}
            />
          )}
        </div>
      )}

      {/* Botões de ação */}
      <div className="flex justify-end space-x-3">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
          disabled={isLoading}
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onSubmit}
          className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
          disabled={isLoading}
        >
          {isLoading ? "Salvando..." : "Salvar Campanha"}
        </button>
      </div>
    </div>
  )
}

export default CampaignFormHook

