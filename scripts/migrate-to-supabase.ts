import { prisma } from '../lib/db';
import { supabase } from '../lib/supabase';

async function migrateData() {
  try {
    // 1. Migrar Workspaces
    const workspaces = await prisma.workspace.findMany({
      include: {
        owner: true,
        members: true,
        api_tokens: true,
        webhooks: true,
        tags: true
      }
    });

    for (const workspace of workspaces) {
      const { data: workspaceData, error: workspaceError } = await supabase
        .from('workspaces')
        .insert([{
          id: workspace.id,
          name: workspace.name,
          slug: workspace.slug,
          owner_id: workspace.owner_id,
          created_at: workspace.created_at,
          updated_at: workspace.updated_at,
          ai_default_system_prompt: workspace.ai_default_system_prompt,
          ai_model_preference: workspace.ai_model_preference,
          webhook_ingress_secret: workspace.webhook_ingress_secret,
          whatsapp_phone_number_id: workspace.whatsappPhoneNumberId,
          whatsapp_business_account_id: workspace.whatsappBusinessAccountId,
          whatsapp_access_token: workspace.whatsappAccessToken,
          whatsapp_app_secret: workspace.whatsappAppSecret,
          whatsapp_webhook_verify_token: workspace.whatsappWebhookVerifyToken,
          whatsapp_webhook_route_token: workspace.whatsappWebhookRouteToken,
          ai_name: workspace.ai_name,
          google_refresh_token: workspace.google_refresh_token,
          google_access_token_expires_at: workspace.google_access_token_expires_at,
          google_calendar_scopes: workspace.google_calendar_scopes,
          google_account_email: workspace.google_account_email
        }]);

      if (workspaceError) {
        console.error('Error migrating workspace:', workspaceError);
        continue;
      }

      // Migrar membros do workspace
      for (const member of workspace.members) {
        const { error: memberError } = await supabase
          .from('workspace_members')
          .insert([{
            id: member.id,
            workspace_id: member.workspace_id,
            user_id: member.user_id,
            role: member.role,
            created_at: member.created_at,
            updated_at: member.updated_at
          }]);

        if (memberError) {
          console.error('Error migrating workspace member:', memberError);
        }
      }

      // Migrar tokens de API
      for (const token of workspace.api_tokens) {
        const { error: tokenError } = await supabase
          .from('workspace_api_tokens')
          .insert([{
            id: token.id,
            workspace_id: token.workspace_id,
            name: token.name,
            token: token.token,
            created_at: token.created_at,
            expires_at: token.expires_at,
            last_used_at: token.last_used_at,
            revoked: token.revoked,
            created_by: token.created_by
          }]);

        if (tokenError) {
          console.error('Error migrating API token:', tokenError);
        }
      }
    }

    // 2. Migrar Clientes
    const clients = await prisma.client.findMany({
      include: {
        conversations: true,
        follow_ups: true
      }
    });

    for (const client of clients) {
      const { error: clientError } = await supabase
        .from('clients')
        .insert([{
          id: client.id,
          workspace_id: client.workspace_id,
          external_id: client.external_id,
          phone_number: client.phone_number,
          name: client.name,
          channel: client.channel,
          created_at: client.created_at,
          updated_at: client.updated_at,
          metadata: client.metadata
        }]);

      if (clientError) {
        console.error('Error migrating client:', clientError);
        continue;
      }

      // Migrar conversas
      for (const conversation of client.conversations) {
        const { error: conversationError } = await supabase
          .from('conversations')
          .insert([{
            id: conversation.id,
            workspace_id: conversation.workspace_id,
            client_id: conversation.client_id,
            channel: conversation.channel,
            channel_conversation_id: conversation.channel_conversation_id,
            status: conversation.status,
            is_ai_active: conversation.is_ai_active,
            last_message_at: conversation.last_message_at,
            created_at: conversation.created_at,
            updated_at: conversation.updated_at,
            metadata: conversation.metadata
          }]);

        if (conversationError) {
          console.error('Error migrating conversation:', conversationError);
        }
      }
    }

    // 3. Migrar Mensagens
    const messages = await prisma.message.findMany();
    for (const message of messages) {
      const { error: messageError } = await supabase
        .from('messages')
        .insert([{
          id: message.id,
          conversation_id: message.conversation_id,
          sender_type: message.sender_type,
          content: message.content,
          ai_media_analysis: message.ai_media_analysis,
          timestamp: message.timestamp,
          channel_message_id: message.channel_message_id,
          metadata: message.metadata,
          media_url: message.media_url,
          media_mime_type: message.media_mime_type,
          media_filename: message.media_filename,
          status: message.status,
          provider_message_id: message.providerMessageId,
          sent_at: message.sentAt,
          error_message: message.errorMessage
        }]);

      if (messageError) {
        console.error('Error migrating message:', messageError);
      }
    }

    // 4. Migrar Follow-ups
    const followUps = await prisma.followUp.findMany({
      include: {
        messages: true,
        ai_analyses: true
      }
    });

    for (const followUp of followUps) {
      const { error: followUpError } = await supabase
        .from('follow_ups')
        .insert([{
          id: followUp.id,
          campaign_id: followUp.campaign_id,
          client_id: followUp.client_id,
          status: followUp.status,
          started_at: followUp.started_at,
          updated_at: followUp.updated_at,
          next_message_at: followUp.next_message_at,
          completed_at: followUp.completed_at,
          current_stage_id: followUp.current_stage_id,
          waiting_for_response: followUp.waiting_for_response,
          last_response: followUp.last_response,
          last_response_at: followUp.last_response_at,
          last_client_message_at: followUp.last_client_message_at,
          next_evaluation_at: followUp.next_evaluation_at,
          paused_reason: followUp.paused_reason,
          ai_suggestion: followUp.ai_suggestion,
          workspace_id: followUp.workspace_id,
          current_sequence_step_order: followUp.current_sequence_step_order,
          next_sequence_message_at: followUp.next_sequence_message_at
        }]);

      if (followUpError) {
        console.error('Error migrating follow-up:', followUpError);
        continue;
      }

      // Migrar mensagens do follow-up
      for (const message of followUp.messages) {
        const { error: messageError } = await supabase
          .from('follow_up_messages')
          .insert([{
            id: message.id,
            follow_up_id: message.follow_up_id,
            content: message.content,
            sent_at: message.sent_at,
            delivered: message.delivered,
            delivered_at: message.delivered_at,
            is_from_client: message.is_from_client,
            step_id: message.step_id,
            error_sending: message.error_sending,
            is_ai_generated: message.is_ai_generated,
            template_used: message.template_used
          }]);

        if (messageError) {
          console.error('Error migrating follow-up message:', messageError);
        }
      }

      // Migrar análises de IA
      for (const analysis of followUp.ai_analyses) {
        const { error: analysisError } = await supabase
          .from('follow_up_ai_analyses')
          .insert([{
            id: analysis.id,
            follow_up_id: analysis.follow_up_id,
            message_id: analysis.message_id,
            sentiment: analysis.sentiment,
            intent: analysis.intent,
            topics: analysis.topics,
            next_action: analysis.next_action,
            suggested_stage: analysis.suggested_stage,
            created_at: analysis.created_at
          }]);

        if (analysisError) {
          console.error('Error migrating follow-up AI analysis:', analysisError);
        }
      }
    }

    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

migrateData(); 