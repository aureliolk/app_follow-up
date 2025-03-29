// scripts/test-ai-decision.js
// Para rodar: node --env-file=.env.local scripts/test-ai-decision.js SEU_FOLLOWUP_ID_AQUI
// Ou se usar TS: npx ts-node --esm --env-file=.env.local scripts/test-ai-decision.ts SEU_FOLLOWUP_ID_AQUI

// Importar Prisma (ajuste o caminho se seu `db.ts` estiver em outro lugar)
import { prisma } from '../lib/db.js'; // Usando .js assumindo compilação ou loader
// Importar a função a ser testada (ajuste o caminho conforme sua estrutura)
import { determineNextAction } from '../app/api/follow-up/_lib/ai/functionIa.js';

// Função principal assíncrona
async function runTest() {
  // Pega o ID do follow-up do terceiro argumento da linha de comando
  const followUpId = process.argv[2];

  if (!followUpId) {
    console.error("\n❌ Erro: ID do Follow-up não fornecido.");
    console.log("Uso: node scripts/test-ai-decision.js <followUpId>");
    process.exit(1); // Sai com código de erro
  }

  console.log(`\n🧠 Iniciando teste da função determineNextAction para FollowUp ID: ${followUpId}`);
  console.log("--------------------------------------------------");

  try {
    // Chama a função que queremos testar
    const resultAction = await determineNextAction(followUpId);

    console.log("\n✅ Decisão da IA Recebida:");
    // Imprime o resultado formatado como JSON
    console.log(JSON.stringify(resultAction, null, 2));

  } catch (error) {
    console.error("\n❌ Ocorreu um erro durante o teste:");
    console.error(error);
  } finally {
    // Garante que a conexão com o banco seja fechada ao final
    await prisma.$disconnect();
    console.log("\n🔌 Conexão com o banco de dados fechada.");
  }
}

// Executa a função principal
runTest();