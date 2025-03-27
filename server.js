// server.js
import { spawn } from 'child_process';
import path from 'path';

// Configuração para inicialização segura
const NODE_ENV = process.env.NODE_ENV || 'development';
const PORT = process.env.PORT || 3000;
const MAX_RESTART_ATTEMPTS = 3;
let restartAttempts = 0;
let serverProcess = null;

console.log(`Ambiente: ${NODE_ENV}`);
console.log(`Carregamento automático de mensagens: ${process.env.ENABLE_AUTO_RELOAD === 'true' ? 'HABILITADO' : 'DESABILITADO'}`);

// Verificar conexão com banco de dados primeiro
function checkDatabase() {
  return new Promise((resolve, reject) => {
    console.log('Verificando conexão com banco de dados...');
    
    const healthcheck = spawn('node', ['scripts/healthcheck.js'], {
      stdio: 'inherit'
    });
    
    healthcheck.on('close', (code) => {
      if (code === 0) {
        console.log('Banco de dados verificado com sucesso!');
        resolve();
      } else {
        console.warn(`Verificação de banco de dados falhou com código ${code}`);
        // Continuar mesmo com falha na verificação
        resolve();
      }
    });
    
    healthcheck.on('error', (err) => {
      console.error('Erro ao executar verificação de banco de dados:', err);
      // Continuar mesmo com erro
      resolve();
    });
  });
}

// Função para iniciar o servidor Next.js
function startServer() {
  console.log('Iniciando servidor Next.js...');
  
  // Configurações para aumentar a estabilidade
  const nextOptions = [
    'next', 'start',
    '--port', PORT.toString()
  ];
  
  // Em produção, configurar GC mais agressivo
  const nodeOptions = [];
  if (NODE_ENV === 'production') {
    // O servidor já receberá as opções de memória via NODE_OPTIONS
    // Configurar apenas opções específicas adicionais aqui
    nodeOptions.push('--expose-gc');
  }
  
  serverProcess = spawn('node', [...nodeOptions, ...nextOptions], {
    stdio: 'inherit',
    env: process.env
  });
  
  serverProcess.on('close', (code) => {
    console.log(`Servidor encerrado com código ${code}`);
    
    if (code !== 0 && code !== null && restartAttempts < MAX_RESTART_ATTEMPTS) {
      restartAttempts++;
      console.log(`Tentando reiniciar servidor (tentativa ${restartAttempts} de ${MAX_RESTART_ATTEMPTS})...`);
      
      // Aguardar um tempo antes de reiniciar
      setTimeout(() => {
        startServer();
      }, 5000); // 5 segundos
    }
  });
  
  serverProcess.on('error', (err) => {
    console.error('Erro ao iniciar servidor:', err);
  });
}

// Processo principal
async function main() {
  try {
    // Verificar conexão com banco primeiro
    await checkDatabase();
    
    // Iniciar servidor
    startServer();
    
    // Configurar handlers para sinais
    process.on('SIGTERM', () => {
      console.log('Recebido SIGTERM, encerrando servidor...');
      if (serverProcess) {
        serverProcess.kill('SIGTERM');
      }
      process.exit(0);
    });
    
    process.on('SIGINT', () => {
      console.log('Recebido SIGINT, encerrando servidor...');
      if (serverProcess) {
        serverProcess.kill('SIGINT');
      }
      process.exit(0);
    });
  } catch (error) {
    console.error('Erro durante inicialização:', error);
    process.exit(1);
  }
}

// Iniciar a aplicação
main();