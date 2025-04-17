'use client';

import React, {
    createContext,
    useContext,
    useState,
    useCallback,
    ReactNode,
    useEffect,
} from 'react';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { useWorkspace } from '@/context/workspace-context';

// --- Tipos --- 
// Reutilizar a interface definida anteriormente ou importá-la se movida para @/app/types
// TODO: Consider moving WhatsappTemplate to a shared types file like @/app/types/index.ts
interface WhatsappTemplate {
  id: string; 
  name: string;
  language: string;
  category: string;
  body: string; 
}

interface WhatsappTemplateContextType {
    templates: WhatsappTemplate[];
    loadingTemplates: boolean;
    templateError: string | null;
    fetchTemplatesForWorkspace: (workspaceId: string) => Promise<void>; // Função para buscar manualmente se necessário
    clearTemplateError: () => void;
}

// --- Contexto ---
const WhatsappTemplateContext = createContext<WhatsappTemplateContextType | undefined>(undefined);

// --- Provider ---
export const WhatsappTemplateProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const { workspace: activeWorkspace } = useWorkspace(); // Obter o workspace ativo
    const [templates, setTemplates] = useState<WhatsappTemplate[]>([]);
    const [loadingTemplates, setLoadingTemplates] = useState(false);
    const [templateError, setTemplateError] = useState<string | null>(null);
    const [fetchedForWorkspaceId, setFetchedForWorkspaceId] = useState<string | null>(null);

    const clearTemplateError = useCallback(() => setTemplateError(null), []);

    const fetchTemplatesForWorkspace = useCallback(async (workspaceId: string) => {
        if (!workspaceId) return; // Não buscar se não houver ID
        // Evitar re-fetch se já buscou para este workspace
        if (workspaceId === fetchedForWorkspaceId) {
             console.log(`[TemplateContext] Templates para ${workspaceId} já carregados do cache do contexto.`);
             return;
        }

        setLoadingTemplates(true);
        setTemplateError(null);
        console.log(`[TemplateContext] Buscando templates para workspace: ${workspaceId}`);
        try {
            const response = await axios.get<{success: boolean, data?: WhatsappTemplate[], error?: string}>(
                // Caminho correto da API
                `/api/webhooks/ingress/whatsapp/templates?workspaceId=${workspaceId}`
            );
            if (!response.data.success || !response.data.data) {
                throw new Error(response.data.error || 'Erro ao buscar templates');
            }
            setTemplates(response.data.data);
            setFetchedForWorkspaceId(workspaceId); // Marcar que buscou para este ID
            console.log(`[TemplateContext] Templates carregados via API para ${workspaceId}: ${response.data.data.length}`);
        } catch (error: any) {
            console.error(`[TemplateContext] Erro ao buscar templates via API para ${workspaceId}:`, error);
            const message = error.response?.data?.error || error.message || 'Não foi possível carregar os modelos.';
            setTemplateError(message);
            toast.error(message);
            setTemplates([]); // Limpar em caso de erro
            setFetchedForWorkspaceId(null); // Resetar para permitir nova tentativa
        } finally {
            setLoadingTemplates(false);
        }
    }, [fetchedForWorkspaceId]); // Incluir dependência

    // Efeito para buscar templates quando o workspace ativo muda
    useEffect(() => {
        if (activeWorkspace?.id && activeWorkspace.id !== fetchedForWorkspaceId) {
            // Buscar automaticamente quando o workspace ativo muda E ainda não buscamos para ele
            fetchTemplatesForWorkspace(activeWorkspace.id);
        }
        // Limpar templates se o workspace for desativado
        else if (!activeWorkspace?.id) {
             setTemplates([]);
             setFetchedForWorkspaceId(null);
             console.log("[TemplateContext] Workspace desativado, limpando templates.");
        }
    }, [activeWorkspace?.id, fetchTemplatesForWorkspace, fetchedForWorkspaceId]);

    const value = {
        templates,
        loadingTemplates,
        templateError,
        fetchTemplatesForWorkspace, // Expor a função para busca manual se necessário
        clearTemplateError,
    };

    return (
        <WhatsappTemplateContext.Provider value={value}>
            {children}
        </WhatsappTemplateContext.Provider>
    );
};

// --- Hook Customizado ---
export const useWhatsappTemplates = (): WhatsappTemplateContextType => {
    const context = useContext(WhatsappTemplateContext);
    if (context === undefined) {
        throw new Error('useWhatsappTemplates must be used within a WhatsappTemplateProvider');
    }
    return context;
}; 