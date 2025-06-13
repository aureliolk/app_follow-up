'use client';

import React, { useState, useEffect } from 'react';
import { WhatsappServiceManageTemplate } from '@/lib/services/whatsappServiceManageTemplate';
import { WhatsappTemplate, WhatsappTemplateCategory, WhatsappTemplateComponent } from '@/lib/types/whatsapp';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Terminal } from 'lucide-react';

interface TemplatesPageProps {
  params: {
    id: string; // workspace ID
  };
}

const TemplatesPage: React.FC<TemplatesPageProps> = ({ params }) => {
  const { toast } = useToast();
  const whatsappService = new WhatsappServiceManageTemplate();

  const [templates, setTemplates] = useState<WhatsappTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateLanguage, setNewTemplateLanguage] = useState('en_US');
  const [newTemplateCategory, setNewTemplateCategory] = useState<WhatsappTemplateCategory>(WhatsappTemplateCategory.MARKETING);
  const [newTemplateBody, setNewTemplateBody] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    setLoading(true);
    setError(null);
    try {
      const fetchedTemplates = await whatsappService.getTemplates();
      setTemplates(fetchedTemplates);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch templates.');
      toast({
        title: 'Erro ao carregar templates',
        description: err.message || 'Não foi possível carregar os templates existentes.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const components: WhatsappTemplateComponent[] = [
      {
        type: 'BODY',
        text: newTemplateBody,
      },
    ];

    const templateData: WhatsappTemplate = {
      name: newTemplateName,
      language: newTemplateLanguage,
      category: newTemplateCategory,
      components: components,
    };

    try {
      await whatsappService.createTemplate(templateData);
      toast({
        title: 'Template Criado',
        description: 'O template foi submetido para aprovação.',
      });
      setNewTemplateName('');
      setNewTemplateBody('');
      fetchTemplates(); // Refresh the list
    } catch (err: any) {
      setError(err.message || 'Failed to create template.');
      toast({
        title: 'Erro ao criar template',
        description: err.message || 'Não foi possível criar o template.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteTemplate = async (templateName: string) => {
    if (!confirm(`Tem certeza que deseja deletar o template "${templateName}"?`)) {
      return;
    }
    try {
      await whatsappService.deleteTemplate(templateName);
      toast({
        title: 'Template Deletado',
        description: `O template "${templateName}" foi deletado com sucesso.`,
      });
      fetchTemplates(); // Refresh the list
    } catch (err: any) {
      setError(err.message || 'Failed to delete template.');
      toast({
        title: 'Erro ao deletar template',
        description: err.message || `Não foi possível deletar o template "${templateName}".`,
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6">Gerenciar Templates do WhatsApp</h1>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <Terminal className="h-4 w-4" />
          <AlertTitle>Erro!</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Criar Novo Template</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateTemplate} className="space-y-4">
            <div>
              <Label htmlFor="templateName">Nome do Template</Label>
              <Input
                id="templateName"
                value={newTemplateName}
                onChange={(e) => setNewTemplateName(e.target.value)}
                placeholder="Ex: welcome_message"
                required
              />
            </div>
            <div>
              <Label htmlFor="templateLanguage">Idioma</Label>
              <Input
                id="templateLanguage"
                value={newTemplateLanguage}
                onChange={(e) => setNewTemplateLanguage(e.target.value)}
                placeholder="Ex: en_US"
                required
              />
            </div>
            <div>
              <Label htmlFor="templateCategory">Categoria</Label>
              <Select
                onValueChange={(value: WhatsappTemplateCategory) => setNewTemplateCategory(value)}
                value={newTemplateCategory}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma categoria" />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(WhatsappTemplateCategory).map((category) => (
                    <SelectItem key={category} value={category}>
                      {category.replace(/_/g, ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="templateBody">Corpo do Template</Label>
              <Textarea
                id="templateBody"
                value={newTemplateBody}
                onChange={(e) => setNewTemplateBody(e.target.value)}
                placeholder="Olá {{1}}, seu pedido {{2}} foi confirmado!"
                rows={5}
                required
              />
            </div>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Criando...' : 'Criar Template'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Templates Existentes</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p>Carregando templates...</p>
          ) : templates.length === 0 ? (
            <p>Nenhum template encontrado.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Idioma</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {templates.map((template) => (
                    <TableRow key={template.id}>
                      <TableCell className="font-medium">{template.name}</TableCell>
                      <TableCell>{template.language}</TableCell>
                      <TableCell>{template.category}</TableCell>
                      <TableCell>{template.status}</TableCell>
                      <TableCell>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDeleteTemplate(template.name)}
                        >
                          Deletar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default TemplatesPage;