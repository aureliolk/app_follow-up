import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default prisma;

function removeAccents(text: string): string {
  return text
    .normalize("NFD") // Decompõe os caracteres acentuados
    .replace(/[\u0300-\u036f]/g, "") // Remove os acentos
    .toLowerCase(); // Converte para minúsculas
}

// Objeto para mapear entre sinônimos e termos relacionados
const lingerieSynonyms: { [key: string]: string[] } = {
  "sutia": ["sutian", "sutiã", "sutian", "sutien", "sustentacao", "top", "toop", "soutien", "corpete"],
  "calcinha": ["calcinhas", "calsinha", "calça", "calca", "fio", "fio dental", "caleçon", "panty", "panti"],
  "conjunto": ["conjuntos", "kit", "kits", "combo", "jogo"],
  "biquini": ["bikini", "biquíni", "biquine", "bikine", "maio", "maiô", "beachwear"],
  "camisola": ["camisolas", "roupa dormir", "baby doll", "pijama", "pijamas", "sleepwear"],
  "corpete": ["corselet", "corselete", "espartilho", "corset"],
  "bojo": ["bojo", "com bojo", "push up", "pushup", "sustentação"],
  "renda": ["rendada", "rendado", "rendas", "com renda", "bordado"],
  "fio": ["fio dental", "dental", "tanga", "string", "t-back"],
  "cinta": ["cinta-liga", "cintaliga", "cinta liga", "liga"],
  "meia": ["meias", "meia calça", "7/8", "meia-calça", "lingerie perna"],
  "body": ["bodies", "bodysuit", "maiô", "maio"],
  "cueca": ["cuecas", "sunga", "boxer", "samba-canção", "box", "slip"],
};

// Mapeamento reverso para encontrar o termo principal a partir de qualquer variação
const mainTermLookup: { [key: string]: string } = {};

// Preenche o mapeamento reverso
Object.entries(lingerieSynonyms).forEach(([mainTerm, synonyms]) => {
  mainTermLookup[mainTerm] = mainTerm; // O termo principal também mapeia para si mesmo
  synonyms.forEach(synonym => {
    mainTermLookup[synonym] = mainTerm;
  });
});

export function normalizeSearchText(text: string): string {
  // Converter para minúsculas e remover acentos
  const normalized = removeAccents(text.trim());
  
  // Dividir em palavras
  const words = normalized.split(/\s+/);
  
  // Conjunto para armazenar termos de busca únicos
  const searchTerms = new Set<string>();
  
  // Processar cada palavra
  words.forEach(word => {
    // Remover caracteres especiais
    const cleanWord = word.replace(/[^\w\s]/g, '');
    
    // Se a palavra for muito curta, ignorar
    if (cleanWord.length < 2) return;
    
    // Adicionar a palavra original
    searchTerms.add(cleanWord);
    
    // Remover plural (se terminar em 's')
    if (cleanWord.endsWith('s')) {
      searchTerms.add(cleanWord.slice(0, -1));
    }
    
    // Verificar se é um sinônimo conhecido e adicionar o termo principal
    const mainTerm = mainTermLookup[cleanWord];
    if (mainTerm) {
      searchTerms.add(mainTerm);
      
      // Também adicionar todos os sinônimos para aumentar a chance de correspondência
      if (lingerieSynonyms[mainTerm]) {
        lingerieSynonyms[mainTerm].forEach(synonym => {
          searchTerms.add(synonym);
        });
      }
    }
  });
  
  // Converter de volta para uma string
  return Array.from(searchTerms).join(' ');
}