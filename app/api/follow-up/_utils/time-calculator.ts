// app/follow-up/_utils/time-calculator.ts

/**
 * Utilitários para cálculos e formatações de tempo para follow-ups
 */

// Constantes de conversão
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Converte string de tempo no formato "Xd", "Xh", "Xm", "Xs" para milissegundos
 * @param timeStr String no formato como "30m", "2h", "1d", "45s"
 * @returns Tempo em milissegundos
 */
export function parseTimeToMs(timeStr: string): number {
  const match = timeStr.match(/^(\d+)([smhd])$/i);
  if (!match) {
    throw new Error(`Formato de tempo inválido: ${timeStr}. Use formatos como "30m", "2h", "1d"`);
  }

  const value = parseInt(match[1]);
  const unit = match[2].toLowerCase();

  const units: Record<string, number> = {
    's': SECOND,
    'm': MINUTE,
    'h': HOUR,
    'd': DAY,
  };

  if (!(unit in units)) {
    throw new Error(`Unidade de tempo desconhecida: ${unit}`);
  }

  return value * units[unit];
}

/**
 * Converte milissegundos para o formato mais legível
 * @param ms Tempo em milissegundos
 * @returns String formatada (ex: "2 dias 3 horas")
 */
export function formatMsToHuman(ms: number): string {
  if (ms < 0) {
    return "tempo inválido";
  }

  if (ms < SECOND) {
    return `${ms} ms`;
  }

  if (ms < MINUTE) {
    return `${Math.floor(ms / SECOND)} segundo${Math.floor(ms / SECOND) !== 1 ? 's' : ''}`;
  }

  if (ms < HOUR) {
    const minutes = Math.floor(ms / MINUTE);
    const seconds = Math.floor((ms % MINUTE) / SECOND);
    return seconds > 0 
      ? `${minutes} minuto${minutes !== 1 ? 's' : ''} e ${seconds} segundo${seconds !== 1 ? 's' : ''}`
      : `${minutes} minuto${minutes !== 1 ? 's' : ''}`;
  }

  if (ms < DAY) {
    const hours = Math.floor(ms / HOUR);
    const minutes = Math.floor((ms % HOUR) / MINUTE);
    return minutes > 0 
      ? `${hours} hora${hours !== 1 ? 's' : ''} e ${minutes} minuto${minutes !== 1 ? 's' : ''}`
      : `${hours} hora${hours !== 1 ? 's' : ''}`;
  }

  const days = Math.floor(ms / DAY);
  const hours = Math.floor((ms % DAY) / HOUR);
  return hours > 0 
    ? `${days} dia${days !== 1 ? 's' : ''} e ${hours} hora${hours !== 1 ? 's' : ''}`
    : `${days} dia${days !== 1 ? 's' : ''}`;
}

/**
 * Calcula a data/hora de quando uma mensagem será enviada
 * @param startDate Data de início
 * @param waitTimes Lista de tempos de espera no formato "Xd", "Xh", "Xm", "Xs"
 * @param stepIndex Índice da etapa (0-based)
 * @returns Data/hora de envio
 */
export function calculateMessageTime(
  startDate: Date,
  waitTimes: string[],
  stepIndex: number
): Date {
  if (stepIndex < 0 || stepIndex >= waitTimes.length) {
    throw new Error(`Índice de etapa inválido: ${stepIndex}`);
  }

  let totalMs = 0;

  // Somar todos os tempos de espera até a etapa desejada
  for (let i = 0; i <= stepIndex; i++) {
    totalMs += parseTimeToMs(waitTimes[i]);
  }

  return new Date(startDate.getTime() + totalMs);
}

/**
 * Calcula o tempo restante até uma data futura
 * @param targetDate Data alvo
 * @returns Tempo restante em formato legível
 */
export function getTimeRemaining(targetDate: Date): string {
  const now = new Date();
  const remaining = targetDate.getTime() - now.getTime();
  
  if (remaining <= 0) {
    return "agora";
  }
  
  return formatMsToHuman(remaining);
}

/**
 * Verifica se uma data já passou
 * @param date Data a ser verificada
 * @returns Booleano indicando se a data já passou
 */
export function isDatePassed(date: Date): boolean {
  return date.getTime() < Date.now();
}

/**
 * Formata data para string amigável
 * @param date Data para formatação
 * @returns String formatada (ex: "23/05/2023 às 14:30")
 */
export function formatDate(date: Date): string {
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).replace(',', ' às');
}

/**
 * Calcula e retorna a previsão de datas para todas as etapas de uma sequência
 * @param startDate Data de início
 * @param waitTimes Lista de tempos de espera
 * @returns Array com previsões de datas
 */
export function calculateFullSchedule(startDate: Date, waitTimes: string[]): {
  stepIndex: number;
  waitTime: string;
  waitTimeMs: number;
  estimatedDate: Date;
  formattedDate: string;
  timeRemaining: string;
}[] {
  let currentDate = new Date(startDate.getTime());
  const schedule = [];

  for (let i = 0; i < waitTimes.length; i++) {
    const waitTimeMs = parseTimeToMs(waitTimes[i]);
    const estimatedDate = new Date(currentDate.getTime() + waitTimeMs);
    
    schedule.push({
      stepIndex: i,
      waitTime: waitTimes[i],
      waitTimeMs,
      estimatedDate,
      formattedDate: formatDate(estimatedDate),
      timeRemaining: getTimeRemaining(estimatedDate)
    });
    
    currentDate = estimatedDate;
  }
  
  return schedule;
}