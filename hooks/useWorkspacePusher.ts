import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import Pusher, { Channel } from 'pusher-js';
import { toast } from '@/hooks/use-toast';

export interface PusherHandlers {
  onNewMessage?: (message: any) => void;
  onStatusUpdate?: (data: any) => void;
  onAIStatusUpdate?: (data: any) => void;
}

export function useWorkspacePusher(
  workspaceId: string | null | undefined,
  handlers: PusherHandlers = {}
) {
  const [config, setConfig] = useState<{ pusherKey: string; pusherCluster: string } | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [isConnected, setIsConnected] = useState(false);

  const pusherRef = useRef<Pusher | null>(null);
  const channelRef = useRef<Channel | null>(null);

  useEffect(() => {
    setLoadingConfig(true);
    axios
      .get<{ pusherKey: string; pusherCluster: string }>('/api/config')
      .then(res => setConfig(res.data))
      .catch(err => {
        console.error('[useWorkspacePusher] Error fetching config:', err);
        toast.error('Erro ao carregar configuração real-time');
        setConfig(null);
      })
      .finally(() => setLoadingConfig(false));
  }, []);

  useEffect(() => {
    if (loadingConfig || !config) return;

    const cleanup = () => {
      if (channelRef.current) {
        try {
          channelRef.current.unbind_all();
        } catch (e) {
          console.warn('[useWorkspacePusher] Error unbinding channel', e);
        }
      }
      if (pusherRef.current) {
        pusherRef.current.disconnect();
      }
      channelRef.current = null;
      pusherRef.current = null;
      setIsConnected(false);
    };

    if (!workspaceId) {
      cleanup();
      return;
    }

    try {
      const pusher = new Pusher(config.pusherKey, {
        cluster: config.pusherCluster,
        authEndpoint: '/api/pusher/auth',
        forceTLS: true,
      });

      pusher.connection.bind('connected', () => setIsConnected(true));
      pusher.connection.bind('disconnected', () => setIsConnected(false));
      pusher.connection.bind('error', () => setIsConnected(false));

      const channelName = `private-workspace-${workspaceId}`;
      const channel = pusher.subscribe(channelName);

      channel.bind('pusher:subscription_error', () => {
        setIsConnected(false);
        toast.error('Falha ao conectar ao canal');
      });

      if (handlers.onNewMessage) {
        channel.bind('new_message', (data: any) => {
          try {
            const parsed = typeof data === 'string' ? JSON.parse(data) : data;
            if (parsed?.payload) handlers.onNewMessage!(parsed.payload);
          } catch (err) {
            console.error('[useWorkspacePusher] Error parsing new_message', err);
          }
        });
      }

      if (handlers.onStatusUpdate) {
        channel.bind('message_status_update', (data: any) => {
          try {
            const parsed = typeof data === 'string' ? JSON.parse(data) : data;
            if (parsed?.payload) handlers.onStatusUpdate!(parsed.payload);
          } catch (err) {
            console.error('[useWorkspacePusher] Error parsing status_update', err);
          }
        });
      }

      if (handlers.onAIStatusUpdate) {
        channel.bind('ai_status_updated', (data: any) => {
          try {
            const parsed = typeof data === 'string' ? JSON.parse(data) : data;
            if (parsed?.payload) handlers.onAIStatusUpdate!(parsed.payload);
          } catch (err) {
            console.error('[useWorkspacePusher] Error parsing ai_status_updated', err);
          }
        });
      }

      pusherRef.current = pusher;
      channelRef.current = channel;
    } catch (err) {
      console.error('[useWorkspacePusher] Failed to initialize Pusher:', err);
      toast.error('Erro ao inicializar conexão real-time');
      cleanup();
    }

    return cleanup;
  }, [workspaceId, config, loadingConfig, handlers.onNewMessage, handlers.onStatusUpdate, handlers.onAIStatusUpdate]);

  return { isConnected, loadingConfig };
}

export default useWorkspacePusher;
