'use client';

import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff } from 'lucide-react';

// Importar a Server Action (agora descomentado)
import { changePassword } from '@/lib/actions/userActions';

export default function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  // Estados para controlar a visibilidade das senhas
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);

  const handleChangePassword = async () => {
    setIsSaving(true);

    // Validação básica no cliente
    if (newPassword !== confirmNewPassword) {
      toast({
        title: "Erro de validação",
        description: "A nova senha e a confirmação não coincidem.",
        variant: "destructive",
      });
      setIsSaving(false);
      return;
    }

    if (!currentPassword || !newPassword) {
       toast({
        title: "Erro de validação",
        description: "Por favor, preencha todos os campos de senha.",
        variant: "destructive",
      });
      setIsSaving(false);
      return;
    }

    // Chamar a Server Action changePassword
    console.log("Tentando mudar senha:", { currentPassword, newPassword });
    
    const result = await changePassword({ currentPassword, newPassword });
    
    if (result.success) {
      toast({
        title: "Sucesso!",
        description: result.message || "Senha alterada com sucesso.",
      });
      // Limpar campos após sucesso
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
    } else {
      toast({
        title: "Erro ao alterar senha",
        description: result.message || "Ocorreu um erro ao alterar a senha.",
        variant: "destructive",
      });
    }

    setIsSaving(false);
  };

  return (
    <Card className="w-full max-w-md mx-auto mt-6">
      <CardHeader>
        <CardTitle>Alterar Senha</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="current-password">Senha Atual</Label>
          <div className="relative">
            <Input
              id="current-password"
              type={showCurrentPassword ? "text" : "password"}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              disabled={isSaving}
              className="pr-10"
            />
             <button
              type="button"
              onClick={() => setShowCurrentPassword(!showCurrentPassword)}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground focus:outline-none"
              disabled={isSaving}
            >
              {showCurrentPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="new-password">Nova Senha</Label>
           <div className="relative">
            <Input
              id="new-password"
              type={showNewPassword ? "text" : "password"}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={isSaving}
               className="pr-10"
            />
             <button
              type="button"
              onClick={() => setShowNewPassword(!showNewPassword)}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground focus:outline-none"
              disabled={isSaving}
            >
              {showNewPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm-new-password">Confirmar Nova Senha</Label>
           <div className="relative">
            <Input
              id="confirm-new-password"
              type={showConfirmNewPassword ? "text" : "password"}
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
              disabled={isSaving}
               className="pr-10"
            />
             <button
              type="button"
              onClick={() => setShowConfirmNewPassword(!showConfirmNewPassword)}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground focus:outline-none"
              disabled={isSaving}
            >
              {showConfirmNewPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <Button onClick={handleChangePassword} disabled={isSaving}>
          {isSaving ? 'Alterando...' : 'Alterar Senha'}
        </Button>
      </CardFooter>
    </Card>
  );
} 