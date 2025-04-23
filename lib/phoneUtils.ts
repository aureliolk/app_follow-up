/**
 * Padroniza um número de telefone brasileiro para o formato 55DDDNNNNNNNNN (13 dígitos).
 * Remove caracteres não numéricos, garante o código do país 55 e adiciona
 * o nono dígito para números celulares que o omitiram (formato antigo).
 *
 * @param phoneNumber O número de telefone a ser padronizado.
 * @returns O número padronizado ou null se não for possível padronizar.
 */
export function standardizeBrazilianPhoneNumber(phoneNumber: string | null | undefined): string | null {
  if (!phoneNumber) {
    return null;
  }

  // 1. Remover tudo que não for dígito
  let cleanedNumber = phoneNumber.replace(/\D/g, '');

  // 2. Lidar com o código do país (55)
  if (cleanedNumber.length === 10 || cleanedNumber.length === 11) {
    // Assume que falta o 55 se tiver 10 ou 11 dígitos
    cleanedNumber = `55${cleanedNumber}`;
  } else if (cleanedNumber.startsWith('0') && (cleanedNumber.length === 11 || cleanedNumber.length === 12)) {
      // Remove zero inicial comum em discagem de longa distância nacional
      cleanedNumber = `55${cleanedNumber.substring(1)}`;
  }

  // 3. Verificar se começa com 55 e tem tamanho razoável após adicionar 55
  if (!cleanedNumber.startsWith('55') || cleanedNumber.length < 12 || cleanedNumber.length > 13) {
      console.warn(`[standardizePhoneNumber] Número inválido após limpeza/adição de 55: ${cleanedNumber} (original: ${phoneNumber})`);
      return null; // Não parece ser um número brasileiro válido após limpeza
  }

  // 4. Adicionar o nono dígito se for um celular no formato antigo (55 + DDD + 8 dígitos = 12 dígitos)
  if (cleanedNumber.length === 12) {
    const ddd = cleanedNumber.substring(2, 4);
    const numeroSemNonoDigito = cleanedNumber.substring(4);
    // Regra simplificada: Assume que se tem 12 dígitos, é celular faltando o 9.
    // Uma regra mais complexa poderia verificar o primeiro dígito do numeroSemNonoDigito (6, 7, 8, 9),
    // mas para simplificar, adicionamos o 9.
    cleanedNumber = `55${ddd}9${numeroSemNonoDigito}`;
    console.log(`[standardizePhoneNumber] Adicionado 9º dígito: ${cleanedNumber} (original: ${phoneNumber})`);
  }

  // 5. Verificar o tamanho final esperado (13 dígitos)
  if (cleanedNumber.length !== 13) {
      console.warn(`[standardizePhoneNumber] Tamanho final inesperado: ${cleanedNumber.length} dígitos para ${cleanedNumber} (original: ${phoneNumber})`);
      return null;
  }

  return cleanedNumber;
} 