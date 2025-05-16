'use client';

import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

import { updateUserProfile } from '@/lib/actions/userActions';

interface ProfileFormProps {
  user: { // Defina uma interface mais completa baseada no seu schema.prisma User model se necessário
    id: string;
    name: string | null;
    email: string;
    // Adicionar outros campos do usuário aqui se forem editáveis
  };
}

export default function ProfileForm({ user }: ProfileFormProps) {
  const [name, setName] = useState(user.name || '');
  const [email, setEmail] = useState(user.email);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  const handleSave = async () => {
    setIsSaving(true);
    
    const result = await updateUserProfile({ name });

    if (result.success) {
      console.log("Perfil atualizado com sucesso:", result.user);
      toast({
        title: "Sucesso!",
        description: result.message || "Perfil atualizado.",
      });
    } else {
      console.error("Erro ao atualizar perfil:", result.message);
      toast({
        title: "Erro ao salvar",
        description: result.message || "Ocorreu um erro ao atualizar o perfil.",
        variant: "destructive",
      });
    }
    
    setIsSaving(false);
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle>Informações da Conta</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Nome</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isSaving}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            readOnly
            disabled
          />
        </div>
      </CardContent>
      <CardFooter>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? 'Salvando...' : 'Salvar Alterações'}
        </Button>
      </CardFooter>
    </Card>
  );
} 