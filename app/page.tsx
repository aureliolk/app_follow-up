'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { ArrowRight, MessageSquare, BarChart2, UserPlus, Brain } from 'lucide-react';
import { useSession } from 'next-auth/react';

export default function LandingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    // Redirecionar para workspaces se já estiver autenticado
    if (status === 'authenticated') {
      router.push('/workspaces');
    }

    const handleScroll = () => {
      if (window.scrollY > 10) {
        setIsScrolled(true);
      } else {
        setIsScrolled(false);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [status, router]);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Navbar */}
      <nav 
        className={`fixed w-full z-10 transition-all duration-300 ${
          isScrolled ? 'bg-[#0a0a0a] shadow-lg py-2' : 'bg-transparent py-4'
        }`}
      >
        <div className="container mx-auto px-4 flex justify-between items-center">
          <div className="flex items-center">
            <div className="h-10 w-10 bg-[#F54900] rounded-md flex items-center justify-center mr-2">
              <MessageSquare className="h-6 w-6 text-white" />
            </div>
            <span className="text-xl font-bold">FollowUpAI</span>
          </div>
          
          <div className="flex items-center gap-6">
            <Link 
              href="#features" 
              className="hidden md:block text-gray-300 hover:text-white transition-colors"
            >
              Recursos
            </Link>
            <Link 
              href="#how-it-works" 
              className="hidden md:block text-gray-300 hover:text-white transition-colors"
            >
              Como funciona
            </Link>
            <Link 
              href="/auth/login" 
              className="px-4 py-2 bg-[#F54900] hover:bg-[#D93C00] rounded-md transition-colors"
            >
              Entrar
            </Link>
            <Link 
              href="/auth/register" 
              className="hidden md:block px-4 py-2 border border-[#F54900] text-[#F54900] hover:bg-[#F54900] hover:text-white rounded-md transition-colors"
            >
              Cadastre-se
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4">
        <div className="container mx-auto flex flex-col items-center text-center">
          <h1 className="text-4xl md:text-6xl font-bold mb-6">
            Automatize seus Follow-ups <br />
            <span className="text-[#F54900]">Potencializado por IA</span>
          </h1>
          <p className="text-xl text-gray-400 max-w-2xl mb-10">
            Otimize seu relacionamento com clientes através de campanhas inteligentes de follow-up que respondem e se adaptam automaticamente. Nunca mais perca uma oportunidade de conexão.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <Link 
              href="/auth/register" 
              className="px-8 py-3 bg-[#F54900] hover:bg-[#D93C00] rounded-md text-lg font-medium flex items-center justify-center transition-colors"
            >
              Comece Agora <ArrowRight className="ml-2 h-5 w-5" />
            </Link>
            <Link 
              href="#how-it-works" 
              className="px-8 py-3 bg-transparent border border-gray-600 hover:border-gray-400 rounded-md text-lg font-medium transition-colors"
            >
              Saiba Mais
            </Link>
          </div>
        </div>
      </section>

      {/* Animated Visual */}
      <section className="py-10 px-4 relative overflow-hidden">
        <div className="container mx-auto flex justify-center">
          <div className="w-full max-w-4xl h-64 md:h-96 bg-[#111111] rounded-xl relative shadow-xl overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-[#F54900]/20 to-blue-500/10"></div>
            <div className="absolute top-8 left-8 right-8 bottom-8 bg-[#0a0a0a]/80 rounded-lg flex items-center justify-center">
              <div className="text-center">
                <Brain className="h-16 w-16 text-[#F54900] mx-auto mb-4" />
                <div className="text-2xl font-bold mb-2">Gerenciador Inteligente de Campanhas</div>
                <div className="text-gray-400">Visualize seu fluxo de campanha aqui</div>
              </div>
            </div>
            {/* Animated dots for technological effect */}
            <div className="absolute inset-0 grid grid-cols-20 grid-rows-10 opacity-30">
              {Array.from({ length: 200 }).map((_, i) => (
                <div 
                  key={i} 
                  className="h-1 w-1 rounded-full bg-white opacity-50 animate-pulse"
                  style={{
                    animationDuration: `${3 + (i % 5)}s`
                  }}
                ></div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 px-4 bg-[#0F0F0F]">
        <div className="container mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-16">Recursos Poderosos</h2>
          
          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-[#161616] p-6 rounded-xl hover:transform hover:scale-105 transition-all duration-300">
              <div className="h-12 w-12 bg-[#F54900]/20 rounded-lg flex items-center justify-center mb-4">
                <MessageSquare className="h-6 w-6 text-[#F54900]" />
              </div>
              <h3 className="text-xl font-bold mb-2">Mensagens Inteligentes</h3>
              <p className="text-gray-400">
                Mensagens potencializadas por IA que se adaptam às respostas dos clientes, criando fluxos de comunicação naturais e eficazes.
              </p>
            </div>
            
            <div className="bg-[#161616] p-6 rounded-xl hover:transform hover:scale-105 transition-all duration-300">
              <div className="h-12 w-12 bg-[#F54900]/20 rounded-lg flex items-center justify-center mb-4">
                <BarChart2 className="h-6 w-6 text-[#F54900]" />
              </div>
              <h3 className="text-xl font-bold mb-2">Dashboard Analítico</h3>
              <p className="text-gray-400">
                Insights abrangentes e métricas para acompanhar o desempenho da campanha e otimizar sua estratégia de follow-up.
              </p>
            </div>
            
            <div className="bg-[#161616] p-6 rounded-xl hover:transform hover:scale-105 transition-all duration-300">
              <div className="h-12 w-12 bg-[#F54900]/20 rounded-lg flex items-center justify-center mb-4">
                <UserPlus className="h-6 w-6 text-[#F54900]" />
              </div>
              <h3 className="text-xl font-bold mb-2">Colaboração Multi-workspace</h3>
              <p className="text-gray-400">
                Colabore com sua equipe perfeitamente com gerenciamento avançado de workspaces e permissões baseadas em funções.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-20 px-4">
        <div className="container mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-16">Como Funciona</h2>
          
          <div className="max-w-3xl mx-auto">
            <div className="flex items-start mb-12">
              <div className="h-10 w-10 bg-[#F54900] rounded-full flex items-center justify-center flex-shrink-0 mr-4">
                <span className="font-bold">1</span>
              </div>
              <div>
                <h3 className="text-xl font-bold mb-2">Configure Sua Campanha</h3>
                <p className="text-gray-400">
                  Projete sua sequência de follow-up com modelos e tempo personalizáveis. Crie diferentes funis para várias jornadas de clientes.
                </p>
              </div>
            </div>
            
            <div className="flex items-start mb-12">
              <div className="h-10 w-10 bg-[#F54900] rounded-full flex items-center justify-center flex-shrink-0 mr-4">
                <span className="font-bold">2</span>
              </div>
              <div>
                <h3 className="text-xl font-bold mb-2">A IA Assume o Controle</h3>
                <p className="text-gray-400">
                  Nosso motor de IA gerencia o tempo e a entrega de mensagens, analisa respostas e determina a próxima melhor ação com base no engajamento do cliente.
                </p>
              </div>
            </div>
            
            <div className="flex items-start">
              <div className="h-10 w-10 bg-[#F54900] rounded-full flex items-center justify-center flex-shrink-0 mr-4">
                <span className="font-bold">3</span>
              </div>
              <div>
                <h3 className="text-xl font-bold mb-2">Monitore e Otimize</h3>
                <p className="text-gray-400">
                  Acompanhe o desempenho da campanha em tempo real e refine sua abordagem com base em análises. Melhore as taxas de conversão com sugestões baseadas em IA.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials/Stats */}
      <section className="py-20 px-4 bg-[#0F0F0F]">
        <div className="container mx-auto">
          <div className="grid md:grid-cols-3 gap-8 text-center">
            <div>
              <div className="text-4xl font-bold text-[#F54900] mb-2">95%</div>
              <p className="text-gray-400">Aumento nas taxas de resposta</p>
            </div>
            <div>
              <div className="text-4xl font-bold text-[#F54900] mb-2">75%</div>
              <p className="text-gray-400">Tempo economizado em follow-ups</p>
            </div>
            <div>
              <div className="text-4xl font-bold text-[#F54900] mb-2">3x</div>
              <p className="text-gray-400">Melhoria na conversão</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4">
        <div className="container mx-auto max-w-4xl">
          <div className="bg-gradient-to-r from-[#F54900]/20 to-[#111111] p-10 rounded-2xl text-center">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">Pronto para Transformar seu Processo de Follow-up?</h2>
            <p className="text-xl text-gray-400 mb-8">
              Junte-se a milhares de empresas que já usam o FollowUpAI para aumentar engajamento e conversões.
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <Link 
                href="/auth/register" 
                className="px-8 py-3 bg-[#F54900] hover:bg-[#D93C00] rounded-md text-lg font-medium flex items-center justify-center"
              >
                Comece Gratuitamente <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
              <Link 
                href="/auth/login" 
                className="px-8 py-3 bg-transparent border border-[#F54900] text-[#F54900] hover:bg-[#F54900] hover:text-white rounded-md text-lg font-medium transition-colors"
              >
                Entrar
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 px-4 border-t border-gray-800">
        <div className="container mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center mb-4 md:mb-0">
              <div className="h-8 w-8 bg-[#F54900] rounded-md flex items-center justify-center mr-2">
                <MessageSquare className="h-5 w-5 text-white" />
              </div>
              <span className="text-lg font-bold">FollowUpAI</span>
            </div>
            <div className="flex gap-6">
              <Link href="#" className="text-gray-400 hover:text-white">Privacidade</Link>
              <Link href="#" className="text-gray-400 hover:text-white">Termos</Link>
              <Link href="#" className="text-gray-400 hover:text-white">Contato</Link>
            </div>
          </div>
          <div className="mt-8 text-center text-gray-500 text-sm">
            © 2025 FollowUpAI. Todos os direitos reservados.
          </div>
        </div>
      </footer>

      {/* Add some global styles for animations */}
      <style jsx global>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.8; }
        }
        
        .animate-pulse {
          animation: pulse 3s infinite;
        }
        
        html {
          scroll-behavior: smooth;
        }
      `}</style>
    </div>
  );
}