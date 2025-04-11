// lib/ai/transcribeAudio.ts
import { openai } from '@ai-sdk/openai';
import { experimental_transcribe as transcribe } from 'ai';
import { z } from 'zod';

// Schema de validação para o buffer (opcional)
const AudioBufferSchema = z.instanceof(Buffer).refine(
    (buffer) => buffer.length > 0,
    { message: "O buffer de áudio não pode estar vazio." }
);

// Schema de validação para MIME Type (simplificado)
const MimeTypeSchema = z.string().min(1, "MIME type não pode estar vazio.");

/**
 * Transcreve um buffer de áudio usando um modelo de transcrição (OpenAI Whisper por padrão).
 *
 * @param audioBuffer O buffer contendo os dados de áudio.
 * @param mimeType O tipo MIME do áudio (ex: 'audio/webm', 'audio/ogg', 'audio/mpeg').
 * @param modelId O ID do modelo de transcrição (ex: 'whisper-1'). Padrão: 'whisper-1'.
 * @param languageCode O código do idioma (opcional, ex: 'pt').
 * @returns Uma Promise que resolve com o texto transcrito ou lança um erro.
 */
export async function transcribeAudio(
    audioBuffer: Buffer,
    mimeType: string,
    modelId: string = 'whisper-1',
    languageCode?: string
): Promise<string> {
    console.log(`[transcribeAudio] Iniciando transcrição. Modelo: ${modelId}, MIME: ${mimeType}, Idioma: ${languageCode || 'auto'}, Tamanho: ${audioBuffer.length} bytes.`);

    // Validação dos inputs (opcional)
    try {
        AudioBufferSchema.parse(audioBuffer);
        MimeTypeSchema.parse(mimeType);
    } catch (validationError) {
         console.error("[transcribeAudio] Erro de validação dos parâmetros:", validationError);
         if (validationError instanceof z.ZodError) {
            throw new Error(`Parâmetros de transcrição inválidos: ${validationError.errors.map(e => e.message).join(', ')}`);
         }
         throw new Error("Parâmetros de transcrição inválidos.");
    }

    try {
        let speechModel;
        if (modelId.startsWith('whisper') || modelId.startsWith('gpt-4o-transcribe')) {
             speechModel = openai(modelId as any);
        } else {
             console.error(`[transcribeAudio] Modelo de transcrição não suportado ou não configurado: ${modelId}. Use 'whisper-1'.`);
             throw new Error(`Modelo de transcrição não suportado: ${modelId}`);
        }
        
        console.log(`[transcribeAudio] Enviando requisição para o modelo ${modelId} (OpenAI)...`);

        const { text } = await transcribe({
            model: speechModel,
            audio: audioBuffer,
        });

        console.log(`[transcribeAudio] Transcrição (OpenAI): "${text}"`);
        return text.trim();

    } catch (error: any) {
        // Tratar NoTranscriptGeneratedError especificamente, se necessário
        if (error.name === 'NoTranscriptGeneratedError') { // Checar pelo nome do erro
            console.error(`[transcribeAudio] Transcrição não gerada pelo modelo ${modelId}. Causa:`, error.cause);
            throw new Error(`Não foi possível transcrever o áudio (modelo não gerou resultado).`);
        }
        console.error(`[transcribeAudio] Erro ao chamar a API de IA (${modelId}):`, error.message || error);
        throw new Error(`Erro ao processar o áudio com IA: ${error.message}`);
    }
}

