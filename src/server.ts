// websocket-server/src/server.ts

import dotenv from 'dotenv';
dotenv.config(); // Carrega variáveis de ambiente do .env

import { createServer } from 'http';
import { Server } from 'socket.io';
import Redis from 'ioredis';

const PORT = process.env.WEBSOCKET_PORT || 3001;

// Configuração Redis
const redisOptions = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
  retryStrategy(times: number): number | null {
    const delay = Math.min(times * 100, 3000);
    console.log(`[Redis] Tentando reconectar (tentativa ${times}). Próxima em ${delay}ms`);
    return delay;
  },
};

// Criar clientes Redis separados para subscriber e publisher
const redisSubscriber = new Redis(redisOptions);

// Tratamento de erros do Redis
redisSubscriber.on('error', (err) => {
  console.error('[Redis] Erro na conexão do subscriber:', err);
});

redisSubscriber.on('connect', () => {
  console.log('[Redis] Subscriber conectado com sucesso');
});

// Definir padrões para canais Redis
const CONVERSATION_CHANNEL_PATTERN = 'chat-updates:*';
const WORKSPACE_CHANNEL_PREFIX = 'workspace-updates:';

// Cria o servidor HTTP e o servidor Socket.IO
const httpServer = createServer((req, res) => {
  // Endpoint básico para testar se o servidor está rodando
  if (req.url === '/status') {
    // Adicionar headers CORS para permitir acesso de qualquer origem
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end(JSON.stringify({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      redis: {
        connected: redisSubscriber.status === 'ready',
        subscriptions: Array.from(redisSubs.keys())
      } 
    }));
    return;
  }

  // Preflight CORS para outras rotas
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  // Fallback para outras rotas
  res.writeHead(404);
  res.end();
});

// Configuração simplificada do Socket.IO
const io = new Server(httpServer, {
  cors: {
    origin: '*', // Permitir qualquer origem durante desenvolvimento
    methods: ['GET', 'POST'],
    credentials: false
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 30000,
  pingInterval: 25000,
  connectTimeout: 20000
});

// Map para armazenar clientes por sala
const workspaceRooms = new Map<string, Set<string>>();

// Map para rastrear quais canais Redis estamos assinando
const redisSubs = new Map<string, boolean>();

// Função para gerenciar assinaturas Redis
function subscribeToRedisChannel(channelName: string) {
  if (redisSubs.has(channelName)) {
    console.log(`[Redis] Já inscrito no canal ${channelName}`);
    return;
  }
  
  console.log(`[Redis] Assinando no canal ${channelName}`);
  
  // Se for um padrão com * (wildcard)
  if (channelName.includes('*')) {
    redisSubscriber.psubscribe(channelName, (err) => {
      if (err) {
        console.error(`[Redis] Erro ao assinar padrão ${channelName}:`, err);
        return;
      }
      redisSubs.set(channelName, true);
      console.log(`[Redis] Assinado com sucesso no padrão ${channelName}`);
    });
  } else {
    // Canal normal
    redisSubscriber.subscribe(channelName, (err) => {
      if (err) {
        console.error(`[Redis] Erro ao assinar canal ${channelName}:`, err);
        return;
      }
      redisSubs.set(channelName, true);
      console.log(`[Redis] Assinado com sucesso no canal ${channelName}`);
    });
  }
}

// Função para verificar todas as inscrições de canais Redis
function checkRedisSubscriptions() {
  // Imprimir atuais inscrições
  console.log(`[Redis] Status atual: ${redisSubscriber.status}`);
  console.log(`[Redis] Inscrições de canais: ${Array.from(redisSubs.keys()).join(', ')}`);
  
  // Se estiver conectado e não tivermos nenhuma inscrição, inscreva nos canais padrão
  if (redisSubscriber.status === 'ready' && redisSubs.size === 0) {
    console.log('[Redis] Sem inscrições ativas. Inscrevendo em canais padrão...');
    
    // Inscrever no padrão de conversas
    subscribeToRedisChannel(CONVERSATION_CHANNEL_PATTERN);
    
    // Para cada workspace com clientes conectados, inscreva no canal do workspace
    workspaceRooms.forEach((clients, workspaceId) => {
      if (clients.size > 0) {
        subscribeToRedisChannel(`${WORKSPACE_CHANNEL_PREFIX}${workspaceId}`);
      }
    });
  }
}

// Verificar a cada 10 segundos se todas as inscrições Redis estão ativas
setInterval(checkRedisSubscriptions, 10000);

// Listener de mensagens Redis
redisSubscriber.on('message', (channel, message) => {
  console.log(`[Redis] Mensagem recebida no canal ${channel}`);
  
  try {
    // Analisar a mensagem JSON
    const data = JSON.parse(message);
    
    // Determinar o tipo de evento e payload
    const eventType = data.type || 'update';
    const payload = data.payload || data;
    
    console.log(`[Redis] Evento ${eventType} em ${channel}`);
    
    // Verificar se é um canal de workspace ou conversa
    if (channel.startsWith(WORKSPACE_CHANNEL_PREFIX)) {
      // Extrair workspaceId do nome do canal
      const workspaceId = channel.split(':')[1];
      
      // Transmitir para todos os clientes na sala do workspace
      console.log(`[Redis] Enviando evento ${eventType} para workspace ${workspaceId}`);
      io.to(workspaceId).emit(eventType, payload);
    } 
    else if (channel.startsWith('chat-updates:')) {
      // Canal formato: chat-updates:{conversationId}
      // Extrair conversationId e workspaceId
      const conversationId = channel.split(':')[1];
      console.log(`[Redis] Mensagem para conversa ${conversationId}`);
      
      // Extrair workspaceId do payload se disponível
      if (payload && payload.workspace_id) {
        const workspaceId = payload.workspace_id;
        console.log(`[Redis] Enviando evento ${eventType} para workspace ${workspaceId} (de conversa ${conversationId})`);
        io.to(workspaceId).emit(eventType, payload);
      } else {
        // Se não tiver workspaceId, enviar para todos (fallback)
        console.log(`[Redis] Enviando evento ${eventType} para todos (broadcast) - conversa sem workspace_id`);
        io.emit(eventType, payload);
      }
    }
    else {
      console.log(`[Redis] Canal ${channel} não reconhecido, enviando broadcast`);
      io.emit(eventType, payload);
    }
  } 
  catch (err) {
    console.error(`[Redis] Erro ao processar mensagem: ${err}`);
    console.error(`[Redis] Mensagem original: ${message}`);
  }
});

// Listener para mensagens em canais com padrão (psubscribe)
redisSubscriber.on('pmessage', (pattern, channel, message) => {
  console.log(`[Redis] Mensagem recebida no canal ${channel} (padrão ${pattern})`);
  
  try {
    // Analisar a mensagem JSON
    const data = JSON.parse(message);
    
    // Determinar o tipo de evento e payload
    const eventType = data.type || 'update';
    const payload = data.payload || data;
    
    console.log(`[Redis] Evento ${eventType} em ${channel} (padrão ${pattern})`);
    
    // Mesmo processamento que a função message acima
    if (channel.startsWith(WORKSPACE_CHANNEL_PREFIX)) {
      const workspaceId = channel.split(':')[1];
      console.log(`[Redis] Enviando evento ${eventType} para workspace ${workspaceId}`);
      io.to(workspaceId).emit(eventType, payload);
    } 
    else if (channel.startsWith('chat-updates:')) {
      const conversationId = channel.split(':')[1];
      console.log(`[Redis] Mensagem para conversa ${conversationId}`);
      
      if (payload && payload.workspace_id) {
        const workspaceId = payload.workspace_id;
        console.log(`[Redis] Enviando evento ${eventType} para workspace ${workspaceId} (de conversa ${conversationId})`);
        io.to(workspaceId).emit(eventType, payload);
      } else {
        console.log(`[Redis] Enviando evento ${eventType} para todos (broadcast) - conversa sem workspace_id`);
        io.emit(eventType, payload);
      }
    }
    else {
      console.log(`[Redis] Canal ${channel} não reconhecido, enviando broadcast`);
      io.emit(eventType, payload);
    }
  }
  catch (err) {
    console.error(`[Redis] Erro ao processar mensagem: ${err}`);
    console.error(`[Redis] Mensagem original: ${message}`);
  }
});

// Evento de conexão
io.on('connection', (socket) => {
  console.log(`Cliente conectado: ${socket.id}`);
  
  // Enviar evento de boas-vindas
  socket.emit('welcome', { message: 'Bem-vindo ao servidor WebSocket!' });

  // Ping/Pong
  socket.on('ping', (callback) => {
    console.log(`Ping recebido de ${socket.id}`);
    
    // Se for uma função de callback, responder com timestamp
    if (typeof callback === 'function') {
      callback({ timestamp: new Date().toISOString() });
    } else {
      // Se não for uma função, enviar evento pong
      socket.emit('pong', { timestamp: new Date().toISOString() });
    }
  });

  // Entrar em uma sala (workspace)
  socket.on('join_workspace', (workspaceId) => {
    if (!workspaceId) {
      socket.emit('error', 'Workspace ID é obrigatório');
      return;
    }

    console.log(`Cliente ${socket.id} entrando no workspace ${workspaceId}`);
    
    // Sair de todas as salas existentes primeiro
    if (socket.rooms) {
      const roomsToLeave = Array.from(socket.rooms)
        .filter(room => room !== socket.id);
      
      roomsToLeave.forEach(room => {
        socket.leave(room);
        
        // Também atualizar o nosso controle manual de salas
        if (workspaceRooms.has(room)) {
          const clients = workspaceRooms.get(room);
          if (clients) {
            clients.delete(socket.id);
            if (clients.size === 0) {
              workspaceRooms.delete(room);
            }
          }
        }
      });
    }

    // Entrar na nova sala
    socket.join(workspaceId);
    
    // Assinar no canal Redis para este workspace
    const workspaceChannel = `${WORKSPACE_CHANNEL_PREFIX}${workspaceId}`;
    subscribeToRedisChannel(workspaceChannel);
    
    // Também assinar em canais gerais de conversas
    subscribeToRedisChannel(CONVERSATION_CHANNEL_PATTERN);
    
    // Atualizar nosso controle manual
    if (!workspaceRooms.has(workspaceId)) {
      workspaceRooms.set(workspaceId, new Set());
    }
    const clients = workspaceRooms.get(workspaceId);
    if (clients) {
      clients.add(socket.id);
    }

    // Confirmar que entrou na sala
    socket.emit('workspace_joined', workspaceId);
    
    // Enviar evento de teste após 2 segundos
    setTimeout(() => {
      socket.emit('test_event', { 
        message: 'Isto é um evento de teste!',
        timestamp: new Date().toISOString()
      });
    }, 2000);
  });

  // Desconexão
  socket.on('disconnect', (reason) => {
    console.log(`Cliente desconectado: ${socket.id}, razão: ${reason}`);
    
    // Limpar cliente de todas as salas no nosso controle manual
    workspaceRooms.forEach((clients, room) => {
      if (clients.has(socket.id)) {
        clients.delete(socket.id);
        if (clients.size === 0) {
          workspaceRooms.delete(room);
        }
      }
    });
    
    // Nota: Não precisamos cancelar assinaturas Redis aqui
    // pois outros clientes podem ainda estar usando esses canais
  });
});

// Iniciar o servidor
httpServer.listen(PORT, () => {
  console.log(`🚀 Servidor WebSocket simplificado rodando na porta ${PORT}`);
  console.log(`📝 Verificação de status disponível em http://localhost:${PORT}/status`);
  console.log(`📡 Integração Redis ativada para notificações em tempo real`);
  
  // Iniciar com assinaturas Redis
  setTimeout(() => {
    checkRedisSubscriptions();
  }, 1000);
});

// Tratamento de erros do servidor HTTP
httpServer.on('error', (err) => {
  console.error('Erro no servidor HTTP:', err);
});

// Tratamento de exceções não capturadas
process.on('uncaughtException', (err) => {
  console.error('Exceção não capturada:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Rejeição não tratada:', promise, 'razão:', reason);
});

// Limpeza ao encerrar
process.on('SIGINT', async () => {
  console.log('\nEncerrando servidor WebSocket graciosamente...');
  
  try {
    // Fechar conexão Redis
    await redisSubscriber.quit();
    console.log('Conexão Redis fechada com sucesso');
    
    // Fechar servidor HTTP/Socket.IO
    httpServer.close(() => {
      console.log('Servidor HTTP/Socket.IO fechado com sucesso');
      process.exit(0);
    });
  } catch (err) {
    console.error('Erro ao encerrar servidor:', err);
    process.exit(1);
  }
}); 