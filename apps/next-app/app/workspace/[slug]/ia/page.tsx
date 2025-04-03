// app/workspace/[slug]/ia/page.tsx
import AISettingsForm from "./components/AISettingsForm";
import AiFollowUpRules from "./components/AiFollowUpRules"; // <<< Importar o novo componente

export default function IaPage() { // Renomear para IaPage para clareza
    return (
        <div className="p-4 md:p-6 space-y-8"> {/* Adiciona espaçamento entre os cards */}
            {/* Card de Configurações Gerais da IA */}
            <div>
                {/* Não precisa de título extra aqui se AISettingsForm já tem um CardHeader */}
                <AISettingsForm />
            </div>

            {/* Card de Regras de Acompanhamento por Inatividade */}
            <div>
                 {/* Não precisa de título extra aqui se AiFollowUpRules já tem um CardHeader */}
                <AiFollowUpRules />
            </div>
        </div>
    )
}