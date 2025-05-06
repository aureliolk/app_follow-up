'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { ScrollArea as DialogScrollArea } from "@/components/ui/scroll-area";
import { ArrowLeft, MessageSquareText, Loader2, XCircle } from 'lucide-react';
import { useWhatsappTemplates } from '@/context/whatsapp-template-context';
import type { WhatsappTemplate } from '@/lib/types/whatsapp';
import { toast } from 'react-hot-toast';

interface WhatsappTemplateDialogProps {
  onSendTemplate: (templateData: { name: string; language: string; variables: Record<string, string>; body: string }) => void;
  disabled?: boolean; // Para desabilitar o botão trigger
  isSendingTemplate?: boolean; // Exibe loading ao enviar o template
}

// Mock/Placeholder para tipo de Template (definir melhor depois ou importar de @/app/types)
// interface WhatsappTemplate {
//   id: string;
//   name: string;
//   language: string;
//   category: string;
//   body: string;
// }


export default function WhatsappTemplateDialog({ onSendTemplate, disabled, isSendingTemplate }: WhatsappTemplateDialogProps) {
  const { templates, loadingTemplates, templateError } = useWhatsappTemplates();

  // Estados internos do diálogo
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [selectedTemplateForEditing, setSelectedTemplateForEditing] = useState<WhatsappTemplate | null>(null);
  const [templateVariables, setTemplateVariables] = useState<string[]>([]);
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});

  // Função para extrair variáveis like {{1}}, {{2}}
  const extractVariables = (body: string): string[] => {
    const regex = /{{\d+}}/g;
    const matches = body.match(regex);
    if (!matches) {
      return [];
    }
    const variableNumbers = new Set(matches.map(match => match.replace(/{|}/g, '')));
    return Array.from(variableNumbers).sort((a, b) => parseInt(a) - parseInt(b));
  };

  // Função para lidar com a seleção de um template da lista
  const handleSelectTemplate = (template: WhatsappTemplate) => {
    const variables = extractVariables(template.body);
    if (variables.length > 0) {
      setSelectedTemplateForEditing(template);
      setTemplateVariables(variables);
      setVariableValues(variables.reduce((acc, curr) => {
        acc[curr] = '';
        return acc;
      }, {} as Record<string, string>));
      // Não fecha o diálogo
    } else {
      // Template sem variáveis, chama onSendTemplate diretamente e fecha
      onSendTemplate({ name: template.name, language: template.language, variables: {}, body: template.body });
      resetDialogState();
      setShowTemplateDialog(false);
    }
  };

  // Função para inserir o template após preencher variáveis
  const handleInsertTemplateWithVariables = async () => {
    if (!selectedTemplateForEditing) return;

    let allVariablesFilled = true;
    templateVariables.forEach(variableKey => {
      const value = variableValues[variableKey];
       if (!value || value.trim() === '') {
            allVariablesFilled = false;
       }
    });

    if (!allVariablesFilled) {
        toast.error('Por favor, preencha todas as variáveis do template.');
        return;
    }

    try {
      await onSendTemplate({
        name: selectedTemplateForEditing.name,
        language: selectedTemplateForEditing.language,
        variables: variableValues,
        body: selectedTemplateForEditing.body
      });
      setShowTemplateDialog(false);
      resetDialogState();
    } catch (error) {
      console.error('[WhatsappTemplateDialog] Error sending template:', error);
      // O contexto já exibirá toast de erro
    }
  };

  // Função para voltar da view de variáveis para a lista
  const handleBackToTemplateList = () => {
    resetDialogState();
  };

  // Função para atualizar o valor de uma variável
  const handleVariableChange = (variableKey: string, value: string) => {
    setVariableValues(prev => ({
      ...prev,
      [variableKey]: value,
    }));
  };

  // Função para resetar o estado interno do diálogo
  const resetDialogState = () => {
    setSelectedTemplateForEditing(null);
    setTemplateVariables([]);
    setVariableValues({});
  };

  return (
    <Dialog open={showTemplateDialog} onOpenChange={(open) => {
      setShowTemplateDialog(open);
      if (!open) {
        resetDialogState(); // Reseta ao fechar
      }
    }}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Inserir template" title="Inserir Template WhatsApp" disabled={disabled}>
          <MessageSquareText className="h-5 w-5 text-muted-foreground" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[625px] h-[70vh] flex flex-col">
        <DialogHeader>
          {selectedTemplateForEditing ? (
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={handleBackToTemplateList} className="-ml-2" disabled={isSendingTemplate}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <DialogTitle>Preencher Variáveis: {selectedTemplateForEditing.name}</DialogTitle>
            </div>
          ) : (
            <DialogTitle>Selecionar Template WhatsApp</DialogTitle>
          )}
          <DialogDescription>
            {selectedTemplateForEditing ? "Preencha os valores para as variáveis do template." : "Escolha um template aprovado para inserir na conversa."}
          </DialogDescription>
        </DialogHeader>

        {/* Conteúdo Condicional */}
        {selectedTemplateForEditing ? (
          // VIEW: Preencher Variáveis
          <div className="flex-1 flex flex-col gap-4 overflow-hidden">
            <div className="p-3 border rounded-md bg-muted/50">
              <p className="text-sm font-medium mb-1">Preview:</p>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{selectedTemplateForEditing.body}</p>
            </div>
            <DialogScrollArea className="flex-1 pr-4">
              <div className="space-y-4">
                {templateVariables.map((variableKey) => (
                  <div key={variableKey} className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor={`var-${variableKey}`} className="text-right">
                      Variável {'{'}{variableKey}{'}}'}
                    </Label>
                    <Input
                      id={`var-${variableKey}`}
                      value={variableValues[variableKey] || ''}
                      onChange={(e) => handleVariableChange(variableKey, e.target.value)}
                      className="col-span-3"
                      placeholder={`Valor para {{${variableKey}}}`}
                      disabled={isSendingTemplate}
                    />
                  </div>
                ))}
              </div>
            </DialogScrollArea>
            <DialogFooter className="mt-auto pt-4 border-t">
              <Button
                onClick={handleInsertTemplateWithVariables}
                disabled={isSendingTemplate}
              >
                {isSendingTemplate ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Enviar Template'
                )}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          // VIEW: Lista de Templates
          <div className="flex-1 flex flex-col overflow-hidden">
            {loadingTemplates ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <span className="ml-2 text-muted-foreground">Carregando templates...</span>
              </div>
            ) : templateError ? (
              <div className="flex-1 flex items-center justify-center text-destructive p-4 text-center">
                <XCircle className="h-5 w-5 mr-2 flex-shrink-0" /> {templateError}
              </div>
            ) : !templates || templates.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                Nenhum template encontrado para este workspace.
              </div>
            ) : (
              <DialogScrollArea className="flex-1 -mx-6 px-6">
                <div className="space-y-3">
                  {templates.map((template) => (
                    <div
                      key={template.id}
                      className="border rounded-md p-4 hover:bg-accent cursor-pointer transition-colors"
                      onClick={() => handleSelectTemplate(template)}
                    >
                      <p className="font-semibold text-sm">{template.name}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {template.category} - {template.language}
                      </p>
                      <p className="text-sm mt-2 whitespace-pre-wrap text-muted-foreground line-clamp-3">
                        {template.body}
                      </p>
                    </div>
                  ))}
                </div>
              </DialogScrollArea>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
} 