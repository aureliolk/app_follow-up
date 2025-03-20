// Script para testar tabelas específicas no Supabase
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

// Carregar variáveis de ambiente
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Credenciais do Supabase não encontradas no .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testTable(tableName) {
  try {
    console.log(`Testando tabela: ${tableName}`);
    
    // Consulta para testar se a tabela existe listando seus primeiros registros
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .limit(5);
    
    if (error) {
      console.error(`Erro ao consultar tabela ${tableName}:`, error);
      return false;
    }
    
    console.log(`Tabela ${tableName} encontrada! Registros:`, data.length > 0 ? data.length : 'Nenhum');
    if (data.length > 0) {
      console.log('Exemplo de registro:', data[0]);
    }
    return true;
    
  } catch (error) {
    console.error(`Erro ao testar tabela ${tableName}:`, error);
    return false;
  }
}

async function main() {
  console.log('Testando conexão com o Supabase...');
  console.log(`URL: ${supabaseUrl}`);
  
  // Lista de tabelas para testar
  const tables = [
    'follow_up_campaigns',
    'follow_up_funnel_stages',
    'follow_up_steps',
    'follow_ups',
    'follow_up_messages'
  ];
  
  // Testar cada tabela
  for (const table of tables) {
    await testTable(table);
    console.log('-----------------------------------');
  }
}

main();