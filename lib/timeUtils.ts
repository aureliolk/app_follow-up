// lib/timeUtils.ts
import { fromZonedTime, toZonedTime, format as formatTz } from 'date-fns-tz';
import { addSeconds, getDay, set, parse, isValid, addDays, startOfDay } from 'date-fns';

// Regex para capturar número e unidade (m, h, d, w)
const timeRegex = /(\d+)\s*(m|h|d|w)/gi;

// Fatores de conversão para milissegundos
const factors: Record<string, number> = {
  m: 60 * 1000,          // Minutos
  h: 60 * 60 * 1000,     // Horas
  d: 24 * 60 * 60 * 1000, // Dias
  w: 7 * 24 * 60 * 60 * 1000, // Semanas
};

const saoPauloTimeZone = 'America/Sao_Paulo';

/**
 * Converte uma string de delay (ex: "1d 2h 30m") para milissegundos (BigInt).
 * Retorna null se a string for inválida ou vazia.
 */
export function parseDelayStringToMs(delayString: string | null | undefined): bigint | null {
    if (!delayString || typeof delayString !== 'string' || delayString.trim() === '') {
      return null;
    }

    let totalMs = BigInt(0);
    let match;
    let foundMatch = false;
    timeRegex.lastIndex = 0;

    while ((match = timeRegex.exec(delayString)) !== null) {
      foundMatch = true;
      const value = parseInt(match[1], 10);
      const unit = match[2].toLowerCase();

      if (isNaN(value) || !factors[unit]) {
        return null;
      }
      totalMs += BigInt(value) * BigInt(factors[unit]);
    }

    if (!foundMatch && delayString.trim() !== '') {
       return null;
    }

    if (totalMs <= BigInt(0)) {
      return null;
    }

    return totalMs;
  }

/**
 * Formata milissegundos (BigInt ou number) para uma string de delay legível.
 * Ex: 180000 -> "3m", 7200000 -> "2h"
 * (Função básica, pode ser melhorada para combinar unidades como "1d 2h")
 */
export function formatMsToDelayString(ms: bigint | number | string | null | undefined): string {
    if (ms === null || ms === undefined) return '';

    let numMs: number;
    try {
        numMs = Number(ms);
        if (isNaN(numMs) || numMs <= 0) return '';
    } catch (e) {
        return '';
    }

  const minutes = Math.floor(numMs / factors.m);
  const hours = Math.floor(numMs / factors.h);
  const days = Math.floor(numMs / factors.d);
  const weeks = Math.floor(numMs / factors.w);

  if (numMs === weeks * factors.w && weeks > 0) return `${weeks}w`;
  if (numMs === days * factors.d && days > 0) return `${days}d`;
  if (numMs === hours * factors.h && hours > 0) return `${hours}h`;
  if (numMs === minutes * factors.m && minutes > 0) return `${minutes}m`;

  if (minutes > 0) return `${minutes}m`;

  return '';
}

// --- Novas Funções para Agendamento de Campanhas com date-fns-tz ---

/**
 * Helper para parsear HH:MM string para um objeto com horas e minutos.
 * Retorna null se o formato for inválido.
 */
function parseTimeString(timeString: string): { hours: number; minutes: number } | null {
    try {
        const [hours, minutes] = timeString.split(':').map(Number);
        if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
            throw new Error('Invalid time format');
        }
        return { hours, minutes };
    } catch (error) {
        console.error(`[parseTimeString] Erro ao parsear horário: "${timeString}"`, error);
        return null;
    }
}

/**
 * Verifica se uma data/hora (no fuso horário de SP) está dentro de uma janela HH:MM.
 */
function isTimeWithinWindowTz(dateInSaoPaulo: Date, startTimeStr: string, endTimeStr: string): boolean {
    const startTime = parseTimeString(startTimeStr);
    const endTime = parseTimeString(endTimeStr);

    if (!startTime || !endTime) return false; // Falha se o formato for inválido

    const startOfDayInSaoPaulo = set(dateInSaoPaulo, { hours: 0, minutes: 0, seconds: 0, milliseconds: 0 });

    // Define a data de início e fim da janela no mesmo dia da data fornecida
    const windowStart = set(startOfDayInSaoPaulo, { hours: startTime.hours, minutes: startTime.minutes });
    const windowEnd = set(startOfDayInSaoPaulo, { hours: endTime.hours, minutes: endTime.minutes });

    // Compara diretamente os timestamps (em milissegundos)
    return dateInSaoPaulo.getTime() >= windowStart.getTime() && dateInSaoPaulo.getTime() <= windowEnd.getTime();
}

/**
 * Verifica se o dia da semana de uma data (no fuso horário de SP) está em um array de dias permitidos.
 */
function isDayAllowedTz(dateInSaoPaulo: Date, allowedDays: number[]): boolean {
    if (!Array.isArray(allowedDays)) return false;
    const dayOfWeek = getDay(dateInSaoPaulo); // 0 para Domingo, 1 para Segunda, etc. (date-fns usa a mesma convenção do Date nativo)
    return allowedDays.includes(dayOfWeek);
}

/**
 * Calcula o próximo horário de envio válido a partir de um tempo base (UTC),
 * considerando intervalo, janela de horário e dias permitidos no fuso de São Paulo (UTC-3).
 *
 * @param baseTimeUtc O tempo base em UTC (Date).
 * @param intervalSeconds Intervalo mínimo entre envios (number).
 * @param startTimeStr String HH:MM do início da janela de envio (horário de SP).
 * @param endTimeStr String HH:MM do fim da janela de envio (horário de SP).
 * @param allowedDays Array de números de dias permitidos (0-6, Domingo=0).
 * @returns O próximo horário válido como um objeto Date em UTC.
 */
export function calculateNextValidSendTime(
    baseTimeUtc: Date,
    intervalSeconds: number,
    startTimeStr: string,
    endTimeStr: string,
    allowedDays: number[]
): Date {
    // 1. Garantir que a base time está em UTC e parsear os horários da janela
    const startTime = parseTimeString(startTimeStr);
    const endTime = parseTimeString(endTimeStr);

    if (!startTime || !endTime) {
        console.error('[calculateNextValidSendTime] Horário de início ou fim inválido.');
        // Fallback: retorna o baseTime + intervalo para evitar erro total, mas loga o problema
        return addSeconds(baseTimeUtc, intervalSeconds);
    }

    // 2. Calcular o tempo inicial de tentativa adicionando o intervalo
    let nextAttemptUtc = addSeconds(baseTimeUtc, intervalSeconds);

    // 3. Loop para encontrar o próximo slot válido
    while (true) {
        // Converte o tempo de tentativa UTC para o fuso de São Paulo para as verificações
        let nextAttemptSaoPaulo = toZonedTime(nextAttemptUtc, saoPauloTimeZone);

        // Verifica se o dia da semana é permitido
        if (!isDayAllowedTz(nextAttemptSaoPaulo, allowedDays)) {
            // Se o dia não é permitido, avança para o início do próximo dia (00:00) em SP
            // e então ajusta para o início da janela permitida nesse novo dia.
            nextAttemptSaoPaulo = addDays(nextAttemptSaoPaulo, 1);
            nextAttemptSaoPaulo = set(nextAttemptSaoPaulo, { hours: startTime.hours, minutes: startTime.minutes, seconds: 0, milliseconds: 0 });
            // Converte de volta para UTC para a próxima iteração
            nextAttemptUtc = fromZonedTime(nextAttemptSaoPaulo, saoPauloTimeZone);
            continue; // Reinicia o loop com a nova data/hora
        }

        // Verifica se a hora está dentro da janela permitida
        if (!isTimeWithinWindowTz(nextAttemptSaoPaulo, startTimeStr, endTimeStr)) {
            // Se a hora está fora da janela...
            const currentSaoPauloTime = set(nextAttemptSaoPaulo, { seconds: 0, milliseconds: 0 }); // Ignora segundos para comparação
            const windowStartTime = set(nextAttemptSaoPaulo, { hours: startTime.hours, minutes: startTime.minutes, seconds: 0, milliseconds: 0 });
            const windowEndTime = set(nextAttemptSaoPaulo, { hours: endTime.hours, minutes: endTime.minutes, seconds: 0, milliseconds: 0 });

            if (currentSaoPauloTime.getTime() < windowStartTime.getTime()) {
                // Se for ANTES da janela no dia atual: ajusta para o início da janela
                nextAttemptSaoPaulo = set(nextAttemptSaoPaulo, { hours: startTime.hours, minutes: startTime.minutes, seconds: 0, milliseconds: 0 });
            } else {
                // Se for DEPOIS da janela no dia atual: avança para o início da janela do PRÓXIMO dia
                nextAttemptSaoPaulo = addDays(nextAttemptSaoPaulo, 1);
                nextAttemptSaoPaulo = set(nextAttemptSaoPaulo, { hours: startTime.hours, minutes: startTime.minutes, seconds: 0, milliseconds: 0 });
            }
            // Converte de volta para UTC para a próxima iteração
            nextAttemptUtc = fromZonedTime(nextAttemptSaoPaulo, saoPauloTimeZone);
            continue; // Reinicia o loop com a nova data/hora
        }

        // Se passou pelas duas verificações (dia e hora), encontramos um slot válido
        return nextAttemptUtc; // Retorna a data/hora válida em UTC
    }
}