// app/follow-up/_services/followUpService.ts
import axios from "axios"
import type { FollowUp, Campaign, CampaignStep, FunnelStage, FunnelStep } from "../_types"

// Cache simples para campanhas
const campaignStepsCache: Record<string, { data: any[]; timestamp: number }> = {}
const CACHE_TTL = 60000 // 1 minuto de TTL para o cache

export const followUpService = {
  // Função para buscar follow-ups
  async getFollowUps(status?: string): Promise<FollowUp[]> {
    try {
      const response = await axios.get("/api/follow-up", {
        params: status ? { status } : undefined,
      })

      if (!response.data.success) {
        throw new Error(response.data.error || "Failed to fetch follow-ups")
      }

      return response.data.data || []
    } catch (error) {
      console.error("Error fetching follow-ups:", error)
      throw error
    }
  },

  // Função para buscar campanhas
  async getCampaigns(): Promise<Campaign[]> {
    try {
      const response = await axios.get("/api/follow-up/campaigns")

      if (!response.data.success) {
        throw new Error(response.data.error || "Failed to fetch campaigns")
      }

      return response.data.data || []
    } catch (error) {
      console.error("Error fetching campaigns:", error)
      throw error
    }
  },

  // Função para buscar uma campanha específica
  async getCampaign(campaignId: string): Promise<Campaign> {
    try {
      const response = await axios.get(`/api/follow-up/campaigns/${campaignId}`)

      if (!response.data.success) {
        throw new Error(response.data.error || "Failed to fetch campaign")
      }

      const campaignData = response.data.data

      // Processar os steps se estiverem em formato string
      let steps = []
      if (typeof campaignData.steps === "string") {
        try {
          steps = JSON.parse(campaignData.steps)
        } catch (e) {
          console.error("Error parsing steps:", e)
          steps = []
        }
      } else {
        steps = campaignData.steps || []
      }

      return {
        ...campaignData,
        steps,
      }
    } catch (error) {
      console.error("Error fetching campaign:", error)
      throw error
    }
  },

  // Função para buscar estágios do funil
  async getFunnelStages(campaignId?: string): Promise<FunnelStage[]> {
    try {
      const url = campaignId ? `/api/follow-up/funnel-stages?campaignId=${campaignId}` : "/api/follow-up/funnel-stages"

      const response = await axios.get(url)

      if (!response.data.success) {
        throw new Error(response.data.error || "Failed to fetch funnel stages")
      }

      return response.data.data || []
    } catch (error) {
      console.error("Error fetching funnel stages:", error)
      throw error
    }
  },

  // Função para criar um novo estágio do funil
  async createFunnelStage(
    name: string,
    description?: string,
    order?: number,
    campaignId?: string,
  ): Promise<FunnelStage> {
    try {
      const response = await axios.post("/api/follow-up/funnel-stages", {
        name,
        description,
        order,
        campaignId,
      })

      if (!response.data.success) {
        throw new Error(response.data.error || "Failed to create funnel stage")
      }

      return response.data.data
    } catch (error) {
      console.error("Error creating funnel stage:", error)
      throw error
    }
  },

  // Função para atualizar um estágio do funil
  async updateFunnelStage(
    id: string,
    data: { name: string; description?: string; order?: number },
  ): Promise<FunnelStage> {
    try {
      const response = await axios.put("/api/follow-up/funnel-stages", {
        id,
        ...data,
      })

      if (!response.data.success) {
        throw new Error(response.data.error || "Failed to update funnel stage")
      }

      return response.data.data
    } catch (error) {
      console.error("Error updating funnel stage:", error)
      throw error
    }
  },

  // Função para excluir um estágio do funil
  async deleteFunnelStage(id: string): Promise<boolean> {
    try {
      const response = await axios.delete(`/api/follow-up/funnel-stages?id=${id}`)

      if (!response.data.success) {
        throw new Error(response.data.error || "Failed to delete funnel stage")
      }

      return true
    } catch (error) {
      console.error(`Erro ao excluir estágio do funil ${id}:`, error)
      throw error
    }
  },

  // Função para buscar passos de um estágio específico
  async getFunnelSteps(stageId: string): Promise<FunnelStep[]> {
    try {
      const response = await axios.get(`/api/follow-up/funnel-steps?stageId=${stageId}`)

      if (!response.data.success) {
        throw new Error(response.data.error || "Failed to fetch funnel steps")
      }

      const steps = response.data.data || []
      return steps
    } catch (error) {
      console.error(`Error fetching steps for stage ${stageId}:`, error)
      throw error
    }
  },

  // Função para atualizar um passo específico
  async updateStep(stepId: string, data: Partial<FunnelStep>): Promise<any> {
    try {
      console.log("Atualizando passo:", stepId, JSON.stringify(data, null, 2))

      // No frontend, temos os dados no formato:
      // id, stage_id, stage_name, template_name, wait_time, message, category, auto_respond

      // Manter o formato original do frontend para a nova API
      const requestData = {
        id: stepId,
        stage_id: data.stage_id,
        stage_name: data.stage_name,
        template_name: data.template_name,
        wait_time: data.wait_time,
        message: data.message,
        category: data.category,
        auto_respond: data.auto_respond,
      }

      console.log("Enviando dados para atualização:", JSON.stringify(requestData, null, 2))

      // Usar a rota alternativa que aceita o formato do frontend
      const response = await axios.put("/api/follow-up/steps", requestData)

      if (!response.data.success) {
        throw new Error(response.data.error || "Failed to update step")
      }

      this.clearCampaignCache()

      return response.data
    } catch (error) {
      console.error("Error updating step:", error)
      throw error
    }
  },

  // NOVA FUNÇÃO: Excluir um passo específico
  async deleteStep(stepId: string): Promise<any> {
    try {
      const response = await axios.delete(`/api/follow-up/funnel-steps?id=${stepId}`)

      if (!response.data.success) {
        throw new Error(response.data.error || "Failed to delete step")
      }

      this.clearCampaignCache()

      return response.data
    } catch (error) {
      console.error("Error deleting step:", error)
      throw error
    }
  },

  // Função unificada otimizada para buscar passos de campanha
  async getCampaignSteps(campaignId?: string): Promise<CampaignStep[]> {
    if (!campaignId) {
      return []
    }

    const cacheKey = `campaign-steps-${campaignId}`
    const cachedData = campaignStepsCache[cacheKey]
    const now = Date.now()

    if (cachedData && now - cachedData.timestamp < CACHE_TTL) {
      return cachedData.data
    }

    try {
      const campaign: any = await this.getCampaign(campaignId)
      const campaignSteps: CampaignStep[] = []

      if (campaign && campaign.steps) {
        let stepsData = []
        if (typeof campaign.steps === "string") {
          try {
            const stepsString = campaign.steps
            if (stepsString && stepsString.trim() !== "" && stepsString !== "[]") {
              stepsData = JSON.parse(stepsString)
            }
          } catch (err) {
            console.error(`Erro ao analisar steps da campanha ${campaignId}:`, err)
          }
        } else {
          stepsData = campaign.steps || []
        }

        if (Array.isArray(stepsData) && stepsData.length > 0) {
          const formattedCampaignSteps: any = stepsData
            .map((step: any, index: number) => {
              if (step.stage_name) {
                return {
                  id: step.id || `campaign-step-${index}`,
                  etapa: step.stage_name,
                  tempo_de_espera: step.wait_time || "",
                  template_name: step.template_name || "",
                  message: step.message || "",
                  stage_id: step.stage_id || "",
                  stage_name: step.stage_name,
                  stage_order: step.stage_order || index,
                }
              } else if (step.etapa) {
                return {
                  id: step.id || `campaign-step-${index}`,
                  etapa: step.etapa,
                  tempo_de_espera: step.tempo_de_espera || "",
                  template_name: step.template_name || step.nome_template || "",
                  message: step.message || step.mensagem || "",
                  stage_id: step.stage_id || "",
                  stage_name: step.etapa,
                  stage_order: step.stage_order || index,
                }
              }
              return null
            })
            .filter(Boolean)

          campaignSteps.push(...formattedCampaignSteps)
        }
      }

      campaignStepsCache[cacheKey] = {
        data: campaignSteps,
        timestamp: now,
      }

      return campaignSteps
    } catch (error) {
      console.error("Error fetching campaign steps:", error)
      throw error
    }
  },

  // Método para limpar o cache quando necessário (após atualizações)
  clearCampaignCache(campaignId?: string) {
    if (campaignId) {
      delete campaignStepsCache[`campaign-steps-${campaignId}`]
    } else {
      Object.keys(campaignStepsCache).forEach((key) => {
        delete campaignStepsCache[key]
      })
    }
  },

  // Função para cancelar um follow-up
  async cancelFollowUp(followUpId: string): Promise<any> {
    try {
      const response = await axios.post("/api/follow-up/cancel", {
        followUpId,
      })

      if (!response.data.success) {
        throw new Error(response.data.error || "Failed to cancel follow-up")
      }

      return response.data
    } catch (error) {
      console.error("Error canceling follow-up:", error)
      throw error
    }
  },

  // Função para remover um cliente
  async removeClient(clientId: string): Promise<any> {
    try {
      const response = await axios.post("/api/follow-up/remove-client", {
        clientId,
      })

      if (!response.data.success) {
        throw new Error(response.data.error || "Failed to remove client")
      }

      return response.data
    } catch (error) {
      console.error("Error removing client:", error)
      throw error
    }
  },

  // Função para mover um cliente para outra etapa do funil
  async moveClientToStage(followUpId: string, stageId: string): Promise<any> {
    try {
      const response = await axios.put(`/api/follow-up/${followUpId}/move-stage`, {
        stageId,
      })

      if (!response.data.success) {
        throw new Error(response.data.error || "Failed to move client to stage")
      }

      return response.data
    } catch (error) {
      console.error("Error moving client to stage:", error)
      throw error
    }
  },

  // Função para criar um novo follow-up
  async createFollowUp(clientId: string, campaignId: string): Promise<any> {
    try {
      const response = await axios.post("/api/follow-up", {
        clientId,
        campaignId,
      })

      if (!response.data.success) {
        throw new Error(response.data.error || "Failed to create follow-up")
      }

      return response.data
    } catch (error) {
      console.error("Error creating follow-up:", error)
      throw error
    }
  },

  // Função para atualizar uma campanha
  async updateCampaign(campaignId: string, formData: any): Promise<any> {
    try {
      // Preparar os dados - garantir que steps tem o formato correto
      const preparedData = { ...formData }

      // Se os steps forem fornecidos como array, serializá-los
      if (preparedData.steps && Array.isArray(preparedData.steps)) {
        // Garantir que cada step tenha todos os campos necessários
        const formattedSteps = preparedData.steps.map((step) => ({
          id: step.id || undefined,
          stage_id: step.stage_id || "",
          stage_name: step.stage_name || "",
          template_name: step.template_name || "",
          wait_time: step.wait_time || "",
          message: step.message || "",
          category: step.category || "Utility",
          auto_respond: step.auto_respond !== undefined ? step.auto_respond : true,
        }))

        // Atribuir os steps formatados
        preparedData.steps = formattedSteps
      }

      console.log("Enviando dados formatados para atualização:", JSON.stringify(preparedData, null, 2))

      const response = await axios.put(`/api/follow-up/campaigns/${campaignId}`, preparedData)

      if (!response.data.success) {
        throw new Error(response.data.error || "Failed to update campaign")
      }

      this.clearCampaignCache(campaignId)

      return response.data
    } catch (error) {
      console.error("Error updating campaign:", error)
      throw error
    }
  },

  // Função para criar um novo passo
  async createStep(data: any): Promise<any> {
    try {
      const response = await axios.post("/api/follow-up/funnel-steps", data)

      if (!response.data.success) {
        throw new Error(response.data.error || "Failed to create step")
      }

      this.clearCampaignCache()

      return response.data
    } catch (error) {
      console.error("Error creating step:", error)
      throw error
    }
  },
}

export default followUpService

