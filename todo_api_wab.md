TODO - Integração Direta com WhatsApp Cloud API
Fase 1: Configuração Externa e Preparação do Banco
[ ] 1. Configuração na Plataforma Meta (Externo - Requer Ação Manual):
[ ] Verificar/Criar conta no Gerenciador de Negócios da Meta (Meta Business Manager) e completar a verificação da empresa.
[ ] Criar uma Conta do WhatsApp Business (WABA) dentro do Gerenciador.
[ ] Adicionar/Verificar um número de telefone dedicado para a API (não pode estar em uso no App WhatsApp/Business).
[ ] Criar um "Aplicativo" Meta do tipo "Negócios".
[ ] Adicionar o produto "WhatsApp" a este aplicativo.
[ ] Configurar a API (selecionar o número de telefone, WABA).
[ ] Obter Credenciais:
[ ] Anotar o ID do Ativo do Número de Telefone (Phone Number ID).
[ ] Anotar o ID da Conta do WhatsApp Business (WABA ID).
[ ] Gerar e anotar um Token de Acesso Permanente para a API.
[ ] Anotar o Segredo do Aplicativo (App Secret - usado para validar webhooks).
[ ] Definir Token de Verificação do Webhook: Criar uma string secreta forte (ex: usando um gerador de senhas). Você definirá isso no código e depois inserirá na configuração do webhook na Meta. Não use o Token de Acesso aqui!
[ ] 2. Atualizar Modelo Workspace no Prisma:
[ ] Abrir prisma/schema.prisma.
[ ] Adicionar os seguintes campos ao model Workspace (dentro do @@schema("workspace_schema")):
whatsappPhoneNumberId String? @map("whatsapp_phone_number_id")
whatsappBusinessAccountId String? @map("whatsapp_business_account_id")
whatsappAccessToken String? @map("whatsapp_access_token") // Nota: Precisa ser armazenado de forma segura (ex: criptografado) em produção!
whatsappWebhookVerifyToken String? @map("whatsapp_webhook_verify_token") // O token que VOCÊ definiu no passo 1.
[ ] Rodar npx prisma migrate dev --name add_whatsapp_cloud_api_fields (ou nome similar).
[ ] Rodar npx prisma generate para atualizar o Prisma Client.
Fase 2: Recebimento de Mensagens (Webhook)
[ ] 3. Criar Endpoint de Webhook:
[ ] Criar o arquivo da API Route: app/api/whatsapp/webhook/route.ts.
[ ] Implementar a função GET para responder ao desafio de verificação da Meta:
Ler hub.mode, hub.challenge, hub.verify_token da query string.
Buscar o whatsappWebhookVerifyToken do workspace correto (como determinar o workspace aqui é um desafio - talvez um token único por workspace ou uma variável de ambiente global inicial?). Alternativa: Iniciar com um token de verificação global único definido via variável de ambiente.
Se hub.mode === 'subscribe' e hub.verify_token bate com o esperado, responder com hub.challenge (status 200). Senão, responder com erro (403).
[ ] Implementar a função POST para receber eventos:
SEGURANÇA: Validar a assinatura X-Hub-Signature-256 usando o Segredo do App Meta e o corpo da requisição RAW. Rejeitar (403) se inválida. Não processe nada sem validar!
Se assinatura válida, responder imediatamente com status 200 OK.
NÃO FAÇA PROCESSAMENTO PESADO AQUI.
Analisar o corpo da requisição (pode ter várias mensagens/eventos).
Para cada evento relevante (ex: mensagem de texto recebida):
Extrair dados: telefone do remetente, conteúdo, timestamp, ID da mensagem WhatsApp, etc.
Adicionar Job à Fila: Enviar os dados relevantes para uma nova fila BullMQ (ex: whatsappWebhookQueue).
[ ] 4. Criar Fila e Worker para Webhooks:
[ ] Criar lib/queues/whatsappWebhookQueue.ts (similar a campaignQueue).
[ ] Criar lib/workers/whatsappWebhookWorker.ts.
[ ] Importar e iniciar whatsappWebhookWorker junto com os outros workers.
[ ] Implementar a lógica do processWhatsappWebhookJob no worker:
Receber dados do job (remetente, mensagem, timestamp, etc.).
Encontrar/Criar registro Client no DB (baseado no telefone e workspace).
Encontrar/Criar registro Conversation no DB (associado ao Client/Workspace, talvez usando o telefone como parte de uma chave única inicial). Marcar o channel como "WHATSAPP_CLOUD".
Salvar a mensagem recebida (prisma.message.create, sender_type: CLIENT).
Publicar no Redis Pub/Sub (chat-updates:...) para UI.
Decidir se/como chamar a IA: Talvez adicionando outro job à fila message-processing (adaptando-a para receber de diferentes fontes) ou refatorando a lógica de IA para um serviço chamado por ambos os workers.
Fase 3: Envio de Mensagens
[ ] 5. Criar Funções de Envio WhatsApp Cloud API:
[ ] Criar o arquivo lib/channel/whatsappCloudSender.ts.
[ ] Implementar sendWhatsAppTextMessage(workspaceId: string, recipientPhone: string, message: string): Promise<Result>:
Buscar whatsappPhoneNumberId e whatsappAccessToken do workspace.
Fazer requisição POST para https://graph.facebook.com/vXX.X/{phone_number_id}/messages.
Corpo da requisição: { messaging_product: "whatsapp", to: recipientPhone, type: "text", text: { body: message } }.
Usar o Authorization: Bearer {whatsappAccessToken} no header.
Retornar sucesso/falha e ID da mensagem WhatsApp (se disponível).
[ ] Implementar sendWhatsAppTemplateMessage(workspaceId: string, recipientPhone: string, templateName: string, languageCode: string, components: any[]): Promise<Result>:
Similar à anterior, mas com corpo: { ..., type: "template", template: { name: templateName, language: { code: languageCode }, components: [...] } }.
Lidar com a estrutura de components (header, body com parâmetros, botões).
Fase 4: Integração e UI
[ ] 6. Interface de Configuração:
[ ] Criar/Modificar página de configurações de integração do workspace (app/workspace/[slug]/settings/integrations/page.tsx?).
[ ] Adicionar formulário para inserir: Phone Number ID, WABA ID, Access Token (usar input type="password"), Webhook Verify Token.
[ ] Exibir a URL completa do Webhook (ex: https://SEU_DOMINIO/api/whatsapp/webhook) para o usuário copiar.
[ ] Criar Server Action segura para salvar essas configurações no Workspace. Lembre-se da criptografia para o Access Token!
[ ] 7. Adaptar Lógica Existente:
[ ] Identificação do Canal: Definir como o sistema saberá qual canal usar (Lumibot ou WhatsApp Cloud). Pode ser uma configuração no Workspace.
[ ] Envio de Respostas da IA: Modificar o messageProcessor (ou o serviço de IA) para verificar a configuração do workspace e chamar sendWhatsAppTextMessage ou enviarTextoLivreLumibot conforme apropriado.
[ ] Envio de Campanhas: Modificar o campaignWorker para verificar a configuração do workspace e chamar as funções de envio corretas (whatsappCloudSender ou lumibotSender). Se for template, adaptar para chamar sendWhatsAppTemplateMessage ou sendTemplateWhatsappOficialLumibot.
Fase 5: Testes e Refinamentos
[ ] 8. Configurar Webhook na Meta: Copiar a URL do seu webhook (usando ngrok para teste local ou a URL pública em produção) e o Token de Verificação para as configurações do App Meta. Enviar um evento de teste.
[ ] 9. Teste de Recebimento: Enviar mensagem do seu WhatsApp pessoal para o número da API. Verificar se o webhook é chamado, validado, e se a mensagem aparece no seu sistema (e se a IA responde, se aplicável).
[ ] 10. Teste de Envio (Texto): Disparar uma resposta (ex: via IA) ou uma campanha de texto livre. Verificar se a mensagem chega ao seu WhatsApp pessoal.
[ ] 11. Aprovar e Testar Templates HSM: Criar e submeter modelos de mensagem (HSM) para aprovação na interface do WhatsApp Manager. Após aprovado, testar o envio de templates via campanha ou outra lógica.
[ ] 12. Tratamento de Erros e Monitoramento: Implementar melhor tratamento de erros da API da Meta, limites de taxa, e monitorar as filas e workers.TODO - Integração Direta com WhatsApp Cloud API
Fase 1: Configuração Externa e Preparação do Banco
[ ] 1. Configuração na Plataforma Meta (Externo - Requer Ação Manual):
[ ] Verificar/Criar conta no Gerenciador de Negócios da Meta (Meta Business Manager) e completar a verificação da empresa.
[ ] Criar uma Conta do WhatsApp Business (WABA) dentro do Gerenciador.
[ ] Adicionar/Verificar um número de telefone dedicado para a API (não pode estar em uso no App WhatsApp/Business).
[ ] Criar um "Aplicativo" Meta do tipo "Negócios".
[ ] Adicionar o produto "WhatsApp" a este aplicativo.
[ ] Configurar a API (selecionar o número de telefone, WABA).
[ ] Obter Credenciais:
[ ] Anotar o ID do Ativo do Número de Telefone (Phone Number ID).
[ ] Anotar o ID da Conta do WhatsApp Business (WABA ID).
[ ] Gerar e anotar um Token de Acesso Permanente para a API.
[ ] Anotar o Segredo do Aplicativo (App Secret - usado para validar webhooks).
[ ] Definir Token de Verificação do Webhook: Criar uma string secreta forte (ex: usando um gerador de senhas). Você definirá isso no código e depois inserirá na configuração do webhook na Meta. Não use o Token de Acesso aqui!
[ ] 2. Atualizar Modelo Workspace no Prisma:
[ ] Abrir prisma/schema.prisma.
[ ] Adicionar os seguintes campos ao model Workspace (dentro do @@schema("workspace_schema")):
whatsappPhoneNumberId String? @map("whatsapp_phone_number_id")
whatsappBusinessAccountId String? @map("whatsapp_business_account_id")
whatsappAccessToken String? @map("whatsapp_access_token") // Nota: Precisa ser armazenado de forma segura (ex: criptografado) em produção!
whatsappWebhookVerifyToken String? @map("whatsapp_webhook_verify_token") // O token que VOCÊ definiu no passo 1.
[ ] Rodar npx prisma migrate dev --name add_whatsapp_cloud_api_fields (ou nome similar).
[ ] Rodar npx prisma generate para atualizar o Prisma Client.
Fase 2: Recebimento de Mensagens (Webhook)
[ ] 3. Criar Endpoint de Webhook:
[ ] Criar o arquivo da API Route: app/api/whatsapp/webhook/route.ts.
[ ] Implementar a função GET para responder ao desafio de verificação da Meta:
Ler hub.mode, hub.challenge, hub.verify_token da query string.
Buscar o whatsappWebhookVerifyToken do workspace correto (como determinar o workspace aqui é um desafio - talvez um token único por workspace ou uma variável de ambiente global inicial?). Alternativa: Iniciar com um token de verificação global único definido via variável de ambiente.
Se hub.mode === 'subscribe' e hub.verify_token bate com o esperado, responder com hub.challenge (status 200). Senão, responder com erro (403).
[ ] Implementar a função POST para receber eventos:
SEGURANÇA: Validar a assinatura X-Hub-Signature-256 usando o Segredo do App Meta e o corpo da requisição RAW. Rejeitar (403) se inválida. Não processe nada sem validar!
Se assinatura válida, responder imediatamente com status 200 OK.
NÃO FAÇA PROCESSAMENTO PESADO AQUI.
Analisar o corpo da requisição (pode ter várias mensagens/eventos).
Para cada evento relevante (ex: mensagem de texto recebida):
Extrair dados: telefone do remetente, conteúdo, timestamp, ID da mensagem WhatsApp, etc.
Adicionar Job à Fila: Enviar os dados relevantes para uma nova fila BullMQ (ex: whatsappWebhookQueue).
[ ] 4. Criar Fila e Worker para Webhooks:
[ ] Criar lib/queues/whatsappWebhookQueue.ts (similar a campaignQueue).
[ ] Criar lib/workers/whatsappWebhookWorker.ts.
[ ] Importar e iniciar whatsappWebhookWorker junto com os outros workers.
[ ] Implementar a lógica do processWhatsappWebhookJob no worker:
Receber dados do job (remetente, mensagem, timestamp, etc.).
Encontrar/Criar registro Client no DB (baseado no telefone e workspace).
Encontrar/Criar registro Conversation no DB (associado ao Client/Workspace, talvez usando o telefone como parte de uma chave única inicial). Marcar o channel como "WHATSAPP_CLOUD".
Salvar a mensagem recebida (prisma.message.create, sender_type: CLIENT).
Publicar no Redis Pub/Sub (chat-updates:...) para UI.
Decidir se/como chamar a IA: Talvez adicionando outro job à fila message-processing (adaptando-a para receber de diferentes fontes) ou refatorando a lógica de IA para um serviço chamado por ambos os workers.
Fase 3: Envio de Mensagens
[ ] 5. Criar Funções de Envio WhatsApp Cloud API:
[ ] Criar o arquivo lib/channel/whatsappCloudSender.ts.
[ ] Implementar sendWhatsAppTextMessage(workspaceId: string, recipientPhone: string, message: string): Promise<Result>:
Buscar whatsappPhoneNumberId e whatsappAccessToken do workspace.
Fazer requisição POST para https://graph.facebook.com/vXX.X/{phone_number_id}/messages.
Corpo da requisição: { messaging_product: "whatsapp", to: recipientPhone, type: "text", text: { body: message } }.
Usar o Authorization: Bearer {whatsappAccessToken} no header.
Retornar sucesso/falha e ID da mensagem WhatsApp (se disponível).
[ ] Implementar sendWhatsAppTemplateMessage(workspaceId: string, recipientPhone: string, templateName: string, languageCode: string, components: any[]): Promise<Result>:
Similar à anterior, mas com corpo: { ..., type: "template", template: { name: templateName, language: { code: languageCode }, components: [...] } }.
Lidar com a estrutura de components (header, body com parâmetros, botões).
Fase 4: Integração e UI
[ ] 6. Interface de Configuração:
[ ] Criar/Modificar página de configurações de integração do workspace (app/workspace/[slug]/settings/integrations/page.tsx?).
[ ] Adicionar formulário para inserir: Phone Number ID, WABA ID, Access Token (usar input type="password"), Webhook Verify Token.
[ ] Exibir a URL completa do Webhook (ex: https://SEU_DOMINIO/api/whatsapp/webhook) para o usuário copiar.
[ ] Criar Server Action segura para salvar essas configurações no Workspace. Lembre-se da criptografia para o Access Token!
[ ] 7. Adaptar Lógica Existente:
[ ] Identificação do Canal: Definir como o sistema saberá qual canal usar (Lumibot ou WhatsApp Cloud). Pode ser uma configuração no Workspace.
[ ] Envio de Respostas da IA: Modificar o messageProcessor (ou o serviço de IA) para verificar a configuração do workspace e chamar sendWhatsAppTextMessage ou enviarTextoLivreLumibot conforme apropriado.
[ ] Envio de Campanhas: Modificar o campaignWorker para verificar a configuração do workspace e chamar as funções de envio corretas (whatsappCloudSender ou lumibotSender). Se for template, adaptar para chamar sendWhatsAppTemplateMessage ou sendTemplateWhatsappOficialLumibot.
Fase 5: Testes e Refinamentos
[ ] 8. Configurar Webhook na Meta: Copiar a URL do seu webhook (usando ngrok para teste local ou a URL pública em produção) e o Token de Verificação para as configurações do App Meta. Enviar um evento de teste.
[ ] 9. Teste de Recebimento: Enviar mensagem do seu WhatsApp pessoal para o número da API. Verificar se o webhook é chamado, validado, e se a mensagem aparece no seu sistema (e se a IA responde, se aplicável).
[ ] 10. Teste de Envio (Texto): Disparar uma resposta (ex: via IA) ou uma campanha de texto livre. Verificar se a mensagem chega ao seu WhatsApp pessoal.
[ ] 11. Aprovar e Testar Templates HSM: Criar e submeter modelos de mensagem (HSM) para aprovação na interface do WhatsApp Manager. Após aprovado, testar o envio de templates via campanha ou outra lógica.
[ ] 12. Tratamento de Erros e Monitoramento: Implementar melhor tratamento de erros da API da Meta, limites de taxa, e monitorar as filas e workers.