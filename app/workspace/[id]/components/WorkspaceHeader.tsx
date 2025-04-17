'use client';

import { usePathname, useParams } from 'next/navigation';
import { useWorkspace } from '../../../../context/workspace-context';
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
import { useTheme } from '../../../../components/header';
import { createClient } from '@/lib/supabase/client';
import { useEffect, useState } from 'react';
import { User } from '@supabase/supabase-js';

export default function WorkspaceHeader() {
  const { workspace } = useWorkspace();
  const [user, setUser] = useState<User | null>(null);
  const pathname = usePathname();
  const params = useParams();
  const slug = params?.slug as string;
  const { theme, toggleTheme } = useTheme();
  const supabase = createClient();

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    };

    getUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const generateBreadcrumbs = () => {
    if (!pathname || !workspace) return null;
    const basePath = ``;
    const pathSegments = pathname.replace(basePath, '').split('/').filter(Boolean);

    const filteredSegments = pathSegments.filter(
      (segment, idx) =>
        !(idx === 0 && segment === 'workspace') && !(idx === 1 && segment === params.id)
    );

    const breadcrumbs = [
      { label: workspace.name, href: `/workspace/${workspace.id}`, icon: Home },
    ];

    let currentPath = `/workspace/${workspace.id}`;
    filteredSegments.forEach((segment) => {
      currentPath += `/${segment}`;
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
                index === breadcrumbs.length - 1 ? "font-medium text-foreground" : ""
              )}
            >
              {crumb.label}
            </Link>
          </div>
        ))}
      </nav>
    );
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <header className="flex h-16 items-center justify-between border-b border-border bg-background px-6 sticky top-0 z-30">
      <div>
        {generateBreadcrumbs()}
      </div>

      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          aria-label={`Mudar para tema ${theme === 'light' ? 'escuro' : 'claro'}`}
        >
          {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </Button>

        {user && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                <Avatar className="h-8 w-8">
                  <AvatarFallback>
                    {user.email ? user.email.charAt(0).toUpperCase() : 'U'}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-xs leading-none text-muted-foreground">
                    {user.email}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/account">
                  <Settings className="mr-2 h-4 w-4" />
                  <span>Configurações da Conta</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut}>
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

