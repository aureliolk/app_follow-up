'use client';

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { SearchBar, ErrorMessage } from '../campaigns/_components/index';
import CampaignFormHook from '../campaigns/_components/CampaignFormHook';
import { useForm, FormProvider } from 'react-hook-form';
import Link from 'next/link';

interface Campaign {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  stepsCount: number;
  activeFollowUps: number;
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [stages, setStages] = useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const formMethods = useForm({ defaultValues: { name: '', description: '', steps: [] } });

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        // Obter o workspaceId ativo da sessionStorage
        const workspaceId = typeof window !== 'undefined' 
          ? sessionStorage.getItem('activeWorkspaceId') 
          : null;
        
        // Carregar campanhas do workspace atual
        const campaignsResponse = await axios.get('/api/follow-up/campaigns', {
          params: { workspaceId }
        });
        
        if (campaignsResponse.data.success) {
          setCampaigns(campaignsResponse.data.data);
          console.log(campaignsResponse.data.data);
        }

        // Carregar estágios do funil apenas do workspace atual
        // Aqui não especificamos campaignId já que estamos criando nova campanha
        const stagesResponse = await axios.get('/api/follow-up/funnel-stages', { 
          params: { 
            workspaceId,
            // Não usar campaignId: estamos criando nova campanha
            // Adicionar um timestamp para evitar cache
            t: new Date().getTime() 
          } 
        });
        
        if (stagesResponse.data.success) {
          // Filtrar estágios que não pertencem a nenhuma campanha
          // ou pertencem a campanhas do mesmo workspace
          setStages(stagesResponse.data.data);
        }
      } catch (err) {
        console.error('Erro ao carregar dados:', err);
        setError('Erro ao carregar campanhas. Por favor, tente novamente.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  const filteredCampaigns = campaigns.filter(campaign => {
    if (!searchTerm) return true;
    
    const lowerSearchTerm = searchTerm.toLowerCase();
    return (
      campaign.name.toLowerCase().includes(lowerSearchTerm) ||
      (campaign.description && campaign.description.toLowerCase().includes(lowerSearchTerm))
    );
  });

  const handleCreateCampaign = async (formData: any) => {
    setIsSubmitting(true);
    try {
      // Obter o workspaceId ativo
      const workspaceId = typeof window !== 'undefined' 
        ? sessionStorage.getItem('activeWorkspaceId') 
        : null;
      
      if (!workspaceId) {
        setError('ID do workspace não encontrado. Selecione um workspace antes de criar uma campanha.');
        return;
      }
      
      // Adicionar workspaceId aos dados do formulário
      const requestData = {
        ...formData,
        workspaceId
      };
      
      const response = await axios.post('/api/follow-up/campaigns', requestData);
      if (response.data.success) {
        // Adicionar a nova campanha à lista
        setCampaigns([response.data.data, ...campaigns]);
        setShowForm(false);
      }
    } catch (err) {
      console.error('Erro ao criar campanha:', err);
      setError('Erro ao criar campanha. Por favor, tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Função para ativar/desativar campanha
  const handleToggleActive = async (campaign: Campaign) => {
    try {
      const response = await axios.put(`/api/follow-up/campaigns/${campaign.id}`, {
        name: campaign.name,
        description: campaign.description,
        active: !campaign.active
      });
      
      if (response.data.success) {
        // Atualizar a lista de campanhas localmente
        setCampaigns(prevCampaigns => 
          prevCampaigns.map(c => 
            c.id === campaign.id ? { ...c, active: !c.active } : c
          )
        );
      }
    } catch (err) {
      console.error('Erro ao alternar status da campanha:', err);
      setError('Erro ao alterar o status da campanha. Por favor, tente novamente.');
    }
  };

  // Função para excluir campanha
  const handleDeleteCampaign = async (campaign: Campaign) => {
    // Confirmar antes de excluir
    if (!confirm(`Tem certeza que deseja excluir a campanha "${campaign.name}"? Esta ação não pode ser desfeita.`)) {
      return;
    }

    if (campaign.activeFollowUps > 0) {
      if (!confirm(`Esta campanha tem ${campaign.activeFollowUps} follow-ups ativos. Excluí-la pode afetar esses fluxos. Deseja continuar?`)) {
        return;
      }
    }

    setIsDeleting(true);
    try {
      const response = await axios.delete(`/api/follow-up/campaigns/${campaign.id}`);
      
      if (response.data.success) {
        // Remover a campanha da lista
        setCampaigns(prevCampaigns => prevCampaigns.filter(c => c.id !== campaign.id));
      }
    } catch (err) {
      console.error('Erro ao excluir campanha:', err);
      setError('Erro ao excluir campanha. Por favor, tente novamente.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      <main className="flex-1 container mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold mb-4">Campanhas de Follow-up</h1>
          
          <div className="flex justify-between items-center mb-4">
            <SearchBar 
              searchTerm={searchTerm}
              onSearch={setSearchTerm}
              showNewForm={showForm}
              onToggleForm={() => setShowForm(!showForm)}
            />
            <button
              onClick={() => setShowForm(true)}
              className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 transition-colors flex items-center"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
              Nova Campanha
            </button>
          </div>
          
          {error && <ErrorMessage message={error} onDismiss={() => setError(null)} />}
          
          {showForm && (
            <div className="mb-6">
              <FormProvider {...formMethods}>
                <CampaignFormHook 
                  funnelStages={stages} 
                  campaignSteps={[]}
                  onSubmit={handleCreateCampaign}
                  onCancel={() => setShowForm(false)}
                  isLoading={isSubmitting}
                />
              </FormProvider>
            </div>
          )}
          
          {isLoading ? (
            <div className="flex justify-center p-8">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-orange-500"></div>
            </div>
          ) : filteredCampaigns.length > 0 ? (
            <div className="overflow-hidden rounded-lg">
              <table className="min-w-full divide-y divide-gray-600">
                <thead className="bg-gray-800">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                      Nome
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                      Descrição
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                      Etapas
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                      Clientes Ativos
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                      Status
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-gray-700 divide-y divide-gray-600">
                  {filteredCampaigns.map((campaign) => (
                    <tr key={campaign.id} className="hover:bg-gray-650">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">
                        {campaign.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                        {campaign.description || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                        {campaign.stepsCount || 0}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                        {campaign.activeFollowUps || 0}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                        <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          campaign.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {campaign.active ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium flex items-center space-x-3">
                        <Link 
                          href={`/follow-up/campaigns/${campaign.id}`}
                          className="text-blue-400 hover:text-blue-300"
                          title="Editar"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                          </svg>
                        </Link>
                        <button 
                          onClick={() => handleToggleActive(campaign)}
                          className="flex items-center focus:outline-none"
                          title={campaign.active ? 'Desativar' : 'Ativar'}
                        >
                          <div className={`relative inline-block w-10 h-5 transition-colors duration-200 ease-in-out rounded-full ${
                            campaign.active ? 'bg-orange-600' : 'bg-red-600'
                          }`}>
                            <span className={`absolute inset-0 flex items-center justify-${campaign.active ? 'end' : 'start'} w-4 h-4 pl-1`}>
                              <span className={`w-3 h-3 transition-colors duration-200 ease-in-out rounded-full bg-white transform ${
                                campaign.active ? 'translate-x-5' : 'translate-x-0'
                              }`}></span>
                            </span>
                          </div>
                        </button>
                        <button 
                          onClick={() => handleDeleteCampaign(campaign)}
                          className="text-red-500 hover:text-red-300"
                          title="Excluir"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-400">
              Nenhuma campanha encontrada.
              {!searchTerm && (
                <p className="mt-2">Crie sua primeira campanha clicando no botão "Nova Campanha".</p>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}