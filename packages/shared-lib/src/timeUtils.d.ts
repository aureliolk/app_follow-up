/**
 * Converte uma string de delay (ex: "1d 2h 30m") para milissegundos (BigInt).
 * Retorna null se a string for inválida ou vazia.
 */
export declare function parseDelayStringToMs(delayString: string | null | undefined): bigint | null;
/**
 * Formata milissegundos (BigInt ou number) para uma string de delay legível.
 * Ex: 180000 -> "3m", 7200000 -> "2h"
 * (Função básica, pode ser melhorada para combinar unidades como "1d 2h")
 */
export declare function formatMsToDelayString(ms: bigint | number | string | null | undefined): string;
//# sourceMappingURL=timeUtils.d.ts.map