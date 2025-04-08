// app/workspace/[slug]/campaigns/new/components/CampaignForm.tsx
'use client';

import { useState } from 'react';
import * as XLSX from 'xlsx'; // Importa a biblioteca para ler arquivos Excel/CSV
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'react-hot-toast'; // Para notificações
import { Loader2, UploadCloud, XCircle } from 'lucide-react'; // Ícones
import { Switch } from "@/components/ui/switch"; // Importar Switch
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"; // Importar Select para Categoria
// Importe a Server Action (será criada no próximo passo)
import { createCampaignAction } from '@/lib/actions/campaignActions';

interface CampaignFormProps {
  workspaceId: string;
}

// Interface para representar um contato extraído do arquivo
interface Contact {
  identifier: string;
  name?: string; // Nome agora é opcional
}

const daysOfWeek = [
  { id: 1, label: 'Segunda' },
  { id: 2, label: 'Terça' },
  { id: 3, label: 'Quarta' },
  { id: 4, label: 'Quinta' },
  { id: 5, label: 'Sexta' },
  { id: 6, label: 'Sábado' },
  { id: 0, label: 'Domingo' }, // Usando 0 para Domingo (padrão Date.getDay())
];

export default function CampaignForm({ workspaceId }: CampaignFormProps) {
  const [campaignName, setCampaignName] = useState('');
  const [message, setMessage] = useState('');
  const [intervalSeconds, setIntervalSeconds] = useState<number>(60); // Padrão 1 minuto
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('18:00');
  const [allowedDays, setAllowedDays] = useState<number[]>([1, 2, 3, 4, 5]); // Padrão Seg-Sex
  const [contacts, setContacts] = useState<Contact[]>([]); // Mudar estado para armazenar objetos Contact
  const [isTemplate, setIsTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateCategory, setTemplateCategory] = useState('UTILITY'); // Categoria padrão
  const [fileName, setFileName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const handleDayChange = (dayId: number) => {
    setAllowedDays((prevDays) =>
      prevDays.includes(dayId)
        ? prevDays.filter((d) => d !== dayId)
        : [...prevDays, dayId]
    );
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      resetFileData();
      return;
    }

    // Validar tipo de arquivo (opcional mas recomendado)
    if (!file.type.match(/spreadsheetml|excel|csv/)) {
       setFileError('Tipo de arquivo inválido. Envie apenas arquivos Excel (.xlsx, .xls) ou CSV (.csv).');
       resetFileData();
       event.target.value = ''; // Limpa o input
       return;
    }

    setFileName(file.name);
    setFileError(null);
    setIsLoading(true); // Mostra loading durante o parse

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        // Converte para JSON - header: 1 assume a primeira linha como cabeçalho (ignorado aqui)
        // defval: '' garante que células vazias virem strings vazias
        const jsonData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

        // Extrai contatos (identifier da coluna 0, name da coluna 1)
        const extractedContacts: Contact[] = jsonData
          .slice(1) // Pula a linha de cabeçalho
          .map(row => ({
              identifier: String(row[0]).trim(), // Coluna 0: Telefone/ID
              name: String(row[1] || '').trim() || undefined // Coluna 1: Nome (opcional)
          }))
          .filter(contact => contact.identifier !== ''); // Remove linhas sem identificador

        if (extractedContacts.length === 0) {
           setFileError('Nenhum contato encontrado na primeira coluna do arquivo.');
           resetFileData();
           return;
        }

        setContacts(extractedContacts);
        toast.success(`${extractedContacts.length} contatos carregados de ${file.name}`);

      } catch (err) {
        console.error("Erro ao processar o arquivo:", err);
        setFileError('Erro ao ler o arquivo. Verifique o formato e tente novamente.');
        resetFileData();
      } finally {
        setIsLoading(false);
      }
    };

    reader.onerror = (err) => {
        console.error("Erro no FileReader:", err);
        setFileError('Não foi possível ler o arquivo.');
        resetFileData();
        setIsLoading(false);
    }

    reader.readAsBinaryString(file);
    event.target.value = ''; // Permite re-upload do mesmo arquivo
  };

  const resetFileData = () => {
      setFileName(null);
      setContacts([]); // Limpa o array de objetos
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    // Validações básicas
    if (!campaignName.trim()) {
      setFormError('O nome da campanha é obrigatório.');
      return;
    }
    if (!message.trim()) {
      setFormError('A mensagem é obrigatória.');
      return;
    }
    if (intervalSeconds <= 0) {
        setFormError('O intervalo entre mensagens deve ser maior que zero.');
        return;
    }
    if (allowedDays.length === 0) {
        setFormError('Selecione pelo menos um dia da semana para envio.');
        return;
    }
    if (contacts.length === 0) {
      setFormError('Carregue um arquivo com a lista de contatos.');
      return;
    }

    setIsLoading(true);
    toast.loading('Criando campanha...', { id: 'create-campaign' });

    try {
        // --- CHAMADA DA SERVER ACTION ---
        // Converta allowedDays para string ou JSON, conforme definido no schema/action
        const allowedDaysString = JSON.stringify(allowedDays.sort());

        console.log("Dados para Action:", {
            workspaceId,
            name: campaignName,
            message,
            contacts, // Array de objetos { identifier, name }
            sendIntervalSeconds: intervalSeconds,
            allowedSendStartTime: startTime,
            allowedSendEndTime: endTime,
            allowedSendDays: allowedDaysString, // String JSON
            isTemplate: isTemplate,
            templateName: isTemplate ? templateName : undefined,
            templateCategory: isTemplate ? templateCategory : undefined,
        });

        // Descomente quando a action existir
        
        const result = await createCampaignAction({
            workspaceId,
            name: campaignName,
            message,
            contacts, // Passa o array de objetos { identifier, name }
            sendIntervalSeconds: intervalSeconds,
            allowedSendStartTime: startTime,
            allowedSendEndTime: endTime,
            allowedSendDays: allowedDaysString, // Envia como string JSON
            isTemplate: isTemplate,
            templateName: isTemplate ? templateName : undefined,
            templateCategory: isTemplate ? templateCategory : undefined,
        });

        if (result?.success) {
            toast.success('Campanha criada e agendada com sucesso!', { id: 'create-campaign' });
            // Opcional: Limpar formulário ou redirecionar
            setCampaignName('');
            setMessage('');
            setContacts([]); // Limpa o array de objetos
            setFileName(null);
            // Resetar outros campos se desejar
        } else {
            throw new Error(result?.error || 'Falha ao criar campanha.');
        }
        
       // Simulação de sucesso (remover depois)
       await new Promise(resolve => setTimeout(resolve, 1500));
       toast.success('Simulação: Campanha criada!', { id: 'create-campaign' });
       // Fim da simulação

    } catch (error: any) {
      console.error("Erro ao criar campanha:", error);
      const errorMessage = error.message || 'Ocorreu um erro inesperado.';
      setFormError(errorMessage);
      toast.error(`Erro: ${errorMessage}`, { id: 'create-campaign' });
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

      {/* Seção 1: Detalhes da Campanha */}
      <Card>
        <CardHeader>
          <CardTitle>Detalhes da Campanha</CardTitle>
          <CardDescription>Defina o nome e a mensagem principal.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="campaignName">Nome da Campanha</Label>
            <Input
              id="campaignName"
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
              placeholder="Ex: Campanha Boas Vindas - Q1"
              required
              disabled={isLoading}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="message">Mensagem</Label>
            <Textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Digite a mensagem que será enviada aos contatos..."
              rows={5}
              required
              disabled={isLoading}
            />
            <p className="text-xs text-muted-foreground">
              {isTemplate 
                ? "Este é o conteúdo base do template (ex: com {{1}}, {{2}}). O nome exato e categoria são definidos abaixo."
                : "Esta mensagem será enviada como texto livre."
              }
            </p>
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
                   O arquivo deve ter os números de telefone (ou identificadores) na primeira coluna. A primeira linha pode ser um cabeçalho (será ignorada).
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
                    <Button variant="ghost" size="sm" onClick={resetFileData} disabled={isLoading}>
                        <XCircle className="h-4 w-4" />
                    </Button>
                 </div>
            )}
        </CardContent>
      </Card>

      {/* Seção 3: Agendamento */}
       <Card>
        <CardHeader>
          <CardTitle>Agendamento e Intervalo</CardTitle>
          <CardDescription>Controle quando e com que frequência as mensagens serão enviadas.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="grid gap-2">
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
                     <p className="text-xs text-muted-foreground">Tempo mínimo entre envios. Ex: 60 para 1 minuto.</p>
                 </div>
                 <div className="grid gap-2">
                    <Label htmlFor="startTime">Horário de Início</Label>
                    <Input
                        id="startTime"
                        type="time"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        disabled={isLoading}
                        required
                     />
                 </div>
                 <div className="grid gap-2">
                    <Label htmlFor="endTime">Horário de Fim</Label>
                    <Input
                        id="endTime"
                        type="time"
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        disabled={isLoading}
                        required
                     />
                 </div>
            </div>
             <div className="grid gap-2">
                 <Label>Dias da Semana Permitidos</Label>
                 <div className="flex flex-wrap gap-4">
                     {daysOfWeek.map((day) => (
                        <div key={day.id} className="flex items-center space-x-2">
                            <Checkbox
                                id={`day-${day.id}`}
                                checked={allowedDays.includes(day.id)}
                                onCheckedChange={() => handleDayChange(day.id)}
                                disabled={isLoading}
                            />
                            <Label htmlFor={`day-${day.id}`} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                {day.label}
                            </Label>
                        </div>
                    ))}
                 </div>
            </div>
        </CardContent>
      </Card>

      {/* Seção 4: Template HSM */}
      <Card>
        <CardHeader>
          <CardTitle>Template HSM</CardTitle>
          <CardDescription>Defina o template HSM aprovado.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="isTemplateSwitch" className="flex flex-col space-y-1">
                <span>Usar Template HSM Aprovado?</span>
                <span className="font-normal leading-snug text-muted-foreground">
                    Se ativado, você precisará fornecer o nome e categoria exatos do template aprovado no WhatsApp.
                </span>
            </Label>
            <Switch
                id="isTemplateSwitch"
                checked={isTemplate}
                onCheckedChange={setIsTemplate}
                disabled={isLoading}
            />
         </div>

          {isTemplate && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t">
                <div className="grid gap-2">
                    <Label htmlFor="templateName">Nome Exato do Template</Label>
                    <Input
                        id="templateName"
                        value={templateName}
                        onChange={(e) => setTemplateName(e.target.value)}
                        placeholder="Ex: boas_vindas_cliente_v2"
                        required={isTemplate} // Obrigatório apenas se for template
                        disabled={isLoading}
                    />
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="templateCategory">Categoria do Template</Label>
                    <Select
                        value={templateCategory}
                        onValueChange={setTemplateCategory}
                        disabled={isLoading}
                    >
                        <SelectTrigger id="templateCategory">
                            <SelectValue placeholder="Selecione a categoria" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="UTILITY">Utilitário (Utility)</SelectItem>
                            <SelectItem value="MARKETING">Marketing</SelectItem>
                            <SelectItem value="AUTHENTICATION">Autenticação (Authentication)</SelectItem>
                            {/* Adicione outras categorias se necessário */} 
                        </SelectContent>
                    </Select>
                     <p className="text-xs text-muted-foreground">
                        Selecione a mesma categoria aprovada no WhatsApp.
                     </p>
                </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Footer com Botão */}
      <div className="flex justify-end pt-4">
         <Button type="submit" disabled={isLoading || contacts.length === 0}>
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