// app/workspace/[slug]/campaigns/components/CampaignFormModal.tsx
import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from 'lucide-react';
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Campaign, CampaignFormData } from '@/app/types';
import { useFollowUp } from '@/context/follow-up-context';
import { toast } from 'react-hot-toast';

interface CampaignFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialData: Campaign | null;
  // onSubmit, workspaceId, isLoading REMOVIDOS
}

const defaultFormData: CampaignFormData = {
  id: '',
  name: '',
  description: '',
  active: true,
  ai_prompt_product_name: '',
  ai_prompt_target_audience: '',
  ai_prompt_pain_point: '',
  ai_prompt_main_benefit: '',
  ai_prompt_tone_of_voice: '',
  funnel_stage_id: '',
  followUpId: '',
  tokenAgentLumibot: null,
  // createdAt: new Date(), // REMOVIDO - Não pertence a CampaignFormData
  // steps: [] // REMOVIDO - Não pertence a CampaignFormData
};

export default function CampaignFormModal({
  isOpen,
  onClose,
  initialData,
}: CampaignFormModalProps) {
  const { createCampaign, updateCampaign } = useFollowUp(); // <<< Obter funções do contexto
  const [formData, setFormData] = useState<CampaignFormData>(defaultFormData);
  const [isSubmitting, setIsSubmitting] = useState(false); // <<< Estado de loading local para submissão
  const [formError, setFormError] = useState<string | null>(null); // <<< Estado de erro local

  useEffect(() => {
    if (isOpen) {
      setFormError(null); // Limpa erro ao abrir
      if (initialData) {
        // Preenche o formulário para edição
        setFormData({
          id: initialData.id || '',
          name: initialData.name || '',
          description: initialData.description || '',
          active: initialData.active ?? true,
          ai_prompt_product_name: initialData.ai_prompt_product_name || '',
          ai_prompt_target_audience: initialData.ai_prompt_target_audience || '',
          ai_prompt_pain_point: initialData.ai_prompt_pain_point || '',
          ai_prompt_main_benefit: initialData.ai_prompt_main_benefit || '',
          ai_prompt_tone_of_voice: initialData.ai_prompt_tone_of_voice || '',
          funnel_stage_id: initialData.funnel_stage_id || '',
          followUpId: initialData.followUpId || '',
          tokenAgentLumibot: initialData.tokenAgentLumibot ?? null,
          // createdAt: initialData.createdAt || new Date(), // REMOVIDO
          // steps: initialData.steps || [] // REMOVIDO
        });
      } else {
        setFormData(defaultFormData); // Reset para criação
      }
    }
  }, [initialData, isOpen]);

  // Handlers (handleChange, handleSelectChange, handleSwitchChange) permanecem os mesmos...
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

  // <<< Refatorando o Handler de Submissão >>>
  const handleSubmitInternal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) {
      setFormError("O nome da campanha é obrigatório.");
      return;
    }
    setIsSubmitting(true);
    setFormError(null);

    try {
      if (initialData?.id) {
        // --- Edição ---
        console.log(`Modal: Atualizando campanha ${initialData.id}`);
        // Não precisa passar workspaceId aqui, o contexto deve obter
        await updateCampaign(initialData.id, formData);
        toast.success('Campanha atualizada com sucesso!');
      } else {
        // --- Criação ---
        console.log("Modal: Criando nova campanha");
        // Não precisa passar workspaceId aqui, o contexto deve obter
        await createCampaign(formData);
        toast.success('Campanha criada com sucesso!');
      }
      onClose(); // Fecha o modal em caso de sucesso
    } catch (err: any) {
      console.error("Modal: Erro ao salvar campanha:", err);
      const message = err.response?.data?.error || err.response?.data?.message || err.message || 'Falha ao salvar a campanha.';
      setFormError(message); // Exibe o erro no modal
      toast.error(`Erro: ${message}`); // Exibe toast de erro
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !isSubmitting && onClose()}> {/* Evita fechar durante submit */}
      <DialogContent className="sm:max-w-2xl bg-card border-border max-h-[90vh] overflow-y-auto">
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

        {/* Exibir erro local do formulário */}
        {formError && (
          <div className="my-2 p-3 bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-md">
            {formError}
          </div>
        )}

        <form onSubmit={handleSubmitInternal} className="space-y-4 py-4">

          {/* Campo Nome */}
          <div className="space-y-1.5">
            <Label htmlFor="name" className="text-foreground">Nome da Campanha*</Label>
            <Input
              id="name" name="name"
              value={formData.name} onChange={handleChange}
              className="bg-input border-input"
              required disabled={isSubmitting}
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
              disabled={isSubmitting}
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
              disabled={isSubmitting}
              aria-readonly={isSubmitting}
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
                  className="bg-input border-input" disabled={isSubmitting}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tokenAgentLumibot" className="text-foreground">Token Agente Lumibot (Opcional)</Label>
                <Input
                  id="tokenAgentLumibot" name="tokenAgentLumibot"
                  value={formData.tokenAgentLumibot ?? ''} onChange={handleChange}
                  className="bg-input border-input" disabled={isSubmitting}
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
                  className="bg-input border-input" disabled={isSubmitting}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ai_prompt_target_audience" className="text-foreground">Público-Alvo</Label>
                <Input
                  id="ai_prompt_target_audience" name="ai_prompt_target_audience" placeholder="Ex: Pequenas empresas de e-commerce"
                  value={formData.ai_prompt_target_audience ?? ''} onChange={handleChange}
                  className="bg-input border-input" disabled={isSubmitting}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ai_prompt_pain_point" className="text-foreground">Dor Principal</Label>
              <Textarea
                id="ai_prompt_pain_point" name="ai_prompt_pain_point" placeholder="Ex: Dificuldade em gerar leads qualificados online"
                value={formData.ai_prompt_pain_point ?? ''} onChange={handleChange}
                className="bg-input border-input min-h-[60px]" disabled={isSubmitting}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ai_prompt_main_benefit" className="text-foreground">Benefício Principal</Label>
              <Textarea
                id="ai_prompt_main_benefit" name="ai_prompt_main_benefit" placeholder="Ex: Aumentar as vendas online em 30% em 3 meses"
                value={formData.ai_prompt_main_benefit ?? ''} onChange={handleChange}
                className="bg-input border-input min-h-[60px]" disabled={isSubmitting}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ai_prompt_tone_of_voice" className="text-foreground">Tom de Voz</Label>
              {/* Usar componente Select do Shadcn */}
              <Select name="ai_prompt_tone_of_voice" value={formData.ai_prompt_tone_of_voice ?? 'Neutro'} onValueChange={handleSelectChange} disabled={isSubmitting}>
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
                className="bg-input border-input min-h-[80px]" disabled={isSubmitting}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="ai_prompt_cta_text" className="text-foreground">Texto Call-to-Action (CTA)</Label>
                <Input
                  id="ai_prompt_cta_text" name="ai_prompt_cta_text" placeholder="Ex: Agende uma demonstração gratuita"
                  value={formData.ai_prompt_cta_text ?? ''} onChange={handleChange}
                  className="bg-input border-input" disabled={isSubmitting}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ai_prompt_cta_link" className="text-foreground">Link do CTA</Label>
                <Input
                  id="ai_prompt_cta_link" name="ai_prompt_cta_link" type="url" placeholder="https://seu-site.com/demo"
                  value={formData.ai_prompt_cta_link ?? ''} onChange={handleChange}
                  className="bg-input border-input" disabled={isSubmitting}
                />
              </div>
            </div>


          </div> {/* Fim Seção IA */}

          {/* Botões do Footer */}
          <DialogFooter className="pt-4 border-t border-border">
            <DialogClose asChild>
              <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isSubmitting || !formData.name}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {isSubmitting ? 'Salvando...' : (initialData ? 'Salvar Alterações' : 'Criar Campanha')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}