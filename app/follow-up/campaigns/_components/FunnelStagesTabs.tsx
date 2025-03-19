'use client';

import React, { useState, useEffect, useMemo } from 'react';

interface Step {
  id?: string;
  stage_id: string;
  stage_name: string;
  template_name: string;
  wait_time?: string;
  tempo_de_espera?: string; // Campo alternativo para compatibilidade
  message?: string;
  mensagem?: string; // Campo alternativo para compatibilidade
  category?: string;
  auto_respond?: boolean;
}

interface FunnelStagesTabsProps {
  steps: Step[];
  onRemoveStep: (index: number) => void;
  onEditStep: (index: number) => void;
}

const FunnelStagesTabs: React.FC<FunnelStagesTabsProps> = ({ 
  steps, 
  onRemoveStep, 
  onEditStep 
}) => {
  console.log('Dados recebidos em FunnelStagesTabs:', steps);
  
  // Agrupar os estágios por etapa do funil
  const stageGroups = useMemo(() => {
    const groups: Record<string, Step[]> = {};

    // Agrupar por etapa
    steps.forEach(step => {
      const stageName = step.stage_name || 'Sem etapa definida';
      if (!groups[stageName]) {
        groups[stageName] = [];
      }
      groups[stageName].push(step);
    });

    // Ordenar os grupos de etapas
    return Object.entries(groups);
  }, [steps]);

  // Estado para controlar qual guia está ativa
  const [activeStage, setActiveStage] = useState<string>('');

  // Atualizar a guia ativa quando os grupos forem carregados
  useEffect(() => {
    if (stageGroups.length > 0) {
      setActiveStage(stageGroups[0][0]);
    }
  }, [stageGroups]);

  // Se não houver estágios, mostrar mensagem
  if (stageGroups.length === 0) {
    return (
      <div className="p-8 text-center text-gray-400">
        Nenhum estágio encontrado para esta campanha.
      </div>
    );
  }

  // Encontrar os índices originais dos passos no array de steps
  const getStepIndex = (step: Step) => {
    // Se não tiver dados básicos, não faz sentido procurar
    if (!step || (!step.id && !step.template_name)) {
      console.warn('Passo inválido ou sem identificação:', step);
      return -1;
    }

    // Método simplificado: buscar apenas por ID, que é o mais confiável
    if (step.id) {
      const indexById = steps.findIndex(s => s.id === step.id);
      if (indexById !== -1) {
        return indexById;
      }
    }

    // Se não tem ID ou não encontrou por ID, buscar pela combinação de propriedades essenciais
    return steps.findIndex(s =>
      s.stage_name === step.stage_name &&
      s.template_name === step.template_name
    );
  };

  // Função para obter o tempo de espera, verificando os dois campos possíveis
  const getWaitTime = (step: Step): string => {
    return step.wait_time || step.tempo_de_espera || 'Não definido';
  };

  // Função para obter a mensagem, verificando os dois campos possíveis
  const getMessage = (step: Step): string => {
    return step.message || step.mensagem || '';
  };

  // Calcular qual estágio está ativo
  const activeSteps = stageGroups.find(([name]) => name === activeStage)?.[1] || [];

  return (
    <div>
      {/* Guias de navegação horizontal */}
      <div className="flex overflow-x-auto border-b border-gray-700">
        {stageGroups.map(([stageName, stageSteps], index) => (
          <button
            type="button"
            key={stageName}
            onClick={(e) => {
              e.preventDefault();
              setActiveStage(stageName);
            }}
            className={`px-6 py-3 whitespace-nowrap ${activeStage === stageName
                ? 'text-orange-500 border-b-2 border-orange-500 font-medium'
                : 'text-gray-400 hover:text-white'
              }`}
          >
            {stageName} ({stageSteps.length})
          </button>
        ))}
      </div>

      {/* Conteúdo da guia ativa */}
      <div className="p-4">
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
            {activeSteps.map((step, idx) => {
              const stepIndex = getStepIndex(step);
              const waitTime = getWaitTime(step);
              const message = getMessage(step);
              
              console.log(`Etapa ${idx}:`, {
                id: step.id,
                template: step.template_name,
                waitTime,
                messagePreview: message?.substring(0, 30)
              });
              
              return (
                <tr key={`${step.id || ''}-${idx}`} className="hover:bg-gray-600/30">
                  <td className="px-4 py-2 text-sm font-medium text-white">
                    {stepIndex !== -1 ? stepIndex + 1 : idx + 1}
                  </td>
                  <td className="px-4 py-2 text-sm text-orange-400">
                    {step.template_name || 'Não definido'}
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-300">
                    {waitTime}
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-300">
                    <div className="max-w-md truncate">
                      {message?.substring(0, 60)}
                      {message?.length > 60 ? '...' : ''}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-sm">
                    <div className="flex space-x-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (stepIndex !== -1) {
                            console.log(`Editando estágio no índice ${stepIndex}`);
                            onEditStep(stepIndex);
                          } else {
                            console.warn("Índice não encontrado, usando fallback com IDs");
                            // Buscar o índice manualmente como fallback
                            const realIndex = steps.findIndex(s => s.id === step.id);
                            if (realIndex !== -1) {
                              console.log(`Usando índice encontrado pelo ID: ${realIndex}`);
                              onEditStep(realIndex);
                            } else {
                              alert("Erro ao encontrar estágio. Tente recarregar a página.");
                            }
                          }
                        }}
                        className="text-blue-400 hover:text-blue-300"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (stepIndex !== -1) {
                            console.log(`Removendo estágio no índice ${stepIndex}`);
                            onRemoveStep(stepIndex);
                          } else {
                            console.warn("Índice não encontrado, usando fallback com IDs");
                            // Buscar o índice manualmente como fallback
                            const realIndex = steps.findIndex(s => s.id === step.id);
                            if (realIndex !== -1) {
                              console.log(`Usando índice encontrado pelo ID: ${realIndex}`);
                              onRemoveStep(realIndex);
                            } else {
                              alert("Erro ao encontrar estágio. Tente recarregar a página.");
                            }
                          }
                        }}
                        className="text-red-400 hover:text-red-300"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default FunnelStagesTabs;