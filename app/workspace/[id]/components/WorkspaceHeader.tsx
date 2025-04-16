'use client';

import { usePathname, useParams } from 'next/navigation';
import { useWorkspace } from '../../../../context/workspace-context';
import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';
import { Button } from '../../../../components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../../../components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Sun, Moon, LogOut, Settings, ChevronRight, Home } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '../../../../components/header'; // Reutilizar o hook de tema do header global

export default function WorkspaceHeader() {
  const { workspace } = useWorkspace(); // Pegar nome do workspace
  const { data: session } = useSession();
  const pathname = usePathname();
  const params = useParams();
  const slug = params?.slug as string;
  const { theme, toggleTheme } = useTheme(); // Reutilizar hook de tema

  // Função simples para gerar breadcrumbs (pode ser melhorada)
  const generateBreadcrumbs = () => {
    if (!pathname || !workspace) return null;
    const basePath = ``;
    const pathSegments = pathname.replace(basePath, '').split('/').filter(Boolean);

    // Remove 'workspace' e o id dos segmentos
    const filteredSegments = pathSegments.filter(
      (segment, idx) =>
        // Remove 'workspace' (primeiro) e o id (segundo)
        !(idx === 0 && segment === 'workspace') && !(idx === 1 && segment === params.id)
    );

    const breadcrumbs = [
      { label: workspace.name, href: `/workspace/${workspace.id}`, icon: Home }, // Dashboard do workspace
    ];

    console.log('currentPath', pathSegments);

    let currentPath = `/workspace/${workspace.id}`;
    filteredSegments.forEach((segment) => {
      currentPath += `/${segment}`;
      // Capitaliza o segmento para label
      const label = segment.charAt(0).toUpperCase() + segment.slice(1);
      breadcrumbs.push({ label: label, href: currentPath, icon: ChevronRight });
    });

    return (
      <nav aria-label="Breadcrumb" className="flex items-center space-x-1 text-sm text-muted-foreground">
        {breadcrumbs.map((crumb, index) => (
          <div key={crumb.href} className="flex items-center">
            {index > 0 && <ChevronRight className="h-4 w-4 flex-shrink-0" />}
            {index === 0 && crumb.icon && <crumb.icon className="h-4 w-4 mr-1.5 flex-shrink-0" />}
            <Link
              href={crumb.href}
              className={cn(
                "ml-1 hover:text-foreground",
                index === breadcrumbs.length - 1 ? "font-medium text-foreground" : "" // Destaca o último
              )}
            >
              {crumb.label}
            </Link>
          </div>
        ))}
      </nav>
    );
  };

  return (
    <header className="flex h-16 items-center justify-between border-b border-border bg-background px-6 sticky top-0 z-30">
      {/* Breadcrumbs */}
      <div>
        {generateBreadcrumbs()}
      </div>

      {/* Controles (Tema e Usuário) */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          aria-label={`Mudar para tema ${theme === 'light' ? 'escuro' : 'claro'}`}
        >
          {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </Button>

        {session?.user && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={session.user.image ?? undefined} alt={session.user.name ?? 'Usuário'} />
                  <AvatarFallback>
                    {session.user.name ? session.user.name.charAt(0).toUpperCase() : 'U'}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">{session.user.name}</p>
                  <p className="text-xs leading-none text-muted-foreground">
                    {session.user.email}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {/* Adicione itens específicos do workspace se necessário */}
               <DropdownMenuItem asChild>
                 <Link href="/profile"> {/* Link para perfil geral, pode ajustar */}
                   <Settings className="mr-2 h-4 w-4" />
                   <span>Configurações da Conta</span>
                  </Link>
               </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => signOut({ callbackUrl: '/' })}>
                <LogOut className="mr-2 h-4 w-4" />
                <span>Sair</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  );
}

