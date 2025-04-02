// lib/timeUtils.ts

// Regex para capturar número e unidade (m, h, d, w)
const timeRegex = /(\d+)\s*(m|h|d|w)/gi;

// Fatores de conversão para milissegundos
const factors: Record<string, number> = {
  m: 60 * 1000,          // Minutos
  h: 60 * 60 * 1000,     // Horas
  d: 24 * 60 * 60 * 1000, // Dias
  w: 7 * 24 * 60 * 60 * 1000, // Semanas
};

/**
 * Converte uma string de delay (ex: "1d 2h 30m") para milissegundos (BigInt).
 * Retorna null se a string for inválida ou vazia.
 */
export function parseDelayStringToMs(delayString: string | null | undefined): bigint | null {
    if (!delayString || typeof delayString !== 'string' || delayString.trim() === '') {
      return null;
    }
  
    // <<< MODIFICAÇÃO AQUI >>>
    let totalMs = BigInt(0); // Usar BigInt(0) em vez de 0n
    // <<< FIM DA MODIFICAÇÃO >>>
  
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
      // A multiplicação com BigInt() já funciona
      totalMs += BigInt(value) * BigInt(factors[unit]);
    }
  
    if (!foundMatch && delayString.trim() !== '') {
       return null;
    }
  
    // <<< MODIFICAÇÃO AQUI >>>
    if (totalMs <= BigInt(0)) { // Comparar com BigInt(0)
      return null;
    }
    // <<< FIM DA MODIFICAÇÃO >>>
  
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
        // Tenta converter para número, tratando BigInt e string
        numMs = Number(ms);
        if (isNaN(numMs) || numMs <= 0) return '';
    } catch (e) {
        return ''; // Retorna vazio se a conversão falhar
    }


  const minutes = Math.floor(numMs / factors.m);
  const hours = Math.floor(numMs / factors.h);
  const days = Math.floor(numMs / factors.d);
  const weeks = Math.floor(numMs / factors.w);

  // Simplificação: Retorna a maior unidade inteira exata
  if (numMs === weeks * factors.w && weeks > 0) return `${weeks}w`;
  if (numMs === days * factors.d && days > 0) return `${days}d`;
  if (numMs === hours * factors.h && hours > 0) return `${hours}h`;
  if (numMs === minutes * factors.m && minutes > 0) return `${minutes}m`;

  // Se não for exato, mostra em minutos como fallback (ou melhore a lógica)
  if (minutes > 0) return `${minutes}m`;

  return ''; // Ou talvez retornar segundos se for menor que 1 minuto
}