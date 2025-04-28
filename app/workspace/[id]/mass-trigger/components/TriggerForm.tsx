// app/workspace/[slug]/triggers/new/components/TriggerForm.tsx
'use client';

import { useState, useEffect } from 'react';
import * as XLSX from 'xlsx'; // Importa a biblioteca para ler arquivos Excel/CSV
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
// import { Checkbox } from "@/components/ui/checkbox"; // removido
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'react-hot-toast'; // Para notificações
import { Loader2, UploadCloud, XCircle, AlertTriangle } from 'lucide-react'; // Ícones
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"; // Importar Select para Categoria
// Importe a Server Action (será criada no próximo passo)
import { createTriggerAction } from '@/lib/actions/triggerActions';
// <<< Importar hook e tipo de template >>>
import { useWhatsappTemplates } from '@/context/whatsapp-template-context';
import type { WhatsappTemplate } from '@/lib/types/whatsapp';

// <<< DEFINIR PROPS >>>
interface TriggerFormProps {
  workspaceId: string;
}

// Interface para representar um contato extraído do arquivo
interface Contact {
  identifier: string;
  name?: string; // Nome agora é opcional
  variables?: Record<string, string>; // Variáveis do template para este contato
}


// <<< USAR PROPS >>>
export default function TriggerForm({ workspaceId }: TriggerFormProps) {
  const [triggerName, setTriggerName] = useState('');
  const [selectedTemplateName, setSelectedTemplateName] = useState<string>('');
  const [selectedTemplateBody, setSelectedTemplateBody] = useState<string>('');
  const [selectedTemplateLanguage, setSelectedTemplateLanguage] = useState<string>('');
  const [intervalSeconds, setIntervalSeconds] = useState<number>(60); // Padrão 1 minuto
  // const [startTime, setStartTime] = useState('09:00'); // removido
  // const [endTime, setEndTime] = useState('18:00'); // removido
  // const [allowedDays, setAllowedDays] = useState<number[]>([1, 2, 3, 4, 5]); // removido
  const [contacts, setContacts] = useState<Contact[]>([]); // Mudar estado para armazenar objetos Contact
  const [fileName, setFileName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const { templates, loadingTemplates, templateError, fetchTemplatesForWorkspace } = useWhatsappTemplates();

  // const handleDayChange = (dayId: number) => {}; // removido

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

        // Remove a primeira linha (cabeçalho) se ela existir e não estiver vazia
        if (json.length > 0 && json[0].some(cell => String(cell).trim() !== '')) {
            json.shift();
        }

        const parsedContacts: Contact[] = json
            .map((row, rowIndex) => {
                if (!row || row.length === 0) {
                    console.warn(`Linha ${rowIndex + 2} vazia, ignorando.`);
                    return null; // Ignora linhas completamente vazias
                }
                const identifier = String(row[0] || '').trim();
                if (!identifier) {
                    console.warn(`Linha ${rowIndex + 2} sem identificador (coluna 1), ignorando.`);
                    return null; // Ignora linhas sem identificador
                }

                const name = String(row[1] || '').trim() || undefined;

                // Extrai variáveis das colunas a partir da terceira (índice 2)
                const variables: Record<string, string> = {};
                for (let i = 2; i < row.length; i++) {
                    const varKey = String(i - 1); // Chave "1" para coluna 2, "2" para coluna 3, etc.
                    const varValue = String(row[i] || '').trim();
                    if (varValue) { // Só adiciona se tiver valor
                         variables[varKey] = varValue;
                    }
                }

                return {
                    identifier,
                    name,
                    variables: Object.keys(variables).length > 0 ? variables : undefined // Só inclui o objeto se houver variáveis
                };
            })
            .filter(Boolean); // Remove nulos (linhas ignoradas)

        if (parsedContacts.length === 0) {
            setFileError('Nenhum contato válido encontrado no arquivo.');
            toast.error('Nenhum contato válido encontrado.', { id: 'file-processing' });
            setContacts([]);
        } else {
            // Se template selecionado, validar colunas de variáveis
            if (selectedTemplateBody) {
                const matches = Array.from(
                    selectedTemplateBody.matchAll(/{{\s*(\d+)\s*}}/g)
                ).map(m => Number(m[1]));
                const uniqueIndices = Array.from(new Set(matches));
                if (uniqueIndices.length > 0) {
                    const missing = uniqueIndices.filter(i =>
                        !parsedContacts.every(c => c.variables && i in c.variables)
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
        // Reset o input de arquivo para permitir carregar o mesmo arquivo novamente
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

  const handleTemplateChange = (templateName: string) => {
      setSelectedTemplateName(templateName);
      const selected = templates.find(t => t.name === templateName);
      setSelectedTemplateBody(selected?.body || '');
      setSelectedTemplateLanguage(selected?.language || '');
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    // Validações básicas
    if (!triggerName.trim()) {
      setFormError('O nome do trigger é obrigatório.');
      return;
    }
    if (!selectedTemplateName) {
        setFormError('Selecione um template do WhatsApp.');
        return;
    }
    if (intervalSeconds <= 0) {
        setFormError('O intervalo entre mensagens deve ser maior que zero.');
        return;
    }
    // validação de dias removida
    if (contacts.length === 0) {
      setFormError('Carregue um arquivo com a lista de contatos.');
      return;
    }

    setIsLoading(true);
    toast.loading('Criando trigger...', { id: 'create-trigger' });

    try {
        // const allowedDaysString = JSON.stringify(allowedDays.sort()); // removido

        // Chama a Server Action
        const result = await createTriggerAction(workspaceId, {
            name: triggerName,
            message: selectedTemplateBody,
            contacts,
            sendIntervalSeconds: intervalSeconds,
            isTemplate: true,
            templateName: selectedTemplateName,
            templateLanguage: selectedTemplateLanguage,
        });

        if (result.success) {
            toast.success(`Trigger '${triggerName}' criado com sucesso! (ID: ${result.campaignId})`, { id: 'create-trigger' });
            // TODO: Limpar o formulário ou redirecionar o usuário?
            // Exemplo de limpar (pode ser ajustado):
            // setTriggerName('');
            // setSelectedTemplateName('');
            // setSelectedTemplateBody('');
            // setSelectedTemplateLanguage('');
            // setIntervalSeconds(60);
            // setStartTime('09:00');
            // setEndTime('18:00');
            // setAllowedDays([1, 2, 3, 4, 5]);
            // setContacts([]);
            // setFileName(null);
            // setFileError(null);
            // setFormError(null);
        } else {
            // Exibe o erro retornado pela Action
            setFormError(result.error || 'Falha ao criar o trigger.');
            toast.error(`Erro: ${result.error || 'Falha ao criar o trigger.'}`, { id: 'create-trigger' });
        }

    } catch (error: any) {
      console.error("Erro inesperado no formulário ao criar trigger:", error);
      const errorMessage = error.message || 'Ocorreu um erro inesperado.';
      setFormError(errorMessage);
      toast.error(`Erro: ${errorMessage}`, { id: 'create-trigger' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
       {formError && (
            <div className="bg-destructive/10 border border-destructive text-destructive p-3 rounded-md text-sm">
                {formError}
            </div>
        )}

      {/* Seção 1: Detalhes do Trigger */}
      <Card>
        <CardHeader>
          <CardTitle>Detalhes do Trigger</CardTitle>
          <CardDescription>Defina o nome e selecione o template do WhatsApp para o disparo.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="triggerName">Nome do Trigger</Label>
            <Input
              id="triggerName"
              value={triggerName}
              onChange={(e) => setTriggerName(e.target.value)}
              placeholder="Ex: Disparo Boas Vindas - Q1"
              required
              disabled={isLoading}
            />
          </div>
          <div className="grid gap-2">
             <Label htmlFor="templateSelect">Template do WhatsApp</Label>
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
             <Select
                 value={selectedTemplateName}
                 onValueChange={handleTemplateChange}
                 disabled={isLoading || loadingTemplates || !!templateError || templates.length === 0}
                 required
             >
                 <SelectTrigger id="templateSelect">
                     <SelectValue placeholder={loadingTemplates ? "Carregando..." : "Selecione um template"} />
                 </SelectTrigger>
                 <SelectContent>
                    {templates.length === 0 && !loadingTemplates && <SelectItem value="" disabled>Nenhum template encontrado</SelectItem>}
                     {templates.map((template) => (
                         <SelectItem key={template.name} value={template.name}>
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
        </CardContent>
      </Card>

      {/* Seção 2: Lista de Contatos */}
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
                    disabled={isLoading}
                    className="file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
                 />
                 <p className="text-xs text-muted-foreground">
                   Formato esperado: Coluna 1: Telefone/ID. Coluna 2: Nome (opcional).
                   <br/>
                   Colunas 3, 4, 5... (opcionais): Valores para as variáveis do template {'{{1}}'}, {'{{2}}'}, {'{{3}}'}...
                   <br/>
                   A primeira linha pode ser um cabeçalho (será ignorada).
                </p>
            </div>
            {fileError && (
                 <div className="flex items-center space-x-2 text-sm text-destructive">
                    <XCircle className="h-4 w-4" />
                    <span>{fileError}</span>
                </div>
            )}
            {fileName && !fileError && (
                 <div className="flex items-center justify-between space-x-2 text-sm text-muted-foreground border p-3 rounded-md">
                    <span className="truncate flex-1">Arquivo carregado: <strong>{fileName}</strong></span>
                    <span className="flex-shrink-0 bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs font-medium">
                        {contacts.length} contatos
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => { setFileName(null); setContacts([]); setFileError(null); }} disabled={isLoading}>
                        <XCircle className="h-4 w-4" />
                    </Button>
                 </div>
            )}
        </CardContent>
      </Card>

      {/* Seção 3: Intervalo entre Envios */}
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

      {/* Footer com Botão */}
      <div className="flex justify-end pt-4">
         <Button type="submit" disabled={isLoading || contacts.length === 0 || !selectedTemplateName}>
            {isLoading ? (
                <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                     Criando Trigger...
                </>
             ) : (
                 'Criar e Agendar Trigger'
             )}
         </Button>
      </div>
    </form>
  );
}