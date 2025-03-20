// Script para listar tabelas no Supabase
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

async function listTables() {
  try {
    console.log('Verificando conexão com o Supabase...');
    console.log(`URL: ${supabaseUrl}`);
    
    // Consulta para listar tabelas
    const { data, error } = await supabase
      .from('pg_tables')
      .select('*')
      .eq('schemaname', 'public');
    
    if (error) {
      console.error('Erro ao listar tabelas:', error);
      
      // Tentar abordagem alternativa
      console.log('Tentando abordagem alternativa...');
      const { data: tables, error: altError } = await supabase.rpc('list_tables');
      
      if (altError) {
        console.error('Erro alternativo:', altError);
        return;
      }
      
      console.log('Tabelas disponíveis:');
      console.log(tables);
      return;
    }
    
    console.log('Tabelas encontradas:');
    console.log(data.map(t => t.tablename));
    
  } catch (error) {
    console.error('Erro ao conectar ao Supabase:', error);
  }
}

listTables();