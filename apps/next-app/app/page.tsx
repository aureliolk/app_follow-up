'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image'; // Mantido, embora não usado no snippet visível
import { useRouter } from 'next/navigation';
// Adicionar Check para lista de features
import { ArrowRight, MessageSquare, BarChart2, UserPlus, Brain, Check, X } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { cn } from '../../../packages/shared-lib/src/utils';
import { Button } from '../../../apps/next-app/components/ui/button'; // <<< ADICIONADO

export default function LandingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // Estado para controlar animações (exemplo simples, ideal seria Intersection Observer)
  const [animateSections, setAnimateSections] = useState(false);
  useEffect(() => {
    // Ativa animações após um pequeno delay para efeito de entrada
    const timer = setTimeout(() => setAnimateSections(true), 100);
    return () => clearTimeout(timer);
  }, []);

  return (
    // bg-background principal
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">

      {/* Hero Section */}
      <section className={cn("pt-32 pb-20 px-4", animateSections && "animate-fade-in")}>
        <div className="container mx-auto flex flex-col items-center text-center">
          <h1 className="text-4xl md:text-6xl font-bold mb-6 text-foreground debug-border">
            Automatize seus Follow-ups <br />
            <span className="text-primary">Potencializado por IA</span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mb-10">
            Otimize seu relacionamento com clientes através de campanhas inteligentes que respondem e se adaptam automaticamente.
          </p>
          {/* Botões Modificados */}
          <div className="flex flex-col sm:flex-row gap-4">
            <Button size="lg" asChild className="transition-transform transform hover:scale-105 duration-300">
              <Link href="/auth/register">
                Comece Agora <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
            <Button variant="outline" size="lg" asChild>
              <Link href="#pricing">
                Ver Planos
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Animated Visual (com leve ajuste de fundo) */}
      <section className={cn("py-20 px-4 bg-background", animateSections && "animate-fade-in")} style={{ animationDelay: '1.2s' }}>
        <div className="container mx-auto max-w-4xl">
          <div className="bg-gradient-to-r from-primary/10 via-secondary/10 to-primary/10 dark:from-primary/20 dark:via-card/10 dark:to-primary/20 p-10 rounded-2xl text-center border border-border">
          <div className="text-center p-6 rounded-lg">
                <Brain className="h-16 w-16 text-primary mx-auto mb-4" />
                <div className="text-2xl font-bold mb-2 text-foreground">Gerenciador Inteligente de Campanhas</div>
                <div className="text-muted-foreground">Visualize seu fluxo de campanha aqui</div>
              </div>
          </div>
        </div>
      </section>

      {/* Features (fundo secundário) */}
      <section id="features" className={cn("py-20 px-4 bg-secondary", animateSections && "animate-fade-in")} style={{ animationDelay: '0.4s' }}>
        <div className="container mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-16 text-foreground">Recursos Poderosos</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {/* Cards usam bg-card */}
            <div className="bg-card p-6 rounded-xl border border-border hover:shadow-lg transition-shadow duration-300 transform hover:-translate-y-1">
              <div className="h-12 w-12 bg-primary/10 dark:bg-primary/20 rounded-lg flex items-center justify-center mb-4 border border-primary/20">
                <MessageSquare className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-xl font-bold mb-2 text-card-foreground">Mensagens Inteligentes</h3>
              <p className="text-muted-foreground">
                Nossa IA adapta mensagens às respostas dos clientes, criando fluxos de comunicação naturais e eficazes.
              </p>
            </div>
            {/* ... outros cards de features com estilo similar ... */}
             <div className="bg-card p-6 rounded-xl border border-border hover:shadow-lg transition-shadow duration-300 transform hover:-translate-y-1">
              <div className="h-12 w-12 bg-primary/10 dark:bg-primary/20 rounded-lg flex items-center justify-center mb-4 border border-primary/20">
                <BarChart2 className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-xl font-bold mb-2 text-card-foreground">Dashboard Analítico</h3>
              <p className="text-muted-foreground">
                Acompanhe o desempenho e otimize sua estratégia com insights e métricas detalhadas.
              </p>
            </div>
            <div className="bg-card p-6 rounded-xl border border-border hover:shadow-lg transition-shadow duration-300 transform hover:-translate-y-1">
              <div className="h-12 w-12 bg-primary/10 dark:bg-primary/20 rounded-lg flex items-center justify-center mb-4 border border-primary/20">
                <UserPlus className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-xl font-bold mb-2 text-card-foreground">Colaboração Multi-workspace</h3>
              <p className="text-muted-foreground">
                Gerencie múltiplas equipes ou projetos com workspaces isolados e permissões flexíveis.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works (fundo principal) */}
      <section id="how-it-works" className={cn("py-20 px-4 bg-background", animateSections && "animate-fade-in")} style={{ animationDelay: '0.6s' }}>
        <div className="container mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-16 text-foreground">Como Funciona</h2>
          <div className="max-w-3xl mx-auto space-y-12">
            <div className="flex items-start">
              <div className="h-10 w-10 bg-primary rounded-full flex items-center justify-center flex-shrink-0 mr-4 text-primary-foreground">
                <span className="font-bold">1</span>
              </div>
              <div>
                <h3 className="text-xl font-bold mb-2 text-foreground">Configure Sua Campanha</h3>
                <p className="text-muted-foreground">
                  Defina estágios, mensagens e tempos. Crie funis personalizados para diferentes jornadas.
                </p>
              </div>
            </div>
            {/* ... outras etapas ... */}
             <div className="flex items-start">
              <div className="h-10 w-10 bg-primary rounded-full flex items-center justify-center flex-shrink-0 mr-4 text-primary-foreground">
                <span className="font-bold">2</span>
              </div>
              <div>
                <h3 className="text-xl font-bold mb-2 text-foreground">A IA Assume o Controle</h3>
                <p className="text-muted-foreground">
                  O motor de IA gerencia o fluxo, analisa respostas e decide a próxima melhor ação.
                </p>
              </div>
            </div>
            <div className="flex items-start">
              <div className="h-10 w-10 bg-primary rounded-full flex items-center justify-center flex-shrink-0 mr-4 text-primary-foreground">
                <span className="font-bold">3</span>
              </div>
              <div>
                <h3 className="text-xl font-bold mb-2 text-foreground">Monitore e Otimize</h3>
                <p className="text-muted-foreground">
                  Acompanhe métricas em tempo real e refine sua abordagem com sugestões da IA.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats (fundo secundário) */}
      <section className={cn("py-20 px-4 bg-secondary", animateSections && "animate-fade-in")} style={{ animationDelay: '0.8s' }}>
        {/* ... conteúdo stats ... */}
         <div className="container mx-auto">
          <div className="grid md:grid-cols-3 gap-8 text-center">
            <div>
              <div className="text-4xl font-bold text-primary mb-2">95%</div>
              <p className="text-muted-foreground">Aumento nas taxas de resposta</p>
            </div>
            <div>
              <div className="text-4xl font-bold text-primary mb-2">75%</div>
              <p className="text-muted-foreground">Tempo economizado em follow-ups</p>
            </div>
            <div>
              <div className="text-4xl font-bold text-primary mb-2">3x</div>
              <p className="text-muted-foreground">Melhoria na conversão</p>
            </div>
          </div>
        </div>
      </section>

      {/* NOVA SEÇÃO: Pricing / Planos */}
      <section id="pricing" className={cn("py-20 px-4 bg-background", animateSections && "animate-fade-in")} style={{ animationDelay: '1.0s' }}>
        <div className="container mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-4 text-foreground">Planos Flexíveis</h2>
          <p className="text-center text-muted-foreground max-w-xl mx-auto mb-12">
            Escolha o plano que melhor se adapta às suas necessidades, comece gratuitamente ou potencialize seus resultados com o Premium.
          </p>

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Card Free */}
            <div className="bg-card border border-border rounded-xl p-8 flex flex-col">
              <h3 className="text-2xl font-semibold mb-2 text-card-foreground">Gratuito</h3>
              <p className="text-muted-foreground mb-6">Ideal para começar e testar.</p>
              <div className="mb-6">
                <span className="text-4xl font-bold text-card-foreground">R$ 0</span>
                <span className="text-muted-foreground"> / para sempre</span>
              </div>
              <ul className="space-y-3 text-muted-foreground mb-8 flex-grow">
                <li className="flex items-center gap-2">
                  <Check className="h-5 w-5 text-green-500 flex-shrink-0" />
                  <span>1 Campanha ativa</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-5 w-5 text-green-500 flex-shrink-0" />
                  <span>Até 20 Follow-ups ativos</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-5 w-5 text-green-500 flex-shrink-0" />
                  <span>1 Usuário</span>
                </li>
                 <li className="flex items-center gap-2 opacity-60">
                  <X className="h-5 w-5 text-red-500 flex-shrink-0" />
                  <span>Análise e Geração IA Básica</span>
                </li>
                 <li className="flex items-center gap-2 opacity-60">
                  <X className="h-5 w-5 text-red-500 flex-shrink-0" />
                  <span>API & Webhooks</span>
                </li>
                 <li className="flex items-center gap-2 opacity-60">
                  <X className="h-5 w-5 text-red-500 flex-shrink-0" />
                  <span>Suporte Prioritário</span>
                </li>
              </ul>
               {/* Botão Modificado */}
              <Button variant="secondary" asChild className="w-full">
                <Link href="/auth/register">
                  Comece Gratuitamente
                </Link>
              </Button>
            </div>

            {/* Card Premium (Destaque) */}
            <div className="bg-card border-2 border-primary rounded-xl p-8 flex flex-col relative overflow-hidden">
              {/* Badge de destaque */}
              <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-xs font-bold px-4 py-1 rounded-bl-lg">
                MAIS POPULAR
              </div>
              <h3 className="text-2xl font-semibold mb-2 text-card-foreground">Premium</h3>
              <p className="text-muted-foreground mb-6">Para equipes e crescimento acelerado.</p>
              <div className="mb-6">
                <span className="text-4xl font-bold text-card-foreground">R$ 49</span>
                <span className="text-muted-foreground"> / mês</span>
              </div>
              <ul className="space-y-3 text-muted-foreground mb-8 flex-grow">
                <li className="flex items-center gap-2">
                  <Check className="h-5 w-5 text-primary flex-shrink-0" />
                  <span>Campanhas ilimitadas</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-5 w-5 text-primary flex-shrink-0" />
                  <span>Follow-ups ilimitados</span>
                </li>
                 <li className="flex items-center gap-2">
                  <Check className="h-5 w-5 text-primary flex-shrink-0" />
                  <span>Membros da equipe</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-5 w-5 text-primary flex-shrink-0" />
                  <span>IA Avançada (Análise, Geração, Decisão)</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-5 w-5 text-primary flex-shrink-0" />
                  <span>Acesso à API & Webhooks</span>
                </li>
                 <li className="flex items-center gap-2">
                  <Check className="h-5 w-5 text-primary flex-shrink-0" />
                  <span>Analytics Avançados</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-5 w-5 text-primary flex-shrink-0" />
                  <span>Suporte Prioritário</span>
                </li>
              </ul>
              {/* Botão Modificado */}
              <Button asChild className="w-full">
                <Link href="/auth/register?plan=premium">
                  Assinar Plano Premium
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Final (fundo principal) */}
      <section className={cn("py-20 px-4 bg-background", animateSections && "animate-fade-in")} style={{ animationDelay: '1.2s' }}>
        <div className="container mx-auto max-w-4xl">
          <div className="bg-gradient-to-r from-primary/10 via-secondary/10 to-primary/10 dark:from-primary/20 dark:via-card/10 dark:to-primary/20 p-10 rounded-2xl text-center border border-border">
            <h2 className="text-3xl md:text-4xl font-bold mb-6 text-foreground">Transforme seus Follow-ups Hoje</h2>
            <p className="text-xl text-muted-foreground mb-8">
              Comece gratuitamente ou escolha o plano Premium para liberar todo o potencial da IA.
            </p>
             {/* Botões Modificados */}
            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <Button size="lg" asChild className="transition-transform transform hover:scale-105 duration-300">
                <Link href="/auth/register">
                  Comece Gratuitamente <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button variant="outline" size="lg" asChild>
                <Link href="/auth/login">
                  Entrar
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

    </div>
  );
}