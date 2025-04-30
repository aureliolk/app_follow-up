# Guia de Implementação: Dashboard, Pipeline e Integrações

Este guia fornece instruções detalhadas para implementar as funcionalidades de Dashboard, Pipeline (Kanban) e Integrações no seu aplicativo Next.js existente.

## 1. Modificações no Schema Prisma

### 1.1 Adicionar Enums Necessários

Adicione os seguintes enums ao seu schema.prisma:

```prisma
enum DealSource {
  WEBSITE
  LINKEDIN
  GOOGLE_ADS
  FACEBOOK_ADS
  REFERRAL
  EMAIL_MARKETING
  COLD_CALL
  EVENT
  IMPORT
  MANUAL
  OTHER
}

enum TaskStatus {
  PENDING
  COMPLETED
  CANCELLED
}

enum ActivitySource {
  AI
  USER
  SYSTEM
}

enum IntegrationType {
  WHATSAPP_CLOUD
  WHATSAPP_EVOLUTION
  EMAIL_SMTP
  EMAIL_GMAIL
  PHONE_TWILIO
  CALENDAR_GOOGLE
  PAYMENT_STRIPE
  SOCIAL_FACEBOOK
  SOCIAL_INSTAGRAM
  CRM_HUBSPOT
  OTHER
}
```

### 1.2 Adicionar Modelos para Pipeline e Integrações

Adicione os seguintes modelos ao seu schema.prisma no `workspace_schema`:

```prisma
// Modelo para Etapas do Pipeline (Kanban)
model PipelineStage {
  id           String    @id @default(uuid())
  name         String
  color        String    @default("#cccccc") // Cor padrão para a coluna
  order        Int       // Ordem da coluna no Kanban
  workspace_id String
  workspace    Workspace @relation(fields: [workspace_id], references: [id], onDelete: Cascade)
  createdAt    DateTime  @default(now()) @map("created_at")
  updatedAt    DateTime  @updatedAt @map("updated_at")

  deals Deal[] // Relação com as Negociações/Deals
  rules PipelineRule[] // Relação com as Regras de Automação

  @@index([workspace_id, order])
  @@map("pipeline_stages")
  @@schema("workspace_schema")
}

// Modelo para Negociações/Deals (Cards do Kanban)
model Deal {
  id                String          @id @default(uuid())
  name              String
  value             Float?          // Valor estimado da negociação
  probability       Float?          @default(0) // Probabilidade de fechamento (0 a 1)
  expectedCloseDate DateTime?       @map("expected_close_date") // Data esperada de fechamento
  source            DealSource?     // Origem do lead/negociação
  workspace_id      String
  workspace         Workspace       @relation(fields: [workspace_id], references: [id], onDelete: Cascade)
  client_id         String          // Relacionado ao Cliente existente
  client            Client          @relation(fields: [client_id], references: [id], onDelete: Cascade)
  stage_id          String
  stage             PipelineStage   @relation(fields: [stage_id], references: [id])
  assigned_to_id    String?         // ID do usuário responsável
  assignedTo        User?           @relation("UserDeals", fields: [assigned_to_id], references: [id], onDelete: SetNull)
  ai_controlled     Boolean         @default(true) @map("ai_controlled") // Se a IA está controlando
  createdAt         DateTime        @default(now()) @map("created_at")
  updatedAt         DateTime        @updatedAt @map("updated_at")

  notes        DealNote[]        // Notas da negociação
  tasks        DealTask[]        // Tarefas da negociação
  documents    DealDocument[]    // Documentos da negociação
  activityLogs DealActivityLog[] // Log de atividades da negociação

  @@index([workspace_id])
  @@index([client_id])
  @@index([stage_id])
  @@index([assigned_to_id])
  @@map("deals")
  @@schema("workspace_schema")
}

// Modelo para Notas da Negociação
model DealNote {
  id         String   @id @default(uuid())
  content    String   @db.Text
  deal_id    String
  deal       Deal     @relation(fields: [deal_id], references: [id], onDelete: Cascade)
  author_id  String   // ID do usuário que criou a nota
  author     User     @relation("UserDealNotes", fields: [author_id], references: [id])
  createdAt  DateTime @default(now()) @map("created_at")
  updatedAt  DateTime @updatedAt @map("updated_at")

  @@index([deal_id])
  @@index([author_id])
  @@map("deal_notes")
  @@schema("workspace_schema")
}

// Modelo para Tarefas da Negociação
model DealTask {
  id           String     @id @default(uuid())
  title        String
  description  String?    @db.Text
  dueDate      DateTime?  @map("due_date")
  status       TaskStatus @default(PENDING)
  deal_id      String
  deal         Deal       @relation(fields: [deal_id], references: [id], onDelete: Cascade)
  assignedToId String?    @map("assigned_to_id") // ID do usuário responsável
  assignedTo   User?      @relation("UserDealTasks", fields: [assignedToId], references: [id], onDelete: SetNull)
  createdAt    DateTime   @default(now()) @map("created_at")
  updatedAt    DateTime   @updatedAt @map("updated_at")

  @@index([deal_id])
  @@index([assignedToId])
  @@index([status])
  @@map("deal_tasks")
  @@schema("workspace_schema")
}

// Modelo para Documentos da Negociação
model DealDocument {
  id           String   @id @default(uuid())
  name         String
  type         String   // Ex: pdf, docx, jpg
  size         Int      // Tamanho em bytes
  url          String   // URL do arquivo (S3, GCS, etc.)
  deal_id      String
  deal         Deal     @relation(fields: [deal_id], references: [id], onDelete: Cascade)
  uploadedById String   @map("uploaded_by_id") // ID do usuário que fez upload
  uploadedBy   User     @relation("UserDealDocuments", fields: [uploadedById], references: [id])
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  @@index([deal_id])
  @@index([uploadedById])
  @@map("deal_documents")
  @@schema("workspace_schema")
}

// Modelo para Log de Atividades da Negociação
model DealActivityLog {
  id        String         @id @default(uuid())
  action    String         // Ex: "Nota Adicionada", "Email Enviado", "Estágio Alterado"
  message   String         @db.Text
  deal_id   String
  deal      Deal           @relation(fields: [deal_id], references: [id], onDelete: Cascade)
  user_id   String?        // ID do usuário que realizou a ação (se aplicável)
  user      User?          @relation("UserDealActivityLogs", fields: [user_id], references: [id], onDelete: SetNull)
  source    ActivitySource @default(AI) // AI, USER, SYSTEM
  createdAt DateTime       @default(now()) @map("created_at")

  @@index([deal_id])
  @@index([user_id])
  @@map("deal_activity_logs")
  @@schema("workspace_schema")
}

// Modelo Genérico para Integrações
model Integration {
  id           String          @id @default(uuid())
  name         String          // Nome da integração (ex: "WhatsApp Cloud API", "Gmail")
  type         IntegrationType // Tipo da integração
  config       Json            // Configurações específicas (API Keys, tokens, etc.)
  is_active    Boolean         @default(true) @map("is_active")
  workspace_id String
  workspace    Workspace       @relation(fields: [workspace_id], references: [id], onDelete: Cascade)
  createdAt    DateTime        @default(now()) @map("created_at")
  updatedAt    DateTime        @updatedAt @map("updated_at")

  @@index([workspace_id, type])
  @@map("integrations")
  @@schema("workspace_schema")
}

// Modelo para Regras de Automação do Pipeline
model PipelineRule {
  id          String        @id @default(uuid())
  name        String
  description String?       @db.Text
  condition   String        @db.Text // Lógica da condição (pode ser JSON ou DSL)
  action      String        @db.Text // Ação a ser executada (pode ser JSON ou DSL)
  stage_id    String        // Etapa do pipeline onde a regra se aplica
  stage       PipelineStage @relation(fields: [stage_id], references: [id], onDelete: Cascade)
  is_active   Boolean       @default(true) @map("is_active")
  createdAt   DateTime      @default(now()) @map("created_at")
  updatedAt   DateTime      @updatedAt @map("updated_at")

  @@index([stage_id])
  @@map("pipeline_rules")
  @@schema("workspace_schema")
}
```

### 1.3 Modificar Modelos Existentes

Adicione as seguintes relações aos modelos existentes:

```prisma
// Adicionar ao modelo User (workspace_schema)
model User {
  // ... campos existentes ...
  
  // Adicionar estas relações
  assignedDeals       Deal[]            @relation("UserDeals")
  dealNotes           DealNote[]        @relation("UserDealNotes")
  dealTasks           DealTask[]        @relation("UserDealTasks")
  dealDocuments       DealDocument[]    @relation("UserDealDocuments")
  dealActivityLogs    DealActivityLog[] @relation("UserDealActivityLogs")
  
  // ... outras relações existentes ...
}

// Adicionar ao modelo Client (conversation_schema)
model Client {
  // ... campos existentes ...
  
  // Adicionar esta relação
  deals Deal[]
  
  // ... outras relações existentes ...
}

// Adicionar ao modelo Workspace (workspace_schema)
model Workspace {
  // ... campos existentes ...
  
  // Adicionar estas relações
  pipelineStages PipelineStage[]
  integrations   Integration[]
  deals          Deal[]
  
  // ... outras relações existentes ...
}
```

## 2. Migração do Banco de Dados

Após modificar o schema.prisma, execute os seguintes comandos para aplicar as alterações ao banco de dados:

```bash
# Gerar a migração
npx prisma migrate dev --name add_pipeline_and_integrations

# Atualizar o cliente Prisma
npx prisma generate
```

## 3. Implementação do Frontend

### 3.1 Estrutura de Diretórios

Crie a seguinte estrutura de diretórios para as novas funcionalidades:

```
src/
├── app/
│   ├── dashboard/
│   │   └── page.tsx
│   ├── pipeline/
│   │   ├── page.tsx
│   │   ├── [id]/
│   │   │   └── page.tsx
│   │   └── settings/
│   │       └── page.tsx
│   └── integrations/
│       └── page.tsx
├── components/
│   ├── dashboard/
│   │   ├── DashboardStats.tsx
│   │   ├── DealsByStageChart.tsx
│   │   └── RecentActivityList.tsx
│   ├── pipeline/
│   │   ├── KanbanBoard.tsx
│   │   ├── KanbanColumn.tsx
│   │   ├── DealCard.tsx
│   │   ├── DealDetail.tsx
│   │   ├── DealForm.tsx
│   │   ├── NoteForm.tsx
│   │   └── TaskForm.tsx
│   └── integrations/
│       ├── IntegrationsList.tsx
│       ├── IntegrationForm.tsx
│       └── integration-types/
│           ├── WhatsAppIntegration.tsx
│           ├── EmailIntegration.tsx
│           └── PhoneIntegration.tsx
└── lib/
    ├── api/
    │   ├── pipeline.ts
    │   └── integrations.ts
    └── hooks/
        ├── usePipeline.ts
        └── useIntegrations.ts
```

### 3.2 Componentes Principais

#### Dashboard (src/app/dashboard/page.tsx)

```tsx
import { Suspense } from 'react';
import DashboardStats from '@/components/dashboard/DashboardStats';
import DealsByStageChart from '@/components/dashboard/DealsByStageChart';
import RecentActivityList from '@/components/dashboard/RecentActivityList';

export default function DashboardPage() {
  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Dashboard</h1>
      
      <Suspense fallback={<div>Carregando estatísticas...</div>}>
        <DashboardStats />
      </Suspense>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
        <Suspense fallback={<div>Carregando gráfico...</div>}>
          <DealsByStageChart />
        </Suspense>
        
        <Suspense fallback={<div>Carregando atividades recentes...</div>}>
          <RecentActivityList />
        </Suspense>
      </div>
    </div>
  );
}
```

#### Pipeline Kanban (src/app/pipeline/page.tsx)

```tsx
import { Suspense } from 'react';
import KanbanBoard from '@/components/pipeline/KanbanBoard';
import Link from 'next/link';

export default function PipelinePage() {
  return (
    <div className="container-fluid p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Pipeline de Vendas</h1>
        <div className="flex gap-2">
          <Link 
            href="/pipeline/settings" 
            className="px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300"
          >
            Configurações
          </Link>
          <button 
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Nova Negociação
          </button>
        </div>
      </div>
      
      <Suspense fallback={<div>Carregando pipeline...</div>}>
        <KanbanBoard />
      </Suspense>
    </div>
  );
}
```

#### Configuração do Pipeline (src/app/pipeline/settings/page.tsx)

```tsx
import { Suspense } from 'react';
import { getPipelineStages } from '@/lib/api/pipeline';
import Link from 'next/link';

export default async function PipelineSettingsPage() {
  const stages = await getPipelineStages();
  
  return (
    <div className="container mx-auto p-6">
      <div className="flex items-center mb-6">
        <Link href="/pipeline" className="mr-4">
          ← Voltar para Pipeline
        </Link>
        <h1 className="text-3xl font-bold">Configurações do Pipeline</h1>
      </div>
      
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">Etapas do Pipeline</h2>
        
        <div className="mb-6">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Nome</th>
                <th className="text-left py-2">Cor</th>
                <th className="text-left py-2">Ordem</th>
                <th className="text-right py-2">Ações</th>
              </tr>
            </thead>
            <tbody>
              {stages.map((stage) => (
                <tr key={stage.id} className="border-b">
                  <td className="py-3">{stage.name}</td>
                  <td className="py-3">
                    <div 
                      className="w-6 h-6 rounded" 
                      style={{ backgroundColor: stage.color }}
                    />
                  </td>
                  <td className="py-3">{stage.order}</td>
                  <td className="py-3 text-right">
                    <button className="text-blue-600 hover:text-blue-800 mr-2">
                      Editar
                    </button>
                    <button className="text-red-600 hover:text-red-800">
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        <button className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
          Adicionar Etapa
        </button>
      </div>
      
      <div className="bg-white rounded-lg shadow p-6 mt-6">
        <h2 className="text-xl font-semibold mb-4">Regras de Automação</h2>
        
        {/* Conteúdo para regras de automação */}
        <button className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
          Adicionar Regra
        </button>
      </div>
    </div>
  );
}
```

#### Integrações (src/app/integrations/page.tsx)

```tsx
import { Suspense } from 'react';
import IntegrationsList from '@/components/integrations/IntegrationsList';

export default function IntegrationsPage() {
  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Integrações</h1>
      
      <Suspense fallback={<div>Carregando integrações...</div>}>
        <IntegrationsList />
      </Suspense>
    </div>
  );
}
```

### 3.3 Componentes do Kanban

#### KanbanBoard (src/components/pipeline/KanbanBoard.tsx)

```tsx
'use client';

import { useState, useEffect } from 'react';
import { DragDropContext, DropResult } from 'react-beautiful-dnd';
import KanbanColumn from './KanbanColumn';
import { getPipelineStages, getDeals, updateDealStage } from '@/lib/api/pipeline';

export default function KanbanBoard() {
  const [stages, setStages] = useState([]);
  const [deals, setDeals] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const stagesData = await getPipelineStages();
        const dealsData = await getDeals();
        
        // Organizar deals por stage_id
        const dealsByStage = {};
        stagesData.forEach(stage => {
          dealsByStage[stage.id] = dealsData.filter(deal => deal.stage_id === stage.id);
        });
        
        setStages(stagesData);
        setDeals(dealsByStage);
      } catch (error) {
        console.error('Erro ao carregar dados do pipeline:', error);
      } finally {
        setLoading(false);
      }
    }
    
    loadData();
  }, []);

  const handleDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result;
    
    // Se não houver destino ou o destino for o mesmo que a origem, não fazer nada
    if (!destination || 
        (destination.droppableId === source.droppableId && 
         destination.index === source.index)) {
      return;
    }
    
    // Atualizar estado localmente para UI responsiva
    const sourceStageDeals = [...deals[source.droppableId]];
    const destStageDeals = source.droppableId === destination.droppableId 
      ? sourceStageDeals 
      : [...deals[destination.droppableId]];
    
    // Remover da origem
    const [movedDeal] = sourceStageDeals.splice(source.index, 1);
    
    // Adicionar ao destino
    if (source.droppableId === destination.droppableId) {
      sourceStageDeals.splice(destination.index, 0, movedDeal);
    } else {
      destStageDeals.splice(destination.index, 0, movedDeal);
    }
    
    // Atualizar estado
    setDeals({
      ...deals,
      [source.droppableId]: sourceStageDeals,
      [destination.droppableId]: source.droppableId === destination.droppableId 
        ? sourceStageDeals 
        : destStageDeals
    });
    
    // Atualizar no servidor
    try {
      await updateDealStage(draggableId, destination.droppableId);
    } catch (error) {
      console.error('Erro ao atualizar estágio do deal:', error);
      // Reverter mudanças em caso de erro
      // Implementar lógica de reversão aqui
    }
  };

  if (loading) {
    return <div>Carregando pipeline...</div>;
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="flex overflow-x-auto pb-4 gap-4">
        {stages.map(stage => (
          <KanbanColumn 
            key={stage.id}
            stage={stage}
            deals={deals[stage.id] || []}
          />
        ))}
      </div>
    </DragDropContext>
  );
}
```

#### KanbanColumn (src/components/pipeline/KanbanColumn.tsx)

```tsx
'use client';

import { Droppable } from 'react-beautiful-dnd';
import DealCard from './DealCard';

export default function KanbanColumn({ stage, deals }) {
  return (
    <div 
      className="flex-shrink-0 w-80 bg-gray-100 rounded-lg shadow"
      style={{ borderTop: `4px solid ${stage.color}` }}
    >
      <div className="p-3 border-b bg-white rounded-t-lg">
        <div className="flex justify-between items-center">
          <h3 className="font-semibold">{stage.name}</h3>
          <span className="bg-gray-200 text-gray-700 rounded-full px-2 py-1 text-xs">
            {deals.length}
          </span>
        </div>
      </div>
      
      <Droppable droppableId={stage.id}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`min-h-[200px] p-2 ${
              snapshot.isDraggingOver ? 'bg-blue-50' : ''
            }`}
            style={{ height: 'calc(100vh - 220px)', overflowY: 'auto' }}
          >
            {deals.map((deal, index) => (
              <DealCard 
                key={deal.id} 
                deal={deal} 
                index={index} 
              />
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
      
      <div className="p-2 border-t bg-white rounded-b-lg">
        <button className="w-full text-gray-500 hover:text-gray-700 text-sm py-1">
          + Adicionar Negociação
        </button>
      </div>
    </div>
  );
}
```

#### DealCard (src/components/pipeline/DealCard.tsx)

```tsx
'use client';

import { useState } from 'react';
import { Draggable } from 'react-beautiful-dnd';
import Link from 'next/link';
import DealDetail from './DealDetail';

export default function DealCard({ deal, index }) {
  const [showDetail, setShowDetail] = useState(false);
  const [showNoteForm, setShowNoteForm] = useState(false);

  return (
    <>
      <Draggable draggableId={deal.id} index={index}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.draggableProps}
            {...provided.dragHandleProps}
            className={`bg-white p-3 rounded-md shadow mb-2 ${
              snapshot.isDragging ? 'shadow-lg' : ''
            }`}
            onClick={() => setShowDetail(true)}
          >
            <div className="flex justify-between items-start">
              <h4 className="font-medium">{deal.name}</h4>
              {deal.ai_controlled && (
                <span className="bg-blue-100 text-blue-800 text-xs px-1.5 py-0.5 rounded">
                  IA
                </span>
              )}
            </div>
            
            <div className="mt-2 text-sm text-gray-600">
              {deal.client?.name || 'Cliente não especificado'}
            </div>
            
            {deal.value && (
              <div className="mt-1 font-medium">
                {new Intl.NumberFormat('pt-BR', {
                  style: 'currency',
                  currency: 'BRL'
                }).format(deal.value)}
              </div>
            )}
            
            <div className="mt-2 flex justify-between items-center">
              <div className="flex items-center">
                {deal.notes?.length > 0 && (
                  <span className="mr-2 text-gray-500" title={`${deal.notes.length} notas`}>
                    <i className="fas fa-sticky-note"></i> {deal.notes.length}
                  </span>
                )}
                {deal.tasks?.length > 0 && (
                  <span className="text-gray-500" title={`${deal.tasks.length} tarefas`}>
                    <i className="fas fa-tasks"></i> {deal.tasks.length}
                  </span>
                )}
              </div>
              
              <button 
                className="text-gray-500 hover:text-blue-600"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowNoteForm(true);
                }}
              >
                <i className="fas fa-sticky-note"></i>
              </button>
            </div>
          </div>
        )}
      </Draggable>
      
      {showDetail && (
        <DealDetail 
          deal={deal} 
          onClose={() => setShowDetail(false)} 
        />
      )}
      
      {showNoteForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Adicionar Nota</h3>
            
            <textarea 
              className="w-full border rounded-md p-2 mb-4" 
              rows={4}
              placeholder="Digite sua nota aqui..."
            />
            
            <div className="flex justify-end gap-2">
              <button 
                className="px-4 py-2 bg-gray-200 rounded-md"
                onClick={() => setShowNoteForm(false)}
              >
                Cancelar
              </button>
              <button 
                className="px-4 py-2 bg-blue-600 text-white rounded-md"
                onClick={() => {
                  // Lógica para salvar a nota
                  setShowNoteForm(false);
                }}
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
```

### 3.4 API e Hooks

#### Pipeline API (src/lib/api/pipeline.ts)

```typescript
import { prisma } from '@/lib/prisma';

export async function getPipelineStages(workspaceId: string) {
  return prisma.pipelineStage.findMany({
    where: { workspace_id: workspaceId },
    orderBy: { order: 'asc' }
  });
}

export async function getDeals(workspaceId: string) {
  return prisma.deal.findMany({
    where: { workspace_id: workspaceId },
    include: {
      client: true,
      stage: true,
      assignedTo: true,
      notes: {
        orderBy: { createdAt: 'desc' }
      },
      tasks: {
        orderBy: { createdAt: 'desc' }
      }
    }
  });
}

export async function getDealById(dealId: string) {
  return prisma.deal.findUnique({
    where: { id: dealId },
    include: {
      client: true,
      stage: true,
      assignedTo: true,
      notes: {
        include: { author: true },
        orderBy: { createdAt: 'desc' }
      },
      tasks: {
        include: { assignedTo: true },
        orderBy: { dueDate: 'asc' }
      },
      documents: {
        include: { uploadedBy: true },
        orderBy: { createdAt: 'desc' }
      },
      activityLogs: {
        include: { user: true },
        orderBy: { createdAt: 'desc' },
        take: 20
      }
    }
  });
}

export async function createDeal(data) {
  return prisma.deal.create({
    data
  });
}

export async function updateDeal(dealId: string, data) {
  return prisma.deal.update({
    where: { id: dealId },
    data
  });
}

export async function updateDealStage(dealId: string, stageId: string) {
  return prisma.deal.update({
    where: { id: dealId },
    data: { 
      stage_id: stageId,
      // Registrar atividade
      activityLogs: {
        create: {
          action: 'Estágio Alterado',
          message: `Negociação movida para novo estágio`,
          source: 'USER',
          user_id: 'current-user-id' // Substituir pelo ID do usuário atual
        }
      }
    }
  });
}

export async function createDealNote(dealId: string, content: string, authorId: string) {
  return prisma.dealNote.create({
    data: {
      content,
      deal_id: dealId,
      author_id: authorId,
    }
  });
}

export async function createDealTask(dealId: string, data) {
  return prisma.dealTask.create({
    data: {
      ...data,
      deal_id: dealId
    }
  });
}
```

#### Integrations API (src/lib/api/integrations.ts)

```typescript
import { prisma } from '@/lib/prisma';

export async function getIntegrations(workspaceId: string) {
  return prisma.integration.findMany({
    where: { workspace_id: workspaceId }
  });
}

export async function getIntegrationById(integrationId: string) {
  return prisma.integration.findUnique({
    where: { id: integrationId }
  });
}

export async function createIntegration(data) {
  return prisma.integration.create({
    data
  });
}

export async function updateIntegration(integrationId: string, data) {
  return prisma.integration.update({
    where: { id: integrationId },
    data
  });
}

export async function deleteIntegration(integrationId: string) {
  return prisma.integration.delete({
    where: { id: integrationId }
  });
}
```

## 4. Migração de Dados Existentes

Se você já possui dados de clientes e conversas que deseja converter em negociações, você pode criar um script de migração:

```typescript
// scripts/migrate-clients-to-deals.ts
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function migrateClientsToDeal() {
  // 1. Criar estágios padrão do pipeline se não existirem
  const defaultStages = [
    { name: 'Novos Leads', color: '#3b82f6', order: 0 },
    { name: 'Qualificação', color: '#8b5cf6', order: 1 },
    { name: 'Apresentação', color: '#10b981', order: 2 },
    { name: 'Proposta', color: '#f59e0b', order: 3 },
    { name: 'Negociação', color: '#ef4444', order: 4 },
    { name: 'Fechamento', color: '#6366f1', order: 5 }
  ];
  
  // Obter todos os workspaces
  const workspaces = await prisma.workspace.findMany();
  
  for (const workspace of workspaces) {
    console.log(`Migrando dados para workspace: ${workspace.name}`);
    
    // Criar estágios para este workspace
    let stages = [];
    for (const stage of defaultStages) {
      const existingStage = await prisma.pipelineStage.findFirst({
        where: {
          workspace_id: workspace.id,
          name: stage.name
        }
      });
      
      if (!existingStage) {
        const newStage = await prisma.pipelineStage.create({
          data: {
            ...stage,
            workspace_id: workspace.id
          }
        });
        stages.push(newStage);
      } else {
        stages.push(existingStage);
      }
    }
    
    // Obter o estágio "Novos Leads"
    const newLeadsStage = stages.find(s => s.name === 'Novos Leads');
    
    // Obter clientes deste workspace que não têm deals associados
    const clients = await prisma.client.findMany({
      where: {
        workspace_id: workspace.id,
        // Verificar se o cliente já tem deals
        NOT: {
          deals: {
            some: {}
          }
        }
      },
      include: {
        conversations: {
          take: 1,
          orderBy: {
            last_message_at: 'desc'
          }
        }
      }
    });
    
    console.log(`Encontrados ${clients.length} clientes para migrar`);
    
    // Criar deals para cada cliente
    for (const client of clients) {
      try {
        // Usar o nome do cliente ou um nome padrão
        const dealName = client.name 
          ? `Oportunidade - ${client.name}` 
          : `Nova oportunidade ${client.phone_number || ''}`;
        
        await prisma.deal.create({
          data: {
            name: dealName,
            workspace_id: workspace.id,
            client_id: client.id,
            stage_id: newLeadsStage.id,
            ai_controlled: true,
            // Registrar atividade
            activityLogs: {
              create: {
                action: 'Deal Criado',
                message: 'Deal criado automaticamente a partir de cliente existente',
                source: 'SYSTEM'
              }
            }
          }
        });
        
        console.log(`Deal criado para cliente: ${client.name || client.phone_number}`);
      } catch (error) {
        console.error(`Erro ao criar deal para cliente ${client.id}:`, error);
      }
    }
  }
  
  console.log('Migração concluída!');
}

migrateClientsToDeal()
  .catch(e => {
    console.error('Erro durante migração:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

Para executar este script:

```bash
npx ts-node scripts/migrate-clients-to-deals.ts
```

## 5. Adicionando Navegação

Atualize seu componente de navegação para incluir links para as novas funcionalidades:

```tsx
// src/components/layout/Sidebar.tsx
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Sidebar() {
  const pathname = usePathname();
  
  const isActive = (path) => {
    return pathname === path || pathname.startsWith(`${path}/`);
  };
  
  return (
    <aside className="w-64 bg-gray-800 text-white h-screen">
      <div className="p-4">
        <h2 className="text-xl font-bold">Seu App</h2>
      </div>
      
      <nav className="mt-6">
        <ul>
          <li>
            <Link 
              href="/dashboard" 
              className={`flex items-center px-4 py-3 ${
                isActive('/dashboard') ? 'bg-gray-700' : 'hover:bg-gray-700'
              }`}
            >
              <i className="fas fa-chart-line mr-3"></i>
              Dashboard
            </Link>
          </li>
          <li>
            <Link 
              href="/pipeline" 
              className={`flex items-center px-4 py-3 ${
                isActive('/pipeline') ? 'bg-gray-700' : 'hover:bg-gray-700'
              }`}
            >
              <i className="fas fa-tasks mr-3"></i>
              Pipeline
            </Link>
          </li>
          <li>
            <Link 
              href="/conversations" 
              className={`flex items-center px-4 py-3 ${
                isActive('/conversations') ? 'bg-gray-700' : 'hover:bg-gray-700'
              }`}
            >
              <i className="fas fa-comments mr-3"></i>
              Conversas
            </Link>
          </li>
          <li>
            <Link 
              href="/clients" 
              className={`flex items-center px-4 py-3 ${
                isActive('/clients') ? 'bg-gray-700' : 'hover:bg-gray-700'
              }`}
            >
              <i className="fas fa-users mr-3"></i>
              Clientes
            </Link>
          </li>
          <li>
            <Link 
              href="/integrations" 
              className={`flex items-center px-4 py-3 ${
                isActive('/integrations') ? 'bg-gray-700' : 'hover:bg-gray-700'
              }`}
            >
              <i className="fas fa-plug mr-3"></i>
              Integrações
            </Link>
          </li>
          {/* Outros itens de menu existentes */}
        </ul>
      </nav>
    </aside>
  );
}
```

## 6. Dependências Necessárias

Instale as seguintes dependências para implementar o Kanban e outras funcionalidades:

```bash
npm install react-beautiful-dnd @hello-pangea/dnd recharts date-fns
```

> Nota: Se estiver usando React 18, use `@hello-pangea/dnd` em vez de `react-beautiful-dnd` para compatibilidade.

## 7. Considerações de Implementação

### 7.1 Autenticação e Autorização

Certifique-se de que todas as rotas de API e páginas estejam protegidas pelo seu sistema de autenticação existente. Adicione verificações de autorização para garantir que os usuários só possam acessar dados do seu próprio workspace.

### 7.2 Integração com IA

Para integrar a IA com o pipeline:

1. Crie um serviço de IA que monitore os deals e aplique as regras de automação
2. Implemente um sistema de eventos para acionar ações da IA quando determinadas condições forem atendidas
3. Adicione um endpoint de webhook para receber notificações de sistemas externos

### 7.3 Otimização de Desempenho

Para garantir bom desempenho com muitos deals:

1. Implemente paginação no carregamento de deals
2. Use React Query ou SWR para cache e revalidação de dados
3. Considere implementar virtualização para listas longas

## 8. Próximos Passos

Após implementar as funcionalidades básicas:

1. Adicione filtros e pesquisa ao pipeline
2. Implemente relatórios e análises avançadas
3. Adicione funcionalidades de exportação de dados
4. Implemente notificações em tempo real para atualizações do pipeline

## 9. Conclusão

Este guia fornece as instruções necessárias para implementar as funcionalidades de Dashboard, Pipeline (Kanban) e Integrações no seu aplicativo Next.js existente. Siga as etapas na ordem apresentada para garantir uma implementação suave.

Se precisar de ajuda adicional ou tiver dúvidas específicas sobre alguma parte da implementação, não hesite em perguntar!
