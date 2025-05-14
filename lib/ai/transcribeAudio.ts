// lib/ai/transcribeAudio.ts
import { z } from 'zod';
import axios from 'axios';
import FormData from 'form-data';
import ffmpeg from 'fluent-ffmpeg';
import os from 'os';
import fs from 'fs/promises';
import path from 'path';

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

    let finalAudioBuffer = audioBuffer;
    let finalMimeType = mimeType;
    const originalFilename = `audio.${mimeType.split('/')[1]?.split(';')[0]?.replace(/[^a-zA-Z0-9.]/g, '_') || 'bin'}`;
    let tempInputPath: string | null = null;
    let tempOutputPath: string | null = null;

    // --- ETAPA DE TRANSCODIFICAÇÃO CONDICIONAL ---
    if (mimeType.includes('audio/ogg')) { // Condição para transcodificar, ex: 'audio/ogg' ou 'audio/ogg; codecs=opus'
        console.log(`[transcribeAudio Direct] MimeType ${mimeType} detectado para transcodificação. Tentando converter para MP3...`);
        try {
            const timestamp = Date.now();
            const randomSuffix = Math.random().toString(36).substring(2, 8);
            tempInputPath = path.join(os.tmpdir(), `input_${timestamp}_${randomSuffix}_${originalFilename}`);
            await fs.writeFile(tempInputPath, audioBuffer);

            tempOutputPath = path.join(os.tmpdir(), `output_${timestamp}_${randomSuffix}.mp3`);

            await new Promise<void>((resolve, reject) => {
                ffmpeg(tempInputPath)
                    .toFormat('mp3')
                    .audioCodec('libmp3lame') // Codec MP3 padrão
                    // .audioBitrate('128k') // Opcional: definir bitrate
                    .on('error', (err) => {
                        console.error('[transcribeAudio Direct] Erro no FFmpeg durante transcodificação:', err.message);
                        reject(new Error(`Falha na transcodificação FFmpeg: ${err.message}`));
                    })
                    .on('end', () => {
                        console.log('[transcribeAudio Direct] Transcodificação FFmpeg para MP3 concluída.');
                        resolve();
                    })
                    .save(tempOutputPath as string);
            });

            finalAudioBuffer = await fs.readFile(tempOutputPath);
            finalMimeType = 'audio/mp3';
            console.log(`[transcribeAudio Direct] Áudio transcodificado para MP3. Novo tamanho: ${finalAudioBuffer.length} bytes.`);

        } catch (transcodingError: any) {
            console.error(`[transcribeAudio Direct] Falha ao transcodificar áudio ${mimeType}. Tentando enviar original. Erro: ${transcodingError.message}`);
            // Se a transcodificação falhar, finalAudioBuffer e finalMimeType permanecem os originais.
        } finally {
            // Limpar arquivos temporários
            if (tempInputPath) {
                await fs.unlink(tempInputPath).catch(err => console.error(`[transcribeAudio Direct] Falha ao limpar arquivo temporário de entrada: ${tempInputPath}`, err));
            }
            if (tempOutputPath) {
                await fs.unlink(tempOutputPath).catch(err => console.error(`[transcribeAudio Direct] Falha ao limpar arquivo temporário de saída: ${tempOutputPath}`, err));
            }
        }
    }
    // --- FIM DA ETAPA DE TRANSCODIFICAÇÃO ---

    try {
        const formData = new FormData();
        // A API precisa de um nome de arquivo, mesmo que o conteúdo venha do buffer
        // Usar o finalMimeType para o nome do arquivo enviado à OpenAI
        const filenameForOpenAI = `audio.${finalMimeType.split('/')[1]?.split(';')[0]?.replace(/[^a-zA-Z0-9.]/g, '_') || 'bin'}`;
        formData.append('file', finalAudioBuffer, filenameForOpenAI);
        formData.append('model', modelId);
        if (languageCode) {
            formData.append('language', languageCode);
        }
        // formData.append('response_format', 'json'); // Padrão já é json com 'text'

        console.log(`[transcribeAudio Direct] Enviando requisição para API OpenAI com arquivo: ${filenameForOpenAI}, modelo: ${modelId}, idioma: ${languageCode || 'N/A'}`);

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

