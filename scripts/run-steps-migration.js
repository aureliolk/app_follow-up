// Executar a migração para criar a tabela follow_up_steps
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Carregar variáveis de ambiente
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Credenciais do Supabase não encontradas no .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runMigration() {
  try {
    console.log('Executando migração para criar tabela follow_up_steps...');
    
    // Ler o arquivo SQL
    const sqlPath = path.join(__dirname, '../migrations/create-follow-up-steps.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    // Exibir o SQL que será executado
    console.log('SQL a ser executado:');
    console.log(sql);
    
    console.log('\nPara executar esta migração, você precisa:');
    console.log('1. Acessar o Dashboard do Supabase: https://app.supabase.io');
    console.log('2. Selecionar seu projeto');
    console.log('3. Ir para "SQL Editor"');
    console.log('4. Criar uma "Nova Query" e colar o SQL acima');
    console.log('5. Executar o SQL\n');
    
    console.log('Ou utilize o comando abaixo para visualizar o SQL:');
    console.log('node scripts/run-steps-migration.js');
  } catch (error) {
    console.error('Erro ao executar migração:', error);
  }
}

runMigration();