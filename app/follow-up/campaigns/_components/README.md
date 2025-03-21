# Componentes da Campanha de Follow-up

Este diretório contém os componentes utilizados no módulo de campanhas de follow-up.

## Arquitetura Simplificada

Os componentes da campanha estão organizados da seguinte forma:

### Formulários Principais

- `CampaignFormHook`: Formulário principal que usa React Hook Form para gerenciar formulários da campanha
- `StepFormHook`: Formulário para adicionar/editar estágios da campanha usando React Hook Form
- `FunnelStageForm`: Formulário para adicionar/editar etapas do funil

### Componentes de Visualização

- `FunnelStagesTabs`: Exibe estágios agrupados por etapas do funil em formato de abas
- `FunnelStageList`: Lista as etapas do funil em formato de tabela
- `FunnelStagesView`: Visualização geral das etapas do funil

### Componentes Auxiliares

- `CampaignBasicInfoForm`: Formulário para informações básicas da campanha
- `SearchBar`: Barra de pesquisa
- `ErrorMessage`: Exibe mensagens de erro
- `Header`: Cabeçalho da aplicação
- `Footer`: Rodapé da aplicação
- `MainNavigation`: Navegação principal

## Melhorias Implementadas

1. **Remoção de Componentes Redundantes**:
   - Removido `CampaignForm` - substituído por `CampaignFormHook`
   - Removido `StepFormRHF` - substituído por `StepFormHook`
   - Removido `FunnelStageFormRHF` e `FunnelStageFormComponent` - substituídos por `FunnelStageForm`
   - Removido `ExampleUsage` - não utilizado em produção

2. **Simplificação da Interface**:
   - Centralizado a lógica de gerenciamento de formulários no `CampaignFormHook`
   - Unificado o estilo de componentes utilizando o mesmo padrão