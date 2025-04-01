// app/workspace/[slug]/campaigns/components/CampaignFormModal.tsx
import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from 'lucide-react';
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"; // <<< ADICIONAR Select
import type { Campaign, CampaignFormData } from '@/app/types'; // Importar tipos centralizados

interface CampaignFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CampaignFormData) => Promise<void>;
  initialData: Campaign | null;
  workspaceId: string; // Mantido caso a API precise
  isLoading: boolean;
}

const defaultFormData: CampaignFormData = {
  name: '',
  description: '',
  active: true,
  ai_prompt_product_name: '',
  ai_prompt_target_audience: '',
  ai_prompt_pain_point: '',
  ai_prompt_main_benefit: '',
  ai_prompt_tone_of_voice: 'Neutro',
  ai_prompt_extra_instructions: '',
  ai_prompt_cta_link: '',
  ai_prompt_cta_text: '',
  idLumibot: null,
  tokenAgentLumibot: null,
};

export default function CampaignFormModal({
  isOpen,
  onClose,
  onSubmit,
  initialData,
  isLoading
}: CampaignFormModalProps) {
  const [formData, setFormData] = useState<CampaignFormData>(defaultFormData);

  useEffect(() => {
    if (isOpen) { // Executa ao abrir o modal
      if (initialData) {
        setFormData({
          name: initialData.name || '',
          description: initialData.description || '',
          active: initialData.active ?? true,
          ai_prompt_product_name: initialData.ai_prompt_product_name || '',
          ai_prompt_target_audience: initialData.ai_prompt_target_audience || '',
          ai_prompt_pain_point: initialData.ai_prompt_pain_point || '',
          ai_prompt_main_benefit: initialData.ai_prompt_main_benefit || '',
          ai_prompt_tone_of_voice: initialData.ai_prompt_tone_of_voice || 'Neutro',
          ai_prompt_extra_instructions: initialData.ai_prompt_extra_instructions || '',
          ai_prompt_cta_link: initialData.ai_prompt_cta_link || '',
          ai_prompt_cta_text: initialData.ai_prompt_cta_text || '',
          idLumibot: initialData.idLumibot ?? null,
          tokenAgentLumibot: initialData.tokenAgentLumibot ?? null,
        });
      } else {
        setFormData(defaultFormData); // Reset para criação
      }
    }
  }, [initialData, isOpen]); // Depende de isOpen para resetar/preencher corretamente

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (value: string) => {
    setFormData(prev => ({ ...prev, ai_prompt_tone_of_voice: value }));
  };

  const handleSwitchChange = (checked: boolean) => {
    setFormData(prev => ({ ...prev, active: checked }));
  };

  const handleSubmitInternal = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(formData);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      {/* Aumentar a altura máxima e permitir scroll */}
      <DialogContent className="sm:max-w-2xl bg-card border-border max-h-[90vh] overflow-y-auto"> {/* Ajuste largura e altura */}
        <DialogHeader>
          <DialogTitle className="text-card-foreground">
            {initialData ? 'Editar Campanha' : 'Criar Nova Campanha'}
          </DialogTitle>
          <DialogDescription>
            {initialData
              ? 'Modifique os detalhes da sua campanha.'
              : 'Preencha as informações para iniciar uma nova campanha de follow-up.'}
          </DialogDescription>
        </DialogHeader>

        {/* Usar um div com espaçamento vertical para o formulário */}
        <form onSubmit={handleSubmitInternal} className="space-y-4 py-4">

          {/* Campo Nome */}
          <div className="space-y-1.5">
            <Label htmlFor="name" className="text-foreground">Nome da Campanha*</Label>
            <Input
              id="name" name="name"
              value={formData.name} onChange={handleChange}
              className="bg-input border-input"
              required disabled={isLoading}
            />
          </div>

          {/* Campo Descrição */}
          <div className="space-y-1.5">
            <Label htmlFor="description" className="text-foreground">Descrição</Label>
            <Textarea
              id="description" name="description"
              value={formData.description ?? ''} onChange={handleChange}
              placeholder="Descreva o objetivo desta campanha..."
              className="bg-input border-input min-h-[80px]"
              disabled={isLoading}
            />
          </div>

          {/* Campo Status */}
          <div className="flex items-center justify-between rounded-lg border p-3 shadow-sm bg-input/30 border-input">
            <div className="space-y-0.5">
              <Label htmlFor="active" className="text-foreground text-sm font-medium">Status da Campanha</Label>
              <p className="text-xs text-muted-foreground">
                {formData.active ? 'A campanha está ativa e pode iniciar follow-ups.' : 'A campanha está inativa e não iniciará novos follow-ups.'}
              </p>
            </div>
            <Switch
              id="active"
              checked={formData.active}
              onCheckedChange={handleSwitchChange}
              disabled={isLoading}
              aria-readonly={isLoading}
            />
          </div>
          <div className='pt-4 space-y-4'>
            <h3 className="text-lg font-semibold text-foreground border-b border-border pb-2">Auth Lumibot</h3>
            {/* Adicionar campos idLumibot e tokenAgentLumibot se forem editáveis */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="idLumibot" className="text-foreground">ID Lumibot (Opcional)</Label>
                <Input
                  id="idLumibot" name="idLumibot"
                  value={formData.idLumibot ?? ''} onChange={handleChange}
                  className="bg-input border-input" disabled={isLoading}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tokenAgentLumibot" className="text-foreground">Token Agente Lumibot (Opcional)</Label>
                <Input
                  id="tokenAgentLumibot" name="tokenAgentLumibot"
                  value={formData.tokenAgentLumibot ?? ''} onChange={handleChange}
                  className="bg-input border-input" disabled={isLoading}
                />
              </div>
            </div>

          </div>

          {/* --- Seção Configuração IA --- */}
          <div className="pt-4 space-y-4">
            <h3 className="text-lg font-semibold text-foreground border-b border-border pb-2">Configuração da IA</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4"> {/* Grid para campos lado a lado */}
              <div className="space-y-1.5">
                <Label htmlFor="ai_prompt_product_name" className="text-foreground">Produto/Serviço</Label>
                <Input
                  id="ai_prompt_product_name" name="ai_prompt_product_name" placeholder="Ex: Consultoria de Marketing Digital"
                  value={formData.ai_prompt_product_name ?? ''} onChange={handleChange}
                  className="bg-input border-input" disabled={isLoading}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ai_prompt_target_audience" className="text-foreground">Público-Alvo</Label>
                <Input
                  id="ai_prompt_target_audience" name="ai_prompt_target_audience" placeholder="Ex: Pequenas empresas de e-commerce"
                  value={formData.ai_prompt_target_audience ?? ''} onChange={handleChange}
                  className="bg-input border-input" disabled={isLoading}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ai_prompt_pain_point" className="text-foreground">Dor Principal</Label>
              <Textarea
                id="ai_prompt_pain_point" name="ai_prompt_pain_point" placeholder="Ex: Dificuldade em gerar leads qualificados online"
                value={formData.ai_prompt_pain_point ?? ''} onChange={handleChange}
                className="bg-input border-input min-h-[60px]" disabled={isLoading}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ai_prompt_main_benefit" className="text-foreground">Benefício Principal</Label>
              <Textarea
                id="ai_prompt_main_benefit" name="ai_prompt_main_benefit" placeholder="Ex: Aumentar as vendas online em 30% em 3 meses"
                value={formData.ai_prompt_main_benefit ?? ''} onChange={handleChange}
                className="bg-input border-input min-h-[60px]" disabled={isLoading}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ai_prompt_tone_of_voice" className="text-foreground">Tom de Voz</Label>
              {/* Usar componente Select do Shadcn */}
              <Select name="ai_prompt_tone_of_voice" value={formData.ai_prompt_tone_of_voice ?? 'Neutro'} onValueChange={handleSelectChange} disabled={isLoading}>
                <SelectTrigger className="w-full bg-input border-input">
                  <SelectValue placeholder="Selecione o tom..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Formal">Formal</SelectItem>
                  <SelectItem value="Informal">Informal</SelectItem>
                  <SelectItem value="Amigável">Amigável</SelectItem>
                  <SelectItem value="Entusiasmado">Entusiasmado</SelectItem>
                  <SelectItem value="Neutro">Neutro</SelectItem>
                  <SelectItem value="Persuasivo">Persuasivo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ai_prompt_extra_instructions" className="text-foreground">Instruções Extras para IA</Label>
              <Textarea
                id="ai_prompt_extra_instructions" name="ai_prompt_extra_instructions" placeholder="Ex: Mencionar a promoção atual, não usar gírias, focar no ROI..."
                value={formData.ai_prompt_extra_instructions ?? ''} onChange={handleChange}
                className="bg-input border-input min-h-[80px]" disabled={isLoading}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="ai_prompt_cta_text" className="text-foreground">Texto Call-to-Action (CTA)</Label>
                <Input
                  id="ai_prompt_cta_text" name="ai_prompt_cta_text" placeholder="Ex: Agende uma demonstração gratuita"
                  value={formData.ai_prompt_cta_text ?? ''} onChange={handleChange}
                  className="bg-input border-input" disabled={isLoading}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ai_prompt_cta_link" className="text-foreground">Link do CTA</Label>
                <Input
                  id="ai_prompt_cta_link" name="ai_prompt_cta_link" type="url" placeholder="https://seu-site.com/demo"
                  value={formData.ai_prompt_cta_link ?? ''} onChange={handleChange}
                  className="bg-input border-input" disabled={isLoading}
                />
              </div>
            </div>


          </div> {/* Fim Seção IA */}

          {/* Botões do Footer */}
          <DialogFooter className="pt-4 border-t border-border">
            <DialogClose asChild>
              <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isLoading || !formData.name}>
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {isLoading ? 'Salvando...' : (initialData ? 'Salvar Alterações' : 'Criar Campanha')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}