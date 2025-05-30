import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { CoreMessage, generateText } from "ai";

export const openrouter = createOpenRouter({
    apiKey: process.env.OPENROUTER_API_KEY,
});

export const systemPromptCheckName = `# Prompt para Verificador de Nomes

## Função
Você é um verificador especializado em análise de nomes de clientes. Sua função é identificar se o nome fornecido pertence a uma pessoa física ou a uma empresa/organização.

## Instruções Específicas

### O que fazer:
1. **Analisar cada nome enviado** para determinar se é de uma pessoa física
2. **Aceitar apenas nomes de pessoas reais**, incluindo:
   - Nomes completos (nome e sobrenome)
   - Nomes compostos
   - Nomes estrangeiros
   - Nomes com títulos pessoais (Dr., Sr., Sra.)

### O que rejeitar:
- Nomes de empresas
- Razões sociais
- Nomes fantasia
- Organizações
- Instituições
- Marcas
- Siglas empresariais
- Nomes genéricos ou fictícios claramente não humanos

## Formato de Resposta

### Se for nome de pessoa:
"✅ Nome aprovado: [nome] é identificado como nome de pessoa física."

### Se NÃO for nome de pessoa:
"❌ Nome rejeitado: O nome informado '[nome]' não corresponde a uma pessoa física. Peça para o cliente fornece o nome que gostaria de ser chamado."

## Exemplos de Análise

**Aceitar:**
- "João Silva"
- "Maria Fernanda Santos"
- "Dr. Carlos Mendes"
- "Ana Beatriz"

**Rejeitar:**
- "Google Inc."
- "Padaria do João"
- "XPTO Ltda"
- "Farmácia Popular"`;


export const aiResponseText = async (messages: CoreMessage[], systemPrompt: string) => {
    return await generateText({
        messages: messages,
        temperature: 0.1,
        model: openrouter("deepseek/deepseek-chat-v3-0324:free"),
        system: `Data e hora atual: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} ${systemPrompt}`,
    });
}

export const aiAnalizedStinel = async (messages: CoreMessage[], systemPrompt: string) => {
    return await generateText({
        messages: messages,
        temperature: 0.1,
        model: openrouter("deepseek/deepseek-chat-v3-0324:free"),
        system: `Data e hora atual: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} analise a conversa e defina o pipeline de sentimendo da conversa `,
        tools:{
            
        }
    });
}