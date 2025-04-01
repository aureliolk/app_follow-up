// app/workspace/[slug]/campaigns/components/CampaignFormModal.tsx
import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea"; // Importar Textarea
import { Loader2 } from 'lucide-react';
import { Switch } from "@/components/ui/switch"; // Para o campo 'active'




import type { Campaign, CampaignFormData } from '@/app/types';

interface CampaignFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CampaignFormData) => Promise<void>; // onSubmit agora é async
  initialData: Campaign | null; // Pode ser Campaign completa ou null
  workspaceId: string; // Necessário se a API precisar
  isLoading: boolean;
}

export default function CampaignFormModal({ isOpen, onClose, onSubmit, initialData, isLoading }: CampaignFormModalProps) {
  // Estado interno do formulário
  const [formData, setFormData] = useState<CampaignFormData>({
    name: '',
    description: '',
    active: true,
    ai_prompt_product_name: '',
    ai_prompt_target_audience: '',
    ai_prompt_pain_point: '',
    ai_prompt_main_benefit: '',
    ai_prompt_tone_of_voice: 'Neutro', // Valor padrão
    ai_prompt_extra_instructions: '',
    ai_prompt_cta_link: '',
    ai_prompt_cta_text: '',
  });

  // Preencher o formulário quando initialData (para edição) mudar
  useEffect(() => {
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
      });
    } else {
      // Resetar para criação
       setFormData({
        name: '', description: '', active: true, ai_prompt_product_name: '',
        ai_prompt_target_audience: '', ai_prompt_pain_point: '', ai_prompt_main_benefit: '',
        ai_prompt_tone_of_voice: 'Neutro', ai_prompt_extra_instructions: '',
        ai_prompt_cta_link: '', ai_prompt_cta_text: '',
      });
    }
  }, [initialData, isOpen]); // Depende de isOpen para resetar ao abrir para criar

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

   const handleSwitchChange = (checked: boolean) => {
    setFormData(prev => ({ ...prev, active: checked }));
  };

  const handleSubmitInternal = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(formData); // Chama a função passada pela página pai
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] bg-card border-border"> {/* Ajuste largura e fundo */}
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

        <form onSubmit={handleSubmitInternal} className="grid gap-4 py-4">
          {/* Campos do Formulário */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="name" className="text-right col-span-1 text-foreground">
              Nome*
            </Label>
            <Input
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              className="col-span-3 bg-input border-input"
              required
              disabled={isLoading}
            />
          </div>
          <div className="grid grid-cols-4 items-start gap-4"> {/* items-start para textarea */}
            <Label htmlFor="description" className="text-right col-span-1 pt-2 text-foreground"> {/* pt-2 para alinhar */}
              Descrição
            </Label>
            <Textarea
              id="description"
              name="description"
              value={formData.description ?? ''}
              onChange={handleChange}
              placeholder="Descreva o objetivo desta campanha..."
              className="col-span-3 bg-input border-input min-h-[80px]" // Altura mínima
              disabled={isLoading}
            />
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="active" className="text-right col-span-1 text-foreground">
              Status
            </Label>
             <div className="col-span-3 flex items-center space-x-2">
               <Switch
                 id="active"
                 checked={formData.active}
                 onCheckedChange={handleSwitchChange}
                 disabled={isLoading}
               />
               <span className="text-sm text-muted-foreground">
                 {formData.active ? 'Ativa' : 'Inativa'}
               </span>
             </div>
           </div>

          {/* Campos de IA */}
          <h3 className="text-lg font-semibold mt-4 mb-2 col-span-4 text-foreground border-t border-border pt-4">Configuração da IA</h3>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="ai_prompt_product_name" className="text-right col-span-1 text-foreground">
              Produto/Serviço
            </Label>
            <Input
              id="ai_prompt_product_name" name="ai_prompt_product_name" placeholder="Ex: Consultoria de Marketing Digital"
              value={formData.ai_prompt_product_name ?? ''} onChange={handleChange}
              className="col-span-3 bg-input border-input" disabled={isLoading}
            />
          </div>
           <div className="grid grid-cols-4 items-center gap-4">
             <Label htmlFor="ai_prompt_target_audience" className="text-right col-span-1 text-foreground">
               Público-Alvo
             </Label>
             <Input
               id="ai_prompt_target_audience" name="ai_prompt_target_audience" placeholder="Ex: Pequenas empresas de e-commerce"
               value={formData.ai_prompt_target_audience ?? ''} onChange={handleChange}
               className="col-span-3 bg-input border-input" disabled={isLoading}
             />
           </div>
           <div className="grid grid-cols-4 items-start gap-4">
             <Label htmlFor="ai_prompt_pain_point" className="text-right col-span-1 pt-2 text-foreground">
               Dor Principal
             </Label>
             <Textarea
               id="ai_prompt_pain_point" name="ai_prompt_pain_point" placeholder="Ex: Dificuldade em gerar leads qualificados online"
               value={formData.ai_prompt_pain_point ?? ''} onChange={handleChange}
               className="col-span-3 bg-input border-input min-h-[60px]" disabled={isLoading}
             />
           </div>
           <div className="grid grid-cols-4 items-start gap-4">
             <Label htmlFor="ai_prompt_main_benefit" className="text-right col-span-1 pt-2 text-foreground">
               Benefício Principal
             </Label>
             <Textarea
               id="ai_prompt_main_benefit" name="ai_prompt_main_benefit" placeholder="Ex: Aumentar as vendas online em 30% em 3 meses"
               value={formData.ai_prompt_main_benefit ?? ''} onChange={handleChange}
               className="col-span-3 bg-input border-input min-h-[60px]" disabled={isLoading}
             />
           </div>
           <div className="grid grid-cols-4 items-center gap-4">
             <Label htmlFor="ai_prompt_tone_of_voice" className="text-right col-span-1 text-foreground">
               Tom de Voz
             </Label>
             <select
               id="ai_prompt_tone_of_voice" name="ai_prompt_tone_of_voice"
               value={formData.ai_prompt_tone_of_voice ?? 'Neutro'} onChange={handleChange}
               className="col-span-3 bg-input border-input p-2 rounded-md text-sm" disabled={isLoading}>
                 <option value="Formal">Formal</option>
                 <option value="Informal">Informal</option>
                 <option value="Amigável">Amigável</option>
                 <option value="Entusiasmado">Entusiasmado</option>
                 <option value="Neutro">Neutro</option>
                 <option value="Persuasivo">Persuasivo</option>
             </select>
           </div>
           <div className="grid grid-cols-4 items-start gap-4">
             <Label htmlFor="ai_prompt_extra_instructions" className="text-right col-span-1 pt-2 text-foreground">
               Instruções Extras
             </Label>
             <Textarea
               id="ai_prompt_extra_instructions" name="ai_prompt_extra_instructions" placeholder="Ex: Mencionar a promoção atual, não usar gírias..."
               value={formData.ai_prompt_extra_instructions ?? ''} onChange={handleChange}
               className="col-span-3 bg-input border-input min-h-[80px]" disabled={isLoading}
             />
           </div>
           <div className="grid grid-cols-4 items-center gap-4">
             <Label htmlFor="ai_prompt_cta_text" className="text-right col-span-1 text-foreground">
               Texto CTA
             </Label>
             <Input
               id="ai_prompt_cta_text" name="ai_prompt_cta_text" placeholder="Ex: Agende uma demonstração"
               value={formData.ai_prompt_cta_text ?? ''} onChange={handleChange}
               className="col-span-3 bg-input border-input" disabled={isLoading}
             />
           </div>
           <div className="grid grid-cols-4 items-center gap-4">
             <Label htmlFor="ai_prompt_cta_link" className="text-right col-span-1 text-foreground">
               Link CTA
             </Label>
             <Input
               id="ai_prompt_cta_link" name="ai_prompt_cta_link" type="url" placeholder="https://seu-site.com/demo"
               value={formData.ai_prompt_cta_link ?? ''} onChange={handleChange}
               className="col-span-3 bg-input border-input" disabled={isLoading}
             />
           </div>

          {/* Botões do Footer */}
           <DialogFooter className="col-span-4 mt-4 pt-4 border-t border-border"> {/* Span 4 colunas e margem */}
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