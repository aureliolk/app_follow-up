// app/follow-up/page.tsx
'use client';

import { useState, useEffect } from 'react';

// Importando os componentes
import {
  ErrorMessage,
  ActionBar,
  NewFollowUpForm,
  FollowUpTable,
  FollowUpDetailModal,
  Footer,
  MainNavigation
} from '../follow-up/campaigns/_components';

// Importando os tipos e serviços
import { FollowUp, Campaign } from './_types';
import followUpService from './_services/followUpService';


export default function FollowUpPage() {
  // Estados
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [selectedFollowUp, setSelectedFollowUp] = useState<FollowUp | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('active'); // 'active', 'paused', 'completed', 'canceled'
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showNewForm, setShowNewForm] = useState(false);

  // Função para carregar os follow-ups usando o serviço centralizado
  const fetchFollowUps = async () => {
    try {
      setIsLoading(true);
      const data = await followUpService.getFollowUps(activeTab);
      setFollowUps(data);
    } catch (err: any) {
      console.error('Erro ao carregar follow-ups:', err);
      setError(err.message || 'Falha ao carregar dados');
    } finally {
      setIsLoading(false);
    }
  };

  // Função para carregar as campanhas usando o serviço centralizado
  const fetchCampaigns = async () => {
    try {
      const data = await followUpService.getCampaigns();
      setCampaigns(data);
    } catch (err: any) {
      console.error('Erro ao carregar campanhas:', err);
    }
  };

  // Buscar dados ao carregar a página e quando a tab muda
  useEffect(() => {
    fetchFollowUps();
    fetchCampaigns();
  }, [activeTab]);

  // Filtrar follow-ups pelo termo de busca
  const filteredFollowUps = followUps.filter(followUp => 
    followUp.client_id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Função para cancelar um follow-up usando o serviço centralizado
  const handleCancelFollowUp = async (id: string) => {
    if (!confirm('Tem certeza que deseja cancelar este follow-up?')) {
      return;
    }

    try {
      setIsLoading(true);
      await followUpService.cancelFollowUp(id);
      fetchFollowUps();
      if (selectedFollowUp?.id === id) {
        setSelectedFollowUp(null);
      }
    } catch (err: any) {
      console.error('Erro ao cancelar follow-up:', err);
      setError('Falha ao cancelar follow-up');
    } finally {
      setIsLoading(false);
    }
  };

  // Função para remover um cliente usando o serviço centralizado
  const handleRemoveClient = async (clientId: string) => {
    if (!confirm(`Tem certeza que deseja remover todos os follow-ups do cliente "${clientId}"?`)) {
      return;
    }

    try {
      setIsLoading(true);
      await followUpService.removeClient(clientId);
      fetchFollowUps();
      if (selectedFollowUp?.client_id === clientId) {
        setSelectedFollowUp(null);
      }
    } catch (err: any) {
      console.error('Erro ao remover cliente:', err);
      setError('Falha ao remover cliente');
    } finally {
      setIsLoading(false);
    }
  };

  // Função para criar um novo follow-up usando o serviço centralizado
  const handleCreateFollowUp = async (clientId: string, campaignId: string) => {
    if (!clientId || !campaignId) {
      setError('Cliente e campanha são obrigatórios');
      return;
    }

    try {
      setIsLoading(true);
      await followUpService.createFollowUp(clientId, campaignId);
      setShowNewForm(false);
      fetchFollowUps();
    } catch (err: any) {
      console.error('Erro ao criar follow-up:', err);
      setError(err.message || 'Falha ao criar follow-up');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      <MainNavigation />
      
      <div className="flex-1 container mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold mb-4">Lista de Follow-ups</h1>

            <ErrorMessage 
              message={error} 
              onDismiss={() => setError(null)} 
            />

            <ActionBar 
              activeTab={activeTab}
              onTabChange={setActiveTab}
              searchTerm={searchTerm}
              onSearch={setSearchTerm}
              showNewForm={showNewForm}
              onToggleForm={() => setShowNewForm(!showNewForm)}
            />

            {showNewForm && (
              <NewFollowUpForm 
                campaigns={campaigns}
                isLoading={isLoading}
                onSubmit={handleCreateFollowUp}
              />
            )}

            <div className="bg-gray-700 rounded-lg">
              <FollowUpTable 
                followUps={filteredFollowUps}
                isLoading={isLoading}
                activeTab={activeTab}
                searchTerm={searchTerm}
                onSelect={setSelectedFollowUp}
                onCancel={handleCancelFollowUp}
                onRemoveClient={handleRemoveClient}
              />
            </div>

            {selectedFollowUp && (
              <FollowUpDetailModal 
                followUp={selectedFollowUp}
                onClose={() => setSelectedFollowUp(null)}
                onCancel={handleCancelFollowUp}
                onRemoveClient={handleRemoveClient}
              />
            )}

        </div>
      </div>
      
      <Footer />
    </div>
  );
}