'use client';

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { SearchBar, ErrorMessage, Footer } from '../_components';
import MainNavigation from '../_components/MainNavigation';
import { CampaignForm } from '../_components';
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

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        // Carregar campanhas
        const campaignsResponse = await axios.get('/api/follow-up/campaigns');
        if (campaignsResponse.data.success) {
          setCampaigns(campaignsResponse.data.data);
        }

        // Carregar estágios do funil
        const stagesResponse = await axios.get('/api/follow-up/funnel-stages');
        if (stagesResponse.data.success) {
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
      const response = await axios.post('/api/follow-up/campaigns', formData);
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

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      <MainNavigation />
      
      <main className="flex-1 container mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold mb-4">Campanhas de Follow-up</h1>
          
          <div className="flex justify-between items-center mb-4">
            <SearchBar 
              value={searchTerm} 
              onChange={setSearchTerm} 
              placeholder="Buscar campanhas..." 
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
          
          {error && <ErrorMessage message={error} onClose={() => setError(null)} />}
          
          {showForm && (
            <div className="mb-6">
              <CampaignForm 
                funnelStages={stages}
                onSubmit={handleCreateCampaign}
                onCancel={() => setShowForm(false)}
                isLoading={isSubmitting}
              />
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
      
      <Footer />
    </div>
  );
}