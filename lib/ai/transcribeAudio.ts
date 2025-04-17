// lib/ai/transcribeAudio.ts
import { z } from 'zod';
import axios from 'axios';
import FormData from 'form-data';

// Schema de validação para o buffer (opcional)
const AudioBufferSchema = z.instanceof(Buffer).refine(
    (buffer) => buffer.length > 0,
    { message: "O buffer de áudio não pode estar vazio." }
);

// Schema de validação para MIME Type (simplificado)
const MimeTypeSchema = z.string().min(1, "MIME type não pode estar vazio.");

/**
 * Transcreve um buffer de áudio usando a API OpenAI Whisper diretamente.
 *
 * @param audioBuffer O buffer contendo os dados de áudio.
 * @param mimeType O tipo MIME do áudio (usado para dar um nome ao arquivo).
 * @param modelId O ID do modelo de transcrição (ex: 'whisper-1'). Padrão: 'whisper-1'.
 * @param languageCode O código do idioma (ex: 'pt').
 * @returns Uma Promise que resolve com o texto transcrito ou lança um erro.
 */
export async function transcribeAudio(
    audioBuffer: Buffer,
    mimeType: string,
    modelId: string = 'whisper-1',
    languageCode?: string
): Promise<string> {
    console.log(`[transcribeAudio Direct] Iniciando transcrição. Modelo: ${modelId}, MIME: ${mimeType}, Idioma: ${languageCode || 'N/A'}, Tamanho: ${audioBuffer.length} bytes.`);

    // Validação dos inputs (opcional)
    try {
        AudioBufferSchema.parse(audioBuffer);
        MimeTypeSchema.parse(mimeType);
    } catch (validationError) {
         console.error("[transcribeAudio Direct] Erro de validação dos parâmetros:", validationError);
         if (validationError instanceof z.ZodError) {
            throw new Error(`Parâmetros de transcrição inválidos: ${validationError.errors.map(e => e.message).join(', ')}`);
         }
         throw new Error("Parâmetros de transcrição inválidos.");
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        console.error("[transcribeAudio Direct] Chave da API OpenAI (OPENAI_API_KEY) não encontrada nas variáveis de ambiente.");
        throw new Error("Configuração da API OpenAI ausente.");
    }

    try {
        const formData = new FormData();
        // A API precisa de um nome de arquivo, mesmo que o conteúdo venha do buffer
        const filename = `audio.${mimeType.split('/')[1]?.split(';')[0] || 'bin'}`;
        formData.append('file', audioBuffer, filename);
        formData.append('model', modelId);
        if (languageCode) {
            formData.append('language', languageCode);
        }
        // formData.append('response_format', 'json'); // Padrão já é json com 'text'

        console.log(`[transcribeAudio Direct] Enviando requisição para API OpenAI com arquivo: ${filename}, modelo: ${modelId}, idioma: ${languageCode || 'N/A'}`);

        const response = await axios.post(
            'https://api.openai.com/v1/audio/transcriptions',
            formData,
            {
                headers: {
                    ...formData.getHeaders(), // Importante para Content-Type: multipart/form-data
                    'Authorization': `Bearer ${apiKey}`,
                },
                // Definir um timeout pode ser útil
                // timeout: 60000, // 60 segundos
            }
        );

        if (response.status === 200 && response.data?.text) {
            const transcription = response.data.text;
            console.log(`[transcribeAudio Direct] Transcrição recebida: "${transcription}"`);
            return transcription.trim();
        } else {
            console.error("[transcribeAudio Direct] Resposta inesperada da API OpenAI:", response.status, response.data);
            throw new Error(`Resposta inesperada da API OpenAI: ${response.status}`);
        }

    } catch (error: any) {
        console.error(`[transcribeAudio Direct] Erro ao chamar a API OpenAI (${modelId}):`, error.response?.data || error.message || error);
        console.error("[transcribeAudio Direct] Full Error Object:", error);
        // Tentar extrair mensagem de erro da resposta da API, se houver
        const apiErrorMessage = error.response?.data?.error?.message || error.message;
        throw new Error(`Erro ao processar o áudio com OpenAI API: ${apiErrorMessage}`);
    }
}

