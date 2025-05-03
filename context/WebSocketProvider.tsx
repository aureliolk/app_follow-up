// context/WebSocketProvider.tsx

'use client';

import React, {
    createContext,
    useContext,
    useState,
    useCallback,
    ReactNode,
    useMemo,
    useEffect,
    useRef
} from 'react';
import type { Message } from '@/app/types';
import { useWorkspace } from '@/context/workspace-context';
import { io, Socket } from 'socket.io-client';
import { toast } from 'react-hot-toast';
import { useConversationContext } from './ConversationContext'; 

// --- Tipagem MÍNIMA do Contexto WebSocket ---
interface WebSocketContextType {
    isConnected: boolean;
    lastPing: string | null;
    manualConnect: () => void;
    connectionAttempts: number;
}

// --- Criação do Contexto WebSocket ---
const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

// URL fixa do servidor WebSocket
const SOCKET_SERVER_URL = 'http://localhost:3001';

// --- Componente Provider WebSocket ---
export const WebSocketProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const workspaceContext = useWorkspace();
    const conversationCtx = useConversationContext();
    
    // Use optional chaining safely when accessing handlers
    const handleRealtimeNewMessage = conversationCtx?.handleRealtimeNewMessage;
    const handleRealtimeStatusUpdate = conversationCtx?.handleRealtimeStatusUpdate;
    
    // Estado do WebSocket
    const [isConnected, setIsConnected] = useState(false);
    const [connectionError, setConnectionError] = useState<string | null>(null);
    const [lastPing, setLastPing] = useState<string | null>(null);
    const [connectionAttempts, setConnectionAttempts] = useState(0);
    
    // Referências para evitar dependências circulares e loops
    const socketRef = useRef<Socket | null>(null);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const workspaceIdRef = useRef<string | null>(null);
    const attemptsRef = useRef<number>(0);
    
    // Atualizar workspaceId na ref sempre que mudar
    useEffect(() => {
        workspaceIdRef.current = workspaceContext.workspace?.id || null;
    }, [workspaceContext.workspace?.id]);

    // Função para testar a conexão com um ping
    const pingServer = useCallback(() => {
        const socket = socketRef.current;
        if (socket && isConnected) {
            console.log('[WebSocketProvider] Enviando ping para o servidor');
            socket.emit('ping', (response: { timestamp: string }) => {
                console.log('[WebSocketProvider] Resposta do ping:', response);
                setLastPing(response.timestamp);
            });
        }
    }, [isConnected]);

    // Configurar ping automático quando conectado
    useEffect(() => {
        let pingInterval: NodeJS.Timeout;
        
        if (isConnected && socketRef.current) {
            pingInterval = setInterval(pingServer, 30000); // A cada 30 segundos
        }
        
        return () => {
            if (pingInterval) clearInterval(pingInterval);
        };
    }, [isConnected, pingServer]);

    // Limpar timeout de reconexão ao desmontar
    useEffect(() => {
        return () => {
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
                reconnectTimeoutRef.current = null;
            }
        };
    }, []);

    // Função de limpeza e desconexão
    const cleanupSocket = useCallback(() => {
        const socket = socketRef.current;
        if (socket) {
            // Remover todos os listeners para evitar duplicação
            socket.off('connect');
            socket.off('disconnect');
            socket.off('connect_error');
            socket.off('error');
            socket.off('welcome');
            socket.off('pong');
            socket.off('workspace_joined');
            socket.off('test_event');
            socket.off('new_message');
            socket.off('message_status_updated');
            
            // Desconectar
            socket.disconnect();
            socketRef.current = null;
        }
    }, []);

    // Função para tentar reconexão automática
    const scheduleReconnect = useCallback((delay: number = 5000) => {
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
        }
        
        console.log(`[WebSocketProvider] Agendando reconexão em ${delay}ms`);
        reconnectTimeoutRef.current = setTimeout(() => {
            console.log('[WebSocketProvider] Tentando reconexão automática');
            
            // Chamando função interna para evitar loop
            doConnectToWebSocket();
        }, delay);
    }, []);

    // Função interna para conectar (sem dependências para evitar loops)
    const doConnectToWebSocket = useCallback(function connectToWebSocketInternal() {
        // Limpar qualquer socket existente
        cleanupSocket();
        
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
        }
        
        const workspaceId = workspaceIdRef.current;
        if (!workspaceId) {
            console.log('[WebSocketProvider] Workspace ID indisponível, não pode conectar');
            return;
        }

        // Incrementar contador na ref em vez do estado
        attemptsRef.current += 1;
        
        // Sincronizar o estado com a ref (depois que a operação estiver concluída)
        setConnectionAttempts(attemptsRef.current);
        
        console.log(`[WebSocketProvider] Tentativa de conexão #${attemptsRef.current} para workspace: ${workspaceId}`);
        
        try {
            // Criar nova conexão Socket.IO
            const socket = io(SOCKET_SERVER_URL, {
                transports: ['websocket', 'polling'],
                reconnectionAttempts: 5,
                reconnectionDelay: 3000,
                timeout: 15000,
                forceNew: true,
                // Desativar reconnect automático do Socket.IO (gerenciamos manualmente)
                reconnection: false
            });
            
            socketRef.current = socket;
            
            // Evento de conexão bem-sucedida
            socket.on('connect', () => {
                console.log(`[WebSocketProvider] Conectado com ID: ${socket.id}`);
                setIsConnected(true);
                setConnectionError(null);
                
                // Entrar na sala do workspace
                socket.emit('join_workspace', workspaceId);
                
                // Ping inicial
                setTimeout(() => {
                    if (socketRef.current) {
                        const socket = socketRef.current;
                        socket.emit('ping', (response: { timestamp: string }) => {
                            setLastPing(response.timestamp);
                        });
                    }
                }, 1000);
            });
            
            // Eventos de confirmação
            socket.on('welcome', (data: { message: string }) => {
                console.log(`[WebSocketProvider] Mensagem de boas-vindas: ${data.message}`);
            });
            
            socket.on('workspace_joined', (joinedWorkspaceId: string) => {
                console.log(`[WebSocketProvider] Confirmação: Entrou na sala ${joinedWorkspaceId}`);
                // Sucesso completo na conexão - resetar contador de tentativas
                attemptsRef.current = 0;
                setConnectionAttempts(0);
            });
            
            // Resposta de ping
            socket.on('pong', (data: { timestamp: string }) => {
                setLastPing(data.timestamp);
            });
            
            // Eventos de dados em tempo real
            if (typeof handleRealtimeNewMessage === 'function') {
                socket.on('new_message', handleRealtimeNewMessage);
            }
            
            if (typeof handleRealtimeStatusUpdate === 'function') {
                socket.on('message_status_updated', handleRealtimeStatusUpdate);
            }
            
            // Eventos de teste
            socket.on('test_event', (data: any) => {
                console.log(`[WebSocketProvider] Evento de teste:`, data);
            });
            
            // Eventos de erro e desconexão
            socket.on('connect_error', (err: Error) => {
                console.error('[WebSocketProvider] Erro de conexão:', err.message);
                setConnectionError(err.message);
                setIsConnected(false);
                
                // Tentar novamente com backoff exponencial
                const delay = Math.min(5000 * Math.pow(1.5, Math.min(attemptsRef.current, 5)), 30000);
                scheduleReconnect(delay);
            });
            
            socket.on('disconnect', (reason: string) => {
                console.log(`[WebSocketProvider] Desconectado. Razão: ${reason}`);
                setIsConnected(false);
                
                if (reason === 'io server disconnect' || reason === 'transport close') {
                    // Desconexão pelo servidor ou por erro de transporte - tentar reconectar
                    scheduleReconnect(3000);
                }
            });
            
            socket.on('error', (errorMessage: string) => {
                console.error('[WebSocketProvider] Erro recebido:', errorMessage);
                toast.error(`Erro na conexão: ${errorMessage}`);
            });
            
        } catch (err) {
            console.error('[WebSocketProvider] Erro ao inicializar Socket.IO:', err);
            setConnectionError(err instanceof Error ? err.message : 'Erro desconhecido');
            setIsConnected(false);
            scheduleReconnect();
        }
    }, [cleanupSocket, handleRealtimeNewMessage, handleRealtimeStatusUpdate, scheduleReconnect]);

    // Expõe conectToWebSocket como função pública
    const connectToWebSocket = useCallback(() => {
        doConnectToWebSocket();
    }, [doConnectToWebSocket]);

    // Iniciar conexão quando o workspace estiver disponível
    useEffect(() => {
        const workspaceId = workspaceContext.workspace?.id;
        if (workspaceId) {
            console.log('[WebSocketProvider] Workspace disponível, iniciando conexão...');
            // Reiniciar contador de tentativas
            attemptsRef.current = 0;
            setConnectionAttempts(0);
            doConnectToWebSocket();
        }

        // Limpar na desmontagem
        return () => {
            console.log('[WebSocketProvider] Limpando recursos');
            cleanupSocket();
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
            }
        };
    }, [workspaceContext.workspace?.id, doConnectToWebSocket, cleanupSocket]);

    // Valor do contexto
    const contextValue = useMemo(() => ({
        isConnected,
        lastPing,
        manualConnect: connectToWebSocket,
        connectionAttempts
    }), [isConnected, lastPing, connectToWebSocket, connectionAttempts]);

    return (
        <WebSocketContext.Provider value={contextValue}>
            {connectionError && process.env.NODE_ENV === 'development' && (
                <div className="fixed bottom-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded z-50" role="alert">
                    <strong className="font-bold">Erro de WebSocket:</strong>
                    <span className="block sm:inline"> {connectionError}</span>
                    <span className="block text-xs mt-1">Tentativa {connectionAttempts}/5</span>
                    <div className="mt-2 flex space-x-2">
                        <button 
                            onClick={connectToWebSocket} 
                            className="px-3 py-1 text-xs font-semibold bg-red-200 hover:bg-red-300 rounded"
                        >
                            Reconectar agora
                        </button>
                        <button 
                            onClick={() => window.location.reload()} 
                            className="px-3 py-1 text-xs font-semibold bg-red-200 hover:bg-red-300 rounded"
                        >
                            Recarregar página
                        </button>
                    </div>
                </div>
            )}
            {children}
        </WebSocketContext.Provider>
    );
};

// --- Hook Customizado (WebSocket) ---
export const useWebSocket = (): WebSocketContextType => {
    const context = useContext(WebSocketContext);
    if (context === undefined) {
        throw new Error('useWebSocket must be used within a WebSocketProvider');
    }
    return context;
};

