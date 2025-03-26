"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import { toast } from "react-hot-toast"
import Link from "next/link"
import { Loader2, ArrowLeft, Save, Plus, Trash2, Edit2 } from "lucide-react"
import MainNavigation from "../../campaigns/_components/MainNavigation"
import { Footer } from "../../campaigns/_components"

// Tipos
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

interface Campaign {
  id: string
  name: string
  description: string | null
  active: boolean
  idLumibot?: string
  tokenAgentLumibot?: string
  steps: Step[]
  stages?: FunnelStage[]
}

export default function EditCampaignPage() {
  const params = useParams()
  const router = useRouter()
  const campaignId = Array.isArray(params.id) ? params.id[0] : (params.id as string)

  // Estados
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [funnelStages, setFunnelStages] = useState<FunnelStage[]>([])

  // Estado para edição
  const [campaignName, setCampaignName] = useState("")
  const [campaignDescription, setCampaignDescription] = useState("")
  const [idLumibot, setIdLumibot] = useState<string>("") 
  const [tokenAgentLumibot, setTokenAgentLumibot] = useState<string>("")
  const [campaignSteps, setCampaignSteps] = useState<Step[]>([])

  // Estado para modal de edição de estágio
  const [showStepModal, setShowStepModal] = useState(false)
  const [currentStep, setCurrentStep] = useState<Step | null>(null)
  const [editingStepIndex, setEditingStepIndex] = useState<number | null>(null)

  // Estado para modal de edição de etapa do funil
  const [showStageModal, setShowStageModal] = useState(false)
  const [currentStage, setCurrentStage] = useState<FunnelStage | null>(null)

  // Carregar dados da campanha
  const fetchCampaignData = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      // Adicionar timestamp para evitar cache
      const timestamp = Date.now()
      const response = await fetch(`/api/follow-up/campaigns/${campaignId}?t=${timestamp}`)
        
      if (!response.ok) {
        throw new Error("Falha ao carregar dados da campanha")
      }

      const data = await response.json()

      console.log("Dados recebidos da API:", data)

      if (!data.success) {
        throw new Error(data.error || "Erro ao carregar campanha")
      }

      // Processar os steps se estiverem em formato string
      let steps: Step[] = []
      if (typeof data.data.steps === "string") {
        try {
          steps = JSON.parse(data.data.steps)
        } catch (e) {
          console.error("Erro ao processar steps:", e)
          steps = []
        }
      } else {
        steps = data.data.steps || []
      }

      const campaignData = {
        ...data.data,
        steps,
      }

      console.log("Dados processados da campanha:", {
        id: campaignData.id,
        name: campaignData.name,
        description: campaignData.description,
        idLumibot: campaignData.idLumibot,
        tokenAgentLumibot: campaignData.tokenAgentLumibot
      })

      setCampaign(campaignData)
      setCampaignName(campaignData.name)
      setCampaignDescription(campaignData.description || "")
      setIdLumibot(campaignData.idLumibot || "")
      setTokenAgentLumibot(campaignData.tokenAgentLumibot || "")
      setCampaignSteps(steps)

      // Carregar estágios do funil
      await fetchFunnelStages()
    } catch (err) {
      console.error("Erro ao carregar dados:", err)
      setError("Falha ao carregar dados da campanha. Por favor, tente novamente.")
      toast.error("Falha ao carregar campanha")
    } finally {
      setIsLoading(false)
    }
  }, [campaignId])

  // Carregar estágios do funil
  const fetchFunnelStages = async () => {
    try {
      const response = await fetch(`/api/follow-up/funnel-stages?campaignId=${campaignId}`)

      if (!response.ok) {
        throw new Error("Falha ao carregar estágios do funil")
      }

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error || "Erro ao carregar estágios do funil")
      }

      setFunnelStages(data.data)
    } catch (err) {
      console.error("Erro ao carregar estágios do funil:", err)
      toast.error("Falha ao carregar estágios do funil")
    }
  }

  // Carregar dados iniciais
  useEffect(() => {
    fetchCampaignData()
  }, [fetchCampaignData])

  // Salvar campanha
  const handleSaveCampaign = async () => {
    setIsSaving(true)
    setError(null)

    try {
      // Log para depuração
      console.log("Enviando dados para API:", {
        name: campaignName,
        description: campaignDescription,
        idLumibot,
        tokenAgentLumibot,
        steps: campaignSteps.length,
      });
      
      const response = await fetch(`/api/follow-up/campaigns/${campaignId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: campaignName,
          description: campaignDescription,
          idLumibot,
          tokenAgentLumibot,
          steps: campaignSteps,
        }),
      })

      if (!response.ok) {
        console.error("Resposta não-OK da API:", {
          status: response.status,
          statusText: response.statusText
        });
        throw new Error(`Falha ao salvar campanha: ${response.status} ${response.statusText}`);
      }
      
      // Tenta extrair e logar a resposta
      const responseText = await response.text();
      let data;
      
      try {
        data = JSON.parse(responseText);
        console.log("Resposta da API:", data);
      } catch (e) {
        console.error("Falha ao interpretar resposta como JSON:", responseText);
        throw new Error("Resposta inválida da API");
      }

      if (!data.success) {
        console.error("API retornou erro:", data.error);
        throw new Error(data.error || "Erro ao salvar campanha");
      }

      toast.success("Campanha salva com sucesso!")

      // Recarregar dados para garantir consistência
      await fetchCampaignData()
    } catch (err) {
      console.error("Erro ao salvar campanha:", err)
      setError("Falha ao salvar campanha. Por favor, tente novamente.")
      toast.error("Falha ao salvar campanha")
    } finally {
      setIsSaving(false)
    }
  }

  // Adicionar novo estágio
  const handleAddStep = () => {
    setCurrentStep({
      stage_id: "",
      stage_name: "",
      template_name: "",
      wait_time: "30 minutos",
      message: "",
      category: "Utility",
      auto_respond: true,
    })
    setEditingStepIndex(null)
    setShowStepModal(true)
  }

  // Editar estágio existente
  const handleEditStep = (step: Step, index: number) => {
    setCurrentStep({ ...step })
    setEditingStepIndex(index)
    setShowStepModal(true)
  }

  // Remover estágio
  const handleRemoveStep = (index: number) => {
    if (!confirm("Tem certeza que deseja remover este estágio?")) return

    const newSteps = [...campaignSteps]
    newSteps.splice(index, 1)
    setCampaignSteps(newSteps)
    toast.success("Estágio removido")
  }

  // Salvar estágio (novo ou editado)
  const handleSaveStep = () => {
    if (!currentStep) return

    // Validação básica
    if (!currentStep.stage_id || !currentStep.template_name || !currentStep.wait_time || !currentStep.message) {
      toast.error("Preencha todos os campos obrigatórios")
      return
    }

    // Encontrar o nome do estágio a partir do ID
    const stage = funnelStages.find((s) => s.id === currentStep.stage_id)
    if (stage) {
      currentStep.stage_name = stage.name
    }

    const newSteps = [...campaignSteps]

    if (editingStepIndex !== null) {
      // Editando estágio existente
      newSteps[editingStepIndex] = currentStep
    } else {
      // Adicionando novo estágio
      newSteps.push(currentStep)
    }

    setCampaignSteps(newSteps)
    setShowStepModal(false)
    toast.success(editingStepIndex !== null ? "Estágio atualizado" : "Estágio adicionado")
  }

  // Adicionar nova etapa do funil
  const handleAddStage = () => {
    setCurrentStage({
      id: "",
      name: "",
      description: "",
      order: funnelStages.length + 1,
    })
    setShowStageModal(true)
  }

  // Editar etapa do funil existente
  const handleEditStage = (stage: FunnelStage) => {
    setCurrentStage({ ...stage })
    setShowStageModal(true)
  }

  // Salvar etapa do funil (nova ou editada)
  const handleSaveStage = async () => {
    if (!currentStage) return

    // Validação básica
    if (!currentStage.name) {
      toast.error("Nome da etapa é obrigatório")
      return
    }

    try {
      let response

      if (currentStage.id) {
        // Atualizar etapa existente
        response = await fetch(`/api/follow-up/funnel-stages`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id: currentStage.id,
            name: currentStage.name,
            description: currentStage.description,
            order: currentStage.order,
          }),
        })
      } else {
        // Criar nova etapa
        response = await fetch(`/api/follow-up/funnel-stages`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: currentStage.name,
            description: currentStage.description,
            order: currentStage.order,
            campaignId: campaignId,
          }),
        })
      }

      if (!response.ok) {
        throw new Error("Falha ao salvar etapa do funil")
      }

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error || "Erro ao salvar etapa do funil")
      }

      // Recarregar estágios do funil
      await fetchFunnelStages()
      setShowStageModal(false)
      toast.success(currentStage.id ? "Etapa atualizada" : "Etapa adicionada")
    } catch (err) {
      console.error("Erro ao salvar etapa do funil:", err)
      toast.error("Falha ao salvar etapa do funil")
    }
  }

  // Remover etapa do funil
  const handleRemoveStage = async (stageId: string) => {
    if (
      !confirm(
        "Tem certeza que deseja remover esta etapa do funil? Isso também removerá todos os estágios associados a ela.",
      )
    )
      return

    try {
      const response = await fetch(`/api/follow-up/funnel-stages?id=${stageId}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        throw new Error("Falha ao remover etapa do funil")
      }

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error || "Erro ao remover etapa do funil")
      }

      // Recarregar estágios do funil
      await fetchFunnelStages()

      // Remover estágios associados a esta etapa
      const newSteps = campaignSteps.filter((step) => step.stage_id !== stageId)
      setCampaignSteps(newSteps)

      toast.success("Etapa removida com sucesso")
    } catch (err) {
      console.error("Erro ao remover etapa do funil:", err)
      toast.error("Falha ao remover etapa do funil")
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex flex-col">
        <MainNavigation />
        <main className="flex-1 container mx-auto px-4 py-6">
          <div className="flex justify-center p-8">
            <Loader2 className="h-12 w-12 animate-spin text-orange-500" />
          </div>
        </main>
        <Footer />
      </div>
    )
  }

  if (!campaign) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex flex-col">
        <MainNavigation />
        <main className="flex-1 container mx-auto px-4 py-6">
          <div className="flex items-center mb-6">
            <Link href="/follow-up/campaigns" className="text-gray-400 hover:text-white mr-2">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <h1 className="text-2xl font-bold">Campanha não encontrada</h1>
          </div>
          <div className="bg-red-900/50 border border-red-500 text-white p-4 rounded">
            Não foi possível carregar os dados da campanha. Verifique se o ID é válido.
          </div>
        </main>
        <Footer />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      <MainNavigation />

      <main className="flex-1 container mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            <Link href="/follow-up/campaigns" className="text-gray-400 hover:text-white mr-2">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <h1 className="text-2xl font-bold">Editar Campanha</h1>
          </div>
          <button
            onClick={handleSaveCampaign}
            disabled={isSaving}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors flex items-center"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Salvar Campanha
          </button>
        </div>

        {error && <div className="bg-red-900/50 border border-red-500 text-white p-4 rounded-md mb-6">{error}</div>}

        {/* Informações básicas da campanha */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Informações Básicas</h2>
          <div className="grid grid-cols-1 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Nome da Campanha *</label>
              <input
                type="text"
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 text-white rounded-md border border-gray-600"
                placeholder="Ex: Campanha de Vendas"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Descrição</label>
              <textarea
                value={campaignDescription}
                onChange={(e) => setCampaignDescription(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 text-white rounded-md border border-gray-600"
                placeholder="Descreva o objetivo desta campanha"
                rows={3}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">ID Lumibot</label>
              <input
                type="text"
                value={idLumibot}
                onChange={(e) => setIdLumibot(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 text-white rounded-md border border-gray-600"
                placeholder="ID do bot no Lumibot"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Token do Agente Lumibot</label>
              <input
                type="text"
                value={tokenAgentLumibot}
                onChange={(e) => setTokenAgentLumibot(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 text-white rounded-md border border-gray-600"
                placeholder="Token de autenticação do agente"
              />
            </div>
          </div>
        </div>

        {/* Etapas do Funil */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Etapas do Funil</h2>
            <button
              onClick={handleAddStage}
              className="px-3 py-1 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors flex items-center text-sm"
            >
              <Plus className="h-4 w-4 mr-1" />
              Nova Etapa
            </button>
          </div>

          {funnelStages.length === 0 ? (
            <div className="bg-gray-700 p-4 rounded-lg text-center">
              <p className="text-gray-400">Nenhuma etapa do funil cadastrada.</p>
              <p className="text-sm text-gray-500 mt-2">
                Adicione etapas do funil para poder organizar seus estágios de campanha.
              </p>
            </div>
          ) : (
            <div className="bg-gray-700 rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-gray-600">
                <thead className="bg-gray-800">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-400">Ordem</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-400">Nome</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-400">Descrição</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-400">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-600">
                  {funnelStages.map((stage) => (
                    <tr key={stage.id} className="hover:bg-gray-600/30">
                      <td className="px-4 py-2 text-sm font-medium text-white">{stage.order}</td>
                      <td className="px-4 py-2 text-sm text-white">{stage.name}</td>
                      <td className="px-4 py-2 text-sm text-gray-300">{stage.description || "-"}</td>
                      <td className="px-4 py-2 text-sm flex space-x-2">
                        <button
                          onClick={() => handleEditStage(stage)}
                          className="text-blue-400 hover:text-blue-300"
                          title="Editar etapa"
                        >
                          <Edit2 className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => handleRemoveStage(stage.id)}
                          className="text-red-400 hover:text-red-300"
                          title="Remover etapa"
                        >
                          <Trash2 className="h-5 w-5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Estágios da Campanha */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Estágios da Campanha</h2>
            <button
              onClick={handleAddStep}
              disabled={funnelStages.length === 0}
              className={`px-3 py-1 bg-orange-600 text-white rounded-md hover:bg-orange-700 transition-colors flex items-center text-sm ${
                funnelStages.length === 0 ? "opacity-50 cursor-not-allowed" : ""
              }`}
            >
              <Plus className="h-4 w-4 mr-1" />
              Novo Estágio
            </button>
          </div>

          {funnelStages.length === 0 ? (
            <div className="bg-gray-700 p-4 rounded-lg text-center">
              <p className="text-gray-400">Você precisa criar etapas do funil antes de adicionar estágios.</p>
            </div>
          ) : campaignSteps.length === 0 ? (
            <div className="bg-gray-700 p-4 rounded-lg text-center">
              <p className="text-gray-400">Nenhum estágio adicionado.</p>
              <p className="text-sm text-gray-500 mt-2">
                Adicione estágios para definir as mensagens que serão enviadas em cada etapa do funil.
              </p>
            </div>
          ) : (
            <div className="bg-gray-700 rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-gray-600">
                <thead className="bg-gray-800">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-400">Etapa</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-400">Template</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-400">Tempo de Espera</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-400">Categoria</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-400">Mensagem</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-400">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-600">
                  {campaignSteps.map((step, index) => (
                    <tr key={index} className="hover:bg-gray-600/30">
                      <td className="px-4 py-2 text-sm text-orange-400">{step.stage_name}</td>
                      <td className="px-4 py-2 text-sm text-white">{step.template_name}</td>
                      <td className="px-4 py-2 text-sm text-gray-300">{step.wait_time}</td>
                      <td className="px-4 py-2 text-sm text-gray-300">{step.category}</td>
                      <td className="px-4 py-2 text-sm text-gray-300">
                        <div className="max-w-md truncate">
                          {step.message.substring(0, 60)}
                          {step.message.length > 60 ? "..." : ""}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-sm flex space-x-2">
                        <button
                          onClick={() => handleEditStep(step, index)}
                          className="text-blue-400 hover:text-blue-300"
                          title="Editar estágio"
                        >
                          <Edit2 className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => handleRemoveStep(index)}
                          className="text-red-400 hover:text-red-300"
                          title="Remover estágio"
                        >
                          <Trash2 className="h-5 w-5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      <Footer />

      {/* Modal de Edição de Estágio */}
      {showStepModal && currentStep && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-xl font-semibold mb-4">
                {editingStepIndex !== null ? "Editar Estágio" : "Novo Estágio"}
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Etapa do Funil *</label>
                  <select
                    value={currentStep.stage_id}
                    onChange={(e) => setCurrentStep({ ...currentStep, stage_id: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-700 text-white rounded-md border border-gray-600"
                    required
                  >
                    <option value="">Selecione uma etapa</option>
                    {funnelStages.map((stage) => (
                      <option key={stage.id} value={stage.id}>
                        {stage.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Nome do Template *</label>
                  <input
                    type="text"
                    value={currentStep.template_name}
                    onChange={(e) => setCurrentStep({ ...currentStep, template_name: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-700 text-white rounded-md border border-gray-600"
                    placeholder="Ex: boas_vindas_1"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Tempo de Espera *</label>
                  <input
                    type="text"
                    value={currentStep.wait_time}
                    onChange={(e) => setCurrentStep({ ...currentStep, wait_time: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-700 text-white rounded-md border border-gray-600"
                    placeholder="Ex: 30 minutos, 1 hora, 1 dia"
                    required
                  />
                  <div className="flex flex-wrap gap-2 mt-2">
                    {["30 minutos", "1 hora", "6 horas", "12 horas", "24 horas", "2 dias", "7 dias"].map((time) => (
                      <button
                        key={time}
                        type="button"
                        onClick={() => setCurrentStep({ ...currentStep, wait_time: time })}
                        className="bg-gray-600 px-2 py-1 rounded text-xs hover:bg-gray-500"
                      >
                        {time}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Categoria</label>
                  <select
                    value={currentStep.category || "Utility"}
                    onChange={(e) => setCurrentStep({ ...currentStep, category: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-700 text-white rounded-md border border-gray-600"
                  >
                    <option value="Utility">Utilitário</option>
                    <option value="Marketing">Marketing</option>
                    <option value="Onboarding">Onboarding</option>
                    <option value="Support">Suporte</option>
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-300 mb-1">Mensagem *</label>
                  <textarea
                    value={currentStep.message}
                    onChange={(e) => setCurrentStep({ ...currentStep, message: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-700 text-white rounded-md border border-gray-600"
                    placeholder="Digite o conteúdo da mensagem..."
                    rows={5}
                    required
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={currentStep.auto_respond !== false}
                      onChange={(e) => setCurrentStep({ ...currentStep, auto_respond: e.target.checked })}
                      className="rounded bg-gray-700 border-gray-600"
                    />
                    <span className="text-sm text-gray-300">Resposta automática habilitada</span>
                  </label>
                </div>
              </div>

              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setShowStepModal(false)}
                  className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveStep}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                >
                  Salvar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Edição de Etapa do Funil */}
      {showStageModal && currentStage && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg w-full max-w-md">
            <div className="p-6">
              <h2 className="text-xl font-semibold mb-4">
                {currentStage.id ? "Editar Etapa do Funil" : "Nova Etapa do Funil"}
              </h2>

              <div className="grid grid-cols-1 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Nome da Etapa *</label>
                  <input
                    type="text"
                    value={currentStage.name}
                    onChange={(e) => setCurrentStage({ ...currentStage, name: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-700 text-white rounded-md border border-gray-600"
                    placeholder="Ex: Qualificação"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Descrição</label>
                  <textarea
                    value={currentStage.description || ""}
                    onChange={(e) => setCurrentStage({ ...currentStage, description: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-700 text-white rounded-md border border-gray-600"
                    placeholder="Descreva o objetivo desta etapa"
                    rows={3}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Ordem</label>
                  <input
                    type="number"
                    value={currentStage.order}
                    onChange={(e) => setCurrentStage({ ...currentStage, order: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-gray-700 text-white rounded-md border border-gray-600"
                    min="1"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setShowStageModal(false)}
                  className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveStage}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                >
                  Salvar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

