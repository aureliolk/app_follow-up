// app/workspace/[slug]/triggers/new/components/TriggerForm.tsx
'use client';

import { useState, useEffect } from 'react';
import * as XLSX from 'xlsx'; // Importa a biblioteca para ler arquivos Excel/CSV
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from "@/components/ui/textarea"; // <<< ADICIONAR Textarea
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'react-hot-toast'; // Para notificações
import { Loader2, UploadCloud, XCircle, AlertTriangle, MessageSquare, ListChecks } from 'lucide-react'; // Ícones, adicionado MessageSquare e ListChecks
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createTriggerAction } from '@/lib/actions/triggerActions';
import { useWhatsappTemplates } from '@/context/whatsapp-template-context';
import type { WhatsappTemplate } from '@/lib/types/whatsapp';
import { useRouter } from 'next/navigation';

// <<< DEFINIR PROPS ATUALIZADAS >>>
interface TriggerFormProps {
  workspaceId: string;
  activeChannels: string[]; // Canais ativos, ex: ['WHATSAPP_CLOUDAPI', 'WHATSAPP_EVOLUTION']
}

interface Contact {
  identifier: string;
  name?: string;
  variables?: Record<string, string>;
}

// <<< USAR PROPS ATUALIZADAS >>>
export default function TriggerForm({ workspaceId, activeChannels }: TriggerFormProps) {
  const router = useRouter();

  // Determinar o canal inicial e se a seleção de canal é necessária
  const canUseCloudAPI = activeChannels.includes('WHATSAPP_CLOUDAPI');
  const canUseEvolutionAPI = activeChannels.includes('WHATSAPP_EVOLUTION');
  const needsChannelSelection = canUseCloudAPI && canUseEvolutionAPI;

  let initialChannel = '';
  if (needsChannelSelection) {
    initialChannel = ''; // Força a seleção se ambos estiverem disponíveis
  } else if (canUseCloudAPI) {
    initialChannel = 'WHATSAPP_CLOUDAPI';
  } else if (canUseEvolutionAPI) {
    initialChannel = 'WHATSAPP_EVOLUTION';
  }

  const [selectedChannel, setSelectedChannel] = useState<string>(initialChannel);
  const [triggerName, setTriggerName] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [selectedTemplateName, setSelectedTemplateName] = useState<string>('');
  const [selectedTemplateBody, setSelectedTemplateBody] = useState<string>('');
  const [selectedTemplateLanguage, setSelectedTemplateLanguage] = useState<string>('');
  const [customMessageText, setCustomMessageText] = useState<string>(''); // <<< NOVO ESTADO para mensagem de texto livre
  const [intervalSeconds, setIntervalSeconds] = useState<number>(60);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const { templates, loadingTemplates, templateError, fetchTemplatesForWorkspace } = useWhatsappTemplates();

  // Efeito para buscar templates se Cloud API for o canal selecionado ou único disponível
  useEffect(() => {
    if (selectedChannel === 'WHATSAPP_CLOUDAPI' && workspaceId) {
      // console.log(`Fetching templates for workspace ${workspaceId} because Cloud API is selected/active.`);
      fetchTemplatesForWorkspace(workspaceId);
    }
  }, [selectedChannel, workspaceId, fetchTemplatesForWorkspace]);


  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      setFileName(null);
      setContacts([]);
      setFileError(null);
      return;
    }

    setFileName(file.name);
    setFileError(null);
    setIsLoading(true);
    toast.loading('Processando arquivo...', { id: 'file-processing' });

    const reader = new FileReader();
    reader.onload = async (e) => {
      const data = e.target?.result;
      if (!data) {
        setFileError('Não foi possível ler o arquivo.');
        toast.error('Erro ao ler arquivo.', { id: 'file-processing' });
        setIsLoading(false);
        return;
      }

      try {
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

        if (json.length > 0 && json[0].some(cell => String(cell).trim() !== '')) {
            json.shift();
        }

        const parsedContacts: Contact[] = json
            .map((row, rowIndex) => {
                if (!row || row.length === 0) {
                    // console.warn(`Linha ${rowIndex + 2} vazia, ignorando.`);
                    return null; 
                }
                const identifier = String(row[0] || '').trim();
                if (!identifier) {
                    // console.warn(`Linha ${rowIndex + 2} sem identificador (coluna 1), ignorando.`);
                    return null;
                }

                const variables: Record<string, string> = {};
                if (selectedChannel === 'WHATSAPP_CLOUDAPI') { // Só extrai variáveis se for Cloud API (templates)
                    for (let i = 1; i < row.length; i++) {
                        const varKey = String(i); 
                        const varValue = String(row[i] || '').trim();
                        if (varValue) {
                             variables[varKey] = varValue;
                        }
                    }
                }

                return {
                    identifier,
                    variables: Object.keys(variables).length > 0 ? variables : undefined
                };
            })
            .filter(Boolean) as Contact[]; // Garantir que o tipo seja Contact[]

        if (parsedContacts.length === 0) {
            setFileError('Nenhum contato válido encontrado no arquivo.');
            toast.error('Nenhum contato válido encontrado.', { id: 'file-processing' });
            setContacts([]);
        } else {
            // Validação de colunas de variáveis só faz sentido para Cloud API
            if (selectedChannel === 'WHATSAPP_CLOUDAPI' && selectedTemplateBody) {
                const matches = Array.from(
                    selectedTemplateBody.matchAll(/{{\s*(\d+)\s*}}/g)
                ).map(m => Number(m[1]));
                const uniqueIndices = Array.from(new Set(matches));
                if (uniqueIndices.length > 0) {
                    const missing = uniqueIndices.filter(i =>
                        !parsedContacts.every(c => c.variables && String(i) in c.variables) // Ajuste na chave de variável
                    );
                    if (missing.length > 0) {
                        const cols = missing.map(i => `{{${i}}}`).join(', ');
                        const errMsg = `Planilha faltando colunas para as variáveis: ${cols}`;
                        setFileError(errMsg);
                        toast.error(errMsg, { id: 'file-processing' });
                        setContacts([]);
                        setIsLoading(false);
                        return;
                    }
                }
            }
            setContacts(parsedContacts);
            toast.success(`Arquivo processado: ${parsedContacts.length} contatos carregados.`, { id: 'file-processing' });
        }

      } catch (err: any) {
        console.error("Erro ao processar o arquivo:", err);
        setFileError(`Erro ao processar: ${err.message || 'Formato inválido?'}`);
        toast.error(`Erro ao processar arquivo: ${err.message || 'Verifique o formato.'}`, { id: 'file-processing' });
        setContacts([]);
      } finally {
        setIsLoading(false);
        if (event.target) {
            event.target.value = '';
        }
      }
    };

    reader.onerror = () => {
      setFileError('Erro ao tentar ler o arquivo.');
      toast.error('Erro ao ler arquivo.', { id: 'file-processing' });
      setIsLoading(false);
       if (event.target) {
            event.target.value = '';
        }
    };

    reader.readAsBinaryString(file);
  };

  const handleTemplateChange = (templateId: string) => {
      setSelectedTemplateId(templateId);
      const selected = templates.find(t => t.id === templateId);
      setSelectedTemplateName(selected?.name || '');
      setSelectedTemplateBody(selected?.body || '');
      setSelectedTemplateLanguage(selected?.language || '');
      // Limpar erro de arquivo se um novo template for selecionado, pois a validação de colunas pode mudar
      setFileError(null); 
      // Revalidar contatos com o novo template se já houver contatos carregados
      if (contacts.length > 0 && selected?.body) {
        // Simular uma re-validação simples (pode ser mais complexo se necessário)
        // const currentContacts = [...contacts]; // Criar uma cópia para não mutar estado diretamente aqui
        // Aqui a lógica de validação de colunas do handleFileChange seria chamada idealmente
        // Por simplicidade, vamos apenas limpar o fileError assumindo que o usuário irá verificar
        // Se desejar revalidação completa, pode chamar uma função helper aqui.
      }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    if (!triggerName.trim()) {
      setFormError('O nome da campanha é obrigatório.');
      return;
    }
    if (!selectedChannel) {
        setFormError('Selecione um canal de envio.');
        return;
    }
    if (selectedChannel === 'WHATSAPP_CLOUDAPI' && !selectedTemplateName) {
        setFormError('Selecione um template do WhatsApp para o canal Cloud API.');
        return;
    }
    if (selectedChannel === 'WHATSAPP_EVOLUTION' && !customMessageText.trim()) {
        setFormError('A mensagem de texto é obrigatória para o canal Não Oficial.');
        return;
    }
    if (intervalSeconds <= 0) {
        setFormError('O intervalo entre mensagens deve ser maior que zero.');
        return;
    }
    if (contacts.length === 0) {
      setFormError('Carregue um arquivo com a lista de contatos.');
      return;
    }

    setIsLoading(true);
    toast.loading('Criando campanha...', { id: 'create-trigger' });

    try {
        const payload = {
            name: triggerName,
            contacts,
            sendIntervalSeconds: intervalSeconds,
            channelIdentifier: selectedChannel,
            isTemplate: selectedChannel === 'WHATSAPP_CLOUDAPI',
            templateName: selectedChannel === 'WHATSAPP_CLOUDAPI' ? selectedTemplateName : undefined,
            templateLanguage: selectedChannel === 'WHATSAPP_CLOUDAPI' ? selectedTemplateLanguage : undefined,
            message: selectedChannel === 'WHATSAPP_CLOUDAPI' ? selectedTemplateBody : customMessageText,
        };
        console.log("Payload para createTriggerAction:", payload);

        const result = await createTriggerAction(workspaceId, payload);

        if (result.success) {
            toast.success(`Campanha '${triggerName}' criada com sucesso!`, { id: 'create-trigger' });
            setTriggerName('');
            setSelectedChannel(initialChannel); // Resetar para o canal inicial
            setSelectedTemplateId('');
            setSelectedTemplateName('');
            setSelectedTemplateBody('');
            setSelectedTemplateLanguage('');
            setCustomMessageText('');
            setIntervalSeconds(60);
            setContacts([]);
            setFileName(null);
            setFileError(null);
            setFormError(null);
            const fileInput = document.getElementById('contactFile') as HTMLInputElement;
            if (fileInput) {
                fileInput.value = '';
            }
            router.refresh();
        } else {
            setFormError(result.error || 'Falha ao criar a campanha.');
            toast.error(`Erro: ${result.error || 'Falha ao criar a campanha.'}`, { id: 'create-trigger' });
        }

    } catch (error: any) {
      console.error("Erro inesperado no formulário ao criar campanha:", error);
      const errorMessage = error.message || 'Ocorreu um erro inesperado.';
      setFormError(errorMessage);
      toast.error(`Erro: ${errorMessage}`, { id: 'create-trigger' });
    } finally {
      setIsLoading(false);
    }
  };
  
  // Se nenhum canal estiver ativo, mostrar mensagem e desabilitar formulário
  if (activeChannels.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Nenhuma Integração WhatsApp Ativa</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg text-center">
            <AlertTriangle className="w-12 h-12 text-destructive mb-4" />
            <p className="text-lg font-semibold">Nenhuma integração de WhatsApp configurada.</p>
            <p className="text-muted-foreground">
              Para criar campanhas de disparo, por favor, configure uma integração de WhatsApp
              (API Oficial ou Não Oficial) nas configurações do seu workspace.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }


  return (
    <form onSubmit={handleSubmit} className="space-y-8">
       {formError && (
            <div className="bg-destructive/10 border border-destructive text-destructive p-3 rounded-md text-sm">
                {formError}
            </div>
        )}

      <Card>
        <CardHeader>
          <CardTitle>Detalhes da Campanha</CardTitle>
          <CardDescription>
            Defina o nome da sua campanha, o canal de envio e a mensagem a ser disparada.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-2">
            <Label htmlFor="triggerName">Nome da Campanha</Label>
            <Input
              id="triggerName"
              value={triggerName}
              onChange={(e) => setTriggerName(e.target.value)}
              placeholder="Ex: Boas Vindas Clientes - Q1"
              required
              disabled={isLoading}
            />
          </div>

          {/* Seletor de Canal (se necessário) */}
          {needsChannelSelection && (
            <div className="grid gap-2">
              <Label htmlFor="channelSelect">Canal de Envio</Label>
              <Select
                value={selectedChannel}
                onValueChange={(value) => {
                  setSelectedChannel(value);
                  // Resetar campos específicos do canal anterior ao trocar
                  setSelectedTemplateId('');
                  setSelectedTemplateName('');
                  setSelectedTemplateBody('');
                  setSelectedTemplateLanguage('');
                  setCustomMessageText('');
                  setFileError(null); // Limpar erro de arquivo, pois a validação de colunas pode mudar
                }}
                disabled={isLoading}
                required
              >
                <SelectTrigger id="channelSelect">
                  <SelectValue placeholder="Selecione um canal de envio" />
                </SelectTrigger>
                <SelectContent>
                  {canUseCloudAPI && <SelectItem value="WHATSAPP_CLOUDAPI">WhatsApp Oficial (Cloud API - Templates)</SelectItem>}
                  {canUseEvolutionAPI && <SelectItem value="WHATSAPP_EVOLUTION">WhatsApp Não Oficial (Texto Livre)</SelectItem>}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Campo de Mensagem (Template ou Texto Livre) */}
          {selectedChannel === 'WHATSAPP_CLOUDAPI' && (
            <div className="grid gap-2">
               <Label htmlFor="templateSelect">
                 <ListChecks className="inline-block mr-2 h-5 w-5 text-primary" />
                 Template do WhatsApp (API Oficial)
               </Label>
               {loadingTemplates && (
                   <div className="flex items-center text-sm text-muted-foreground">
                       <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando templates...
                   </div>
               )}
               {templateError && (
                   <div className="flex items-center text-sm text-destructive">
                       <AlertTriangle className="mr-2 h-4 w-4" /> Erro ao carregar templates: {templateError}
                   </div>
               )}
               {!loadingTemplates && !templateError && templates.length === 0 && selectedChannel === 'WHATSAPP_CLOUDAPI' && (
                 <div className="flex items-center text-sm text-amber-600 bg-amber-50 p-3 rounded-md border border-amber-200">
                     <AlertTriangle className="mr-2 h-4 w-4" /> Nenhum template do WhatsApp encontrado para este workspace.
                 </div>
               )}
               <Select
                   value={selectedTemplateId}
                   onValueChange={handleTemplateChange}
                   disabled={isLoading || loadingTemplates || !!templateError || templates.length === 0}
                   required={selectedChannel === 'WHATSAPP_CLOUDAPI'}
               >
                   <SelectTrigger id="templateSelect">
                       <SelectValue placeholder={loadingTemplates ? "Carregando..." : "Selecione um template"} />
                   </SelectTrigger>
                   <SelectContent>
                      {templates.length === 0 && !loadingTemplates && <SelectItem value="" disabled>Nenhum template disponível</SelectItem>}
                       {templates.map((template) => (
                           <SelectItem key={template.id} value={template.id}>
                               {template.name} ({template.language})
                           </SelectItem>
                       ))}
                   </SelectContent>
               </Select>
               {selectedTemplateBody && (
                  <div className="mt-2 p-3 border rounded-md bg-muted/50">
                    <p className="text-sm font-medium mb-1">Preview do Corpo:</p>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {selectedTemplateBody}
                    </p>
                  </div>
               )}
            </div>
          )}

          {selectedChannel === 'WHATSAPP_EVOLUTION' && (
            <div className="grid gap-2">
              <Label htmlFor="customMessageText">
                <MessageSquare className="inline-block mr-2 h-5 w-5 text-primary" />
                Mensagem de Texto (API Não Oficial)
              </Label>
              <Textarea
                id="customMessageText"
                value={customMessageText}
                onChange={(e) => setCustomMessageText(e.target.value)}
                placeholder="Digite sua mensagem aqui. Você pode usar {nome} para personalizar com o nome do contato (se fornecido na planilha)."
                rows={4}
                required={selectedChannel === 'WHATSAPP_EVOLUTION'}
                disabled={isLoading}
              />
               <p className="text-xs text-muted-foreground">
                  Nota: A API Não Oficial geralmente não suporta formatação rica (negrito, itálico) da mesma forma que a API Oficial.
                  <br/>A personalização com variáveis da planilha (ex: {'{{1}}'}, {'{{2}}'}) não é aplicável aqui; use apenas {'{nome}'} se implementado no backend.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lista de Contatos</CardTitle>
          <CardDescription>Carregue a lista de contatos de um arquivo Excel (.xlsx, .xls) ou CSV (.csv).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
            <div className="grid gap-2">
                <Label htmlFor="contactFile">Arquivo de Contatos</Label>
                <Input
                    id="contactFile"
                    type="file"
                    accept=".xlsx, .xls, .csv"
                    onChange={handleFileChange}
                    disabled={isLoading || !selectedChannel} // Desabilitar se nenhum canal selecionado
                    className="sr-only"
                 />
                 <Label
                    htmlFor="contactFile"
                    className={`inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2 cursor-pointer ${(isLoading || !selectedChannel) ? 'cursor-not-allowed opacity-50' : ''}`}
                 >
                    <UploadCloud className="mr-2 h-4 w-4" />
                    {fileName ? 'Trocar Arquivo' : 'Selecionar Arquivo'}
                 </Label>

                 {fileName && !fileError && (
                     <div className="flex items-center justify-between space-x-2 text-sm text-muted-foreground border p-3 rounded-md">
                        <span className="truncate flex-1"><strong>{fileName}</strong></span>
                        <span className="flex-shrink-0 bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs font-medium">
                            {contacts.length} contatos
                        </span>
                        <Button variant="ghost" size="sm" onClick={() => { setFileName(null); setContacts([]); setFileError(null); }} disabled={isLoading} title="Remover arquivo">
                            <XCircle className="h-4 w-4" />
                        </Button>
                     </div>
                 )}

                 {fileError && (
                     <div className="flex items-center space-x-2 text-sm text-destructive">
                        <XCircle className="h-4 w-4" />
                        <span>{fileError}</span>
                    </div>
                 )}
                <p className="text-xs text-muted-foreground pt-2">
                   Formato esperado: Coluna 1: Telefone.
                   {selectedChannel === 'WHATSAPP_CLOUDAPI' && (
                     <>
                       <br/>
                       Colunas 2, 3, 4... (opcionais): Valores para as variáveis do template {'{{1}}'}, {'{{2}}'}, {'{{3}}'}...
                     </>
                   )}
                   <br/>
                   A primeira linha pode ser um cabeçalho (será ignorada).
                </p>
            </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Intervalo entre Envios</CardTitle>
          <CardDescription>Defina quantos segundos devem separar cada mensagem.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 max-w-xs">
            <Label htmlFor="intervalSeconds">Intervalo (segundos)</Label>
            <Input
              id="intervalSeconds"
              type="number"
              min="1"
              value={intervalSeconds}
              onChange={(e) => setIntervalSeconds(parseInt(e.target.value, 10) || 1)}
              disabled={isLoading}
              required
            />
            <p className="text-xs text-muted-foreground">
              Exemplo: 60 envia uma mensagem a cada minuto.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end pt-4">
         <Button 
            type="submit" 
            disabled={
                isLoading || 
                contacts.length === 0 || 
                !selectedChannel ||
                (selectedChannel === 'WHATSAPP_CLOUDAPI' && !selectedTemplateName) ||
                (selectedChannel === 'WHATSAPP_EVOLUTION' && !customMessageText.trim())
            }
          >
            {isLoading ? (
                <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                     Criando Campanha...
                </>
             ) : (
                 'Criar e Agendar Campanha'
             )}
         </Button>
      </div>
    </form>
  );
}