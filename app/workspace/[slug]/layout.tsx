'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname, useParams } from 'next/navigation';
import Link from 'next/link';
import { useWorkspace } from '@/context/workspace-context';
import { cn } from '@/lib/utils'; // Certifique-se que seu utils está correto
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'; // Importe Tooltip do Shadcn
import { Button } from '@/components/ui/button'; // Importe Button do Shadcn
import {
  LayoutDashboard, 
  Users,
  Settings,
  CheckSquare,
  MessageSquare,
  BookOpen,
  ChevronsLeft, 
  ChevronsRight,
  Loader2,
  Folders,
  Contact, 
} from 'lucide-react';
import WorkspaceHeader from './components/WorkspaceHeader'; // <<< Importar
import WorkspaceFooter from './components/WorkspaceFooter'; // <<< Importar (opcional)

// Interface para os itens de navegação
interface NavItem {
  href: string; // Sufixo do href relativo ao slug do workspace
  label: string;
  icon: React.ElementType; // Componente do ícone
  matchExact?: boolean; // Para o dashboard, queremos match exato
}

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { workspace, isLoading } = useWorkspace();
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const slug = params?.slug as string;

  const [isCollapsed, setIsCollapsed] = useState(false); // Estado para controlar sidebar

  // Definição dos itens de navegação
  const navItems: NavItem[] = [
    { href: '', label: 'Dashboard', icon: LayoutDashboard, matchExact: true },
    { href: '/clients', label: 'Clientes', icon: Contact },
    { href: '/followup', label: 'Follow-up', icon: MessageSquare },
    { href: '/campaigns', label: 'Campanhas', icon: CheckSquare },
    { href: '/members', label: 'Membros', icon: Users },
    { href: '/settings', label: 'Configurações', icon: Settings },
  ];

  const secondaryNavItems: NavItem[] = [
    { href: '/api/docs', label: 'Documentação API', icon: BookOpen },
    // Adicione outros links secundários se necessário
  ];

 
  // Função para verificar link ativo (mais precisa)
  const isActive = (item: NavItem) => {
    if (!pathname || !slug) return false;
    const baseWorkspacePath = `/workspace/${slug}`;
    const fullHref = item.href ? `${baseWorkspacePath}${item.href}` : baseWorkspacePath;

    if (item.matchExact) {
      return pathname === fullHref;
    }
    // Verifica se o pathname atual começa exatamente com o href do item
    // Adiciona '/' ao final do href para evitar matches parciais indesejados (ex: /members matching /members-settings)
    return pathname === fullHref || pathname.startsWith(fullHref + '/');
  };


  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2 text-muted-foreground">Carregando workspace...</span>
      </div>
    );
  }

  // Se ainda não tem workspace após carregar, não renderiza o layout
  if (!workspace) return null;

  return (
    // Envolver com TooltipProvider para os tooltips funcionarem
    <TooltipProvider delayDuration={0}>
      <div className={cn(
          "flex h-screen bg-background text-foreground overflow-hidden",
           // Adiciona classe para gerenciar layout colapsado
          // `theme-${theme}` // Se precisar de estilos específicos por tema
        )}
      >
        {/* Sidebar */}
        <aside
          className={cn(
            'flex flex-col border-r border-border bg-background transition-all duration-300 ease-in-out',
            isCollapsed ? 'w-20' : 'w-64' // Largura dinâmica
          )}
        >
          {/* Topo da Sidebar - Logo/Nome */}
          <div className={cn(
              "flex items-center h-16 border-b border-border px-4",
               isCollapsed ? 'justify-center' : 'justify-between'
             )}
           >
             {/* Link pode envolver logo + texto ou só logo quando colapsado */}
            <Link href="/workspaces" className={cn("flex items-center gap-2 font-bold text-lg", isCollapsed && "justify-center w-full")}>
               {/* Ícone sempre visível */}
               <Folders className="h-6 w-6 text-primary flex-shrink-0" />
               {/* Texto some quando colapsado */}
              {!isCollapsed && (
                 <span className="truncate">{workspace.name}</span>
              )}
            </Link>
             {/* Botão de colapsar (opcional aqui no topo) */}
             {/* <Button variant="ghost" size="icon" className={cn(!isCollapsed && "hidden")} onClick={() => setIsCollapsed(false)}>
                <ChevronsRight className="h-5 w-5" />
             </Button> */}
          </div>

          {/* Navegação Principal */}
          <nav className="flex-1 overflow-y-auto px-3 py-4">
            <ul className="space-y-1.5">
              {navItems.map((item) => {
                const active = isActive(item);
                const linkContent = (
                  <>
                    <item.icon className={cn("h-5 w-5 flex-shrink-0", active ? "text-primary-foreground" : "text-muted-foreground group-hover:text-foreground")} />
                     {/* Span para o texto, esconde visualmente mas pode manter espaço */}
                     <span
                        className={cn(
                          'truncate transition-opacity duration-200',
                          isCollapsed ? 'opacity-0 w-0' : 'opacity-100' // Esconde texto
                        )}
                     >
                      {item.label}
                    </span>
                  </>
                );

                return (
                  <li key={item.label}>
                     {/* Se colapsado, envolve com Tooltip */}
                     {isCollapsed ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                           {/* Link com as classes */}
                          <Link
                            href={item.href ? `/workspace/${slug}${item.href}` : `/workspace/${slug}`}
                            className={cn(
                              'flex items-center gap-3 rounded-md text-sm font-medium transition-colors group',
                              'h-10', // Altura fixa para alinhamento
                              isCollapsed ? 'justify-center w-full px-0' : 'px-4', // Padding condicional
                              active
                                ? 'bg-primary text-primary-foreground'
                                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                            )}
                           >
                              {linkContent}
                          </Link>
                        </TooltipTrigger>
                        <TooltipContent side="right" sideOffset={5}>
                           {item.label}
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                       // Se expandido, Link normal
                      <Link
                        href={item.href ? `/workspace/${slug}${item.href}` : `/workspace/${slug}`}
                        className={cn(
                           'flex items-center gap-3 rounded-md text-sm font-medium transition-colors group',
                           'h-10 px-4', // Altura e padding fixos
                           active
                             ? 'bg-primary text-primary-foreground'
                             : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                         )}
                       >
                        {linkContent}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </nav>

           {/* Rodapé da Sidebar - Docs e Botão de Colapsar */}
           <div className="mt-auto border-t border-border p-3 space-y-2">
             {/* Link Documentação */}
             {secondaryNavItems.map((item) => {
                const linkContent = (
                  <>
                    <item.icon className="h-5 w-5 flex-shrink-0 text-muted-foreground group-hover:text-foreground" />
                    <span
                      className={cn(
                        'truncate transition-opacity duration-200',
                         isCollapsed ? 'opacity-0 w-0' : 'opacity-100'
                      )}
                    >
                      {item.label}
                    </span>
                  </>
                );
                return (
                  <div key={item.label}>
                    {isCollapsed ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Link
                            href={item.href}
                             target={item.href.startsWith('/api/docs') ? '_blank' : undefined} // Abrir docs em nova aba
                            className={cn(
                               'flex items-center gap-3 rounded-md text-sm font-medium transition-colors group',
                               'h-10',
                               isCollapsed ? 'justify-center w-full px-0' : 'px-4',
                               'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                             )}
                           >
                            {linkContent}
                          </Link>
                        </TooltipTrigger>
                         <TooltipContent side="right" sideOffset={5}>
                          {item.label}
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <Link
                        href={item.href}
                        target={item.href.startsWith('/api/docs') ? '_blank' : undefined}
                         className={cn(
                           'flex items-center gap-3 rounded-md text-sm font-medium transition-colors group',
                           'h-10 px-4',
                           'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                         )}
                       >
                        {linkContent}
                      </Link>
                    )}
                  </div>
                );
             })}

              {/* Botão Colapsar/Expandir */}
             <Button
               variant="ghost"
               size={isCollapsed ? "icon" : "default"} // Tamanho do botão muda
               className={cn(
                  "w-full text-muted-foreground hover:text-foreground hover:bg-accent",
                  isCollapsed ? 'h-10' : 'h-10 justify-start px-4' // Estilo como um link
                )}
               onClick={() => setIsCollapsed(!isCollapsed)}
               aria-label={isCollapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}
             >
               {isCollapsed ? (
                  <ChevronsRight className="h-5 w-5" />
               ) : (
                  <>
                     <ChevronsLeft className="h-5 w-5" />
                     <span className="ml-3">Colapsar</span>
                  </>
               )}
             </Button>
           </div>
        </aside>

        {/* <<< NOVA ESTRUTURA PARA O CONTEÚDO PRINCIPAL >>> */}
        {/* Container flexível que ocupa o resto do espaço, com layout vertical */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Header específico do Workspace */}
          <WorkspaceHeader />
          {/* Área de conteúdo principal rolável */}
          <main className="flex-1 overflow-auto bg-muted/30">
            {/* Padding aplicado aqui para o conteúdo */}
            <div className="p-6 h-full">
              {children}
            </div>
          </main>
          {/* Footer específico do Workspace (opcional) */}
          <WorkspaceFooter />
        </div>
      </div>
    </TooltipProvider>
  );
}