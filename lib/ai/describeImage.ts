// lib/ai/describeImage.ts
import { google } from '@ai-sdk/google';
import { generateText, CoreMessage } from 'ai';
import { z } from 'zod'; // Usar Zod para validação (opcional, mas bom)

// Schema de validação para o buffer (opcional)
const ImageBufferSchema = z.instanceof(Buffer).refine(
    (buffer) => buffer.length > 0,
    { message: "O buffer da imagem não pode estar vazio." }
);

/**
 * Gera uma descrição textual curta para uma imagem usando um modelo Gemini Vision.
 *
 * @param imageBuffer O buffer contendo os dados da imagem.
 * @param modelId O ID do modelo Gemini a ser usado (ex: 'gemini-1.5-flash-latest'). Padrão: 'gemini-1.5-flash-latest'.
 * @returns Uma Promise que resolve com a descrição da imagem ou lança um erro.
 */
export async function describeImage(
    imageBuffer: Buffer,
    modelId: string = 'gemini-1.5-flash-latest' // Usar um modelo vision recente
): Promise<string> {
    console.log(`[describeImage] Iniciando descrição da imagem. Modelo: ${modelId}, Tamanho do Buffer: ${imageBuffer.length} bytes.`);

    // Validação do buffer (opcional)
    try {
        ImageBufferSchema.parse(imageBuffer);
    } catch (validationError) {
         console.error("[describeImage] Erro de validação do buffer:", validationError);
         if (validationError instanceof z.ZodError) {
            throw new Error(`Buffer da imagem inválido: ${validationError.errors.map(e => e.message).join(', ')}`);
         }
         throw new Error("Buffer da imagem inválido.");
    }

    try {
        // Seleciona o modelo Google (Gemini Vision)
        const visionModel = google(modelId as any); // Cast 'as any' pode ser necessário dependendo da versão do SDK

        // Cria a mensagem para a IA, incluindo a imagem
        const messages: CoreMessage[] = [
            {
                role: 'user',
                content: [
                    { type: 'text', text: 'Descreva esta imagem de forma concisa (máximo 2 frases). Se for um documento ou captura de tela, mencione o tipo e talvez o tópico principal, se aparente. Não descreva texto ilegível.' },
                    { type: 'image', image: imageBuffer } // Passa o buffer diretamente
                ]
            }
        ];

        console.log(`[describeImage] Enviando requisição para o modelo ${modelId}...`);

        // Gera o texto (descrição)
        const { text, finishReason, usage } = await generateText({
            model: visionModel,
            messages: messages,
            // Configurações adicionais, se necessário (maxTokens, temperature, etc.)
            // maxTokens: 100, // Limitar o tamanho da descrição
        });

        console.log(`[describeImage] Resposta recebida. Finish Reason: ${finishReason}, Usage: ${JSON.stringify(usage)}`);

        if (finishReason === 'stop' || finishReason === 'length') {
             console.log(`[describeImage] Descrição gerada: "${text}"`);
             return text.trim();
        } else {
            console.error(`[describeImage] Geração de texto falhou ou foi bloqueada. Finish Reason: ${finishReason}`);
            throw new Error(`Não foi possível gerar a descrição da imagem (Finish Reason: ${finishReason})`);
        }

    } catch (error: any) {
        console.error(`[describeImage] Erro ao chamar a API de IA (${modelId}):`, error.message || error);
        // Considerar relançar um erro mais genérico ou o erro original dependendo da necessidade
        throw new Error(`Erro ao processar a imagem com IA: ${error.message}`);
    }
}

