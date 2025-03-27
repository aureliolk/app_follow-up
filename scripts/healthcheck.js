// scripts/healthcheck.js
const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');

// Configuração
const MAX_RETRIES = 10;
const RETRY_DELAY = 3000; // 3 segundos
let currentRetry = 0;

// Obter a string de conexão do banco de dados das variáveis de ambiente
const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
  console.error('DATABASE_URL não está definida. Por favor, configure esta variável de ambiente.');
  process.exit(1);
}

// Parse da DATABASE_URL para extrair informações de conexão
let connectionConfig;

try {
  const url = new URL(dbUrl);
  
  connectionConfig = {
    host: url.hostname,
    port: parseInt(url.port) || 5432,
    user: url.username,
    password: url.password,
    database: url.pathname.substring(1) // Remove a barra inicial
  };
} catch (error) {
  console.error('DATABASE_URL inválida:', error.message);
  process.exit(1);
}

console.log(`Verificando conexão com banco de dados em ${connectionConfig.host}:${connectionConfig.port}...`);

// Função para tentar conexão com o banco de dados usando pg
async function checkPostgresConnection() {
  const pool = new Pool({
    host: connectionConfig.host,
    port: connectionConfig.port,
    user: connectionConfig.user,
    password: connectionConfig.password,
    database: connectionConfig.database,
    connectionTimeoutMillis: 5000 // 5 segundos
  });

  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    console.log('Conexão PostgreSQL testada com sucesso.');
    return true;
  } catch (error) {
    console.error(`Erro ao conectar diretamente ao PostgreSQL: ${error.message}`);
    await pool.end();
    return false;
  }
}

// Função para tentar conexão com Prisma
async function checkPrismaConnection() {
  const prisma = new PrismaClient();
  
  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    console.log('Conexão Prisma testada com sucesso.');
    await prisma.$disconnect();
    return true;
  } catch (error) {
    console.error(`Erro ao conectar via Prisma: ${error.message}`);
    await prisma.$disconnect();
    return false;
  }
}

// Função principal com retry
async function tryConnect() {
  if (currentRetry >= MAX_RETRIES) {
    console.error(`Falha ao conectar ao banco de dados após ${MAX_RETRIES} tentativas.`);
    console.error('A aplicação será iniciada mesmo assim, mas pode encontrar erros de conexão.');
    process.exit(0); // Sair com sucesso para permitir que o container inicie
  }

  console.log(`Tentativa ${currentRetry + 1} de ${MAX_RETRIES}...`);
  
  try {
    // Primeiro tenta conexão direta com pg
    if (await checkPostgresConnection()) {
      // Se a conexão pg funcionar, tenta o Prisma
      if (await checkPrismaConnection()) {
        console.log('Banco de dados está pronto! Iniciando aplicação...');
        process.exit(0); // Sair com sucesso
      }
    }
  } catch (error) {
    console.error(`Erro inesperado: ${error.message}`);
  }

  // Se chegou aqui, houve erro
  currentRetry++;
  console.log(`Banco de dados não está pronto. Tentando novamente em ${RETRY_DELAY/1000} segundos...`);
  setTimeout(tryConnect, RETRY_DELAY);
}

// Iniciar processo de verificação
tryConnect();