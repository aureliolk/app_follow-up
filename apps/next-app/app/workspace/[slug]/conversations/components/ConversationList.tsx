// apps/next-app/app/workspace/[slug]/conversations/components/ConversationList.tsx
'use client';

// Importar o tipo (ou definir localmente se preferir)
interface FormattedConversation {
    id: string;
    status: string;
    lastActivity: string;
    client: { id: string; name: string | null; phone_number: string | null } | null;
    lastMessageSnippet: string;
    isAiActive: boolean;
}

interface ConversationListProps {
  conversations: FormattedConversation[]; // <-- Usar tipo específico
  onSelectConversation: (id: string) => void;
  selectedConversationId: string | null;
}

export default function ConversationList({ conversations, onSelectConversation, selectedConversationId }: ConversationListProps) {
  if (conversations.length === 0) {
    return <div className="p-4 text-center text-sm text-muted-foreground">Nenhuma conversa encontrada.</div>;
  }

  return (
    <div className="h-full overflow-y-auto border-r border-border">
      {/* Adicionar um cabeçalho para a lista */}
      <div className="p-3 border-b border-border text-sm font-semibold text-foreground">
        Conversas ({conversations.length})
      </div>
      <ul>
        {conversations.map((conv) => (
          <li key={conv.id}>
            <button
              onClick={() => onSelectConversation(conv.id)}
              className={`w-full text-left p-3 border-b border-border/50 hover:bg-accent transition-colors duration-100 ${selectedConversationId === conv.id ? 'bg-muted hover:bg-muted' : ''}`}
            >
              <div className="flex justify-between items-center mb-1">
                <span className="font-medium text-foreground text-sm truncate pr-2">
                  {conv.client?.name || conv.client?.phone_number || `Conversa ${conv.id.substring(0, 6)}`}
                </span>
                <span className="text-xs text-muted-foreground flex-shrink-0">{conv.lastActivity}</span>
              </div>
              <p className="text-xs text-muted-foreground truncate">
                {conv.lastMessageSnippet}
              </p>
              {/* Opcional: Mostrar status da conversa/follow-up aqui */}
              {/* <div className="mt-1 text-right">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] ${conv.status === 'ACTIVE' ? 'bg-green-500/20 text-green-400' : 'bg-slate-500/20 text-slate-400'}`}>
                      {conv.status}
                  </span>
              </div> */}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}