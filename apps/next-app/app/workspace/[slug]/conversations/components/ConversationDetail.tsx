// apps/next-app/app/workspace/[slug]/conversations/components/ConversationDetail.tsx
'use client';

interface ConversationDetailProps {
  conversationId: string | null;
}

export default function ConversationDetail({ conversationId }: ConversationDetailProps) {
  if (!conversationId) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        Selecione uma conversa para ver os detalhes.
      </div>
    );
  }

  // Aqui carregaremos e exibiremos as mensagens e controles no futuro
  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-border">
        Detalhes da Conversa: {conversationId.substring(0, 6)}...
        {/* TODO: Adicionar nome do cliente, status, botões de ação */}
      </div>
      <div className="flex-grow overflow-y-auto p-4">
        {/* TODO: Exibir histórico de mensagens */}
        Histórico de mensagens aqui...
      </div>
      <div className="p-4 border-t border-border">
        {/* TODO: Input para enviar mensagem manual (se necessário) */}
        Input de mensagem aqui...
      </div>
    </div>
  );
}