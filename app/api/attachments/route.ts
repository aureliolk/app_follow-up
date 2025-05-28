import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth/auth-options';
import { prisma } from '@/lib/db';
import { s3Client, s3BucketName } from '@/lib/s3Client';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import { checkPermission } from '@/lib/permissions';
import { ConversationStatus, MessageSenderType } from '@prisma/client';
import { Prisma } from '@prisma/client';
import type { Role } from '@/lib/permissions';
import { whatsappOutgoingMediaQueue, WHATSAPP_OUTGOING_MEDIA_QUEUE } from '@/lib/queues/whatsappOutgoingMediaQueue';
import pusher from '@/lib/pusher';
import { triggerWorkspacePusherEvent } from '@/lib/pusherEvents';

// Define allowed MIME types and max size (e.g., 16MB for WhatsApp images/videos)
const MAX_FILE_SIZE_MB = 16;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const ALLOWED_MIME_TYPES = [
  // Images
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif', // Note: WhatsApp might convert GIFs
  // Videos
  'video/mp4',
  'video/3gpp', // 3GP videos
  // Audio
  'audio/aac',
  'audio/mp4',
  'audio/mpeg', // MP3
  'audio/amr',
  'audio/ogg; codecs=opus', // Opus audio in Ogg container
  'audio/webm;codecs=opus', // Opus audio in WebM container
  'audio/opus', // Opus audio directly
  'audio/wav', // WAV (WhatsApp might have limitations)
  'audio/x-wav',
  // Documents (Common types, adjust as needed)
  'application/pdf',
  'application/msword', // .doc
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/vnd.ms-excel', // .xls
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-powerpoint', // .ppt
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
  'text/plain', // .txt
  // Add other document types supported by WhatsApp if needed
];

// Helper function to determine message type from MIME type
function getMessageTypeFromMime(mimeType: string): 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT' {
  if (mimeType.startsWith('image/')) return 'IMAGE';
  if (mimeType.startsWith('video/')) return 'VIDEO';
  if (mimeType.startsWith('audio/')) return 'AUDIO';
  return 'DOCUMENT'; // Default
}

export async function POST(req: NextRequest) {
  console.log("[API POST /attachments] Received upload request.");
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      console.warn("Attachments API: Unauthorized - No session found");
      return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
    }
    const userId = session.user.id;
    const senderName = session.user.name || 'Operador';

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const conversationId = formData.get('conversationId') as string | null;
    const workspaceId = formData.get('workspaceId') as string | null; // Get workspaceId too

    if (!file || !conversationId || !workspaceId) {
      console.warn("Attachments API: Bad Request - Missing file, conversationId, or workspaceId");
      return NextResponse.json({ success: false, error: 'Dados incompletos para upload' }, { status: 400 });
    }

    // Check user permission for the workspace
    const hasAccess = await checkPermission(workspaceId, userId, 'MEMBER'); // Allow VIEWER and above
    if (!hasAccess) {
        console.warn(`Attachments API: Forbidden - User ${userId} lacks permission for workspace ${workspaceId}`);
        return NextResponse.json({ success: false, error: 'Permissão negada para este workspace' }, { status: 403 });
    }

    // Validate conversation exists and belongs to the workspace
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId, workspace_id: workspaceId },
      select: { id: true, status: true }
    });
    if (!conversation) {
        return NextResponse.json({ success: false, error: 'Conversation not found or does not belong to workspace' }, { status: 404 });
    }
     // Optional: Check if conversation is active (prevent attaching to closed convos?)
    // if (conversation.status !== ConversationStatus.ACTIVE) {
    //     return NextResponse.json({ success: false, error: 'Conversation is not active' }, { status: 400 });
    // }

    // --- File Validation ---
    console.log(`[API POST /attachments] Validating file: ${file.name}, Size: ${file.size}, Type: ${file.type}`);
    if (file.size > MAX_FILE_SIZE_BYTES) {
      console.warn(`Attachments API: File too large - Size: ${file.size} bytes`);
      return NextResponse.json({ success: false, error: `Arquivo muito grande. Máximo ${MAX_FILE_SIZE_MB}MB` }, { status: 413 }); // 413 Payload Too Large
    }
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
        console.warn(`Attachments API: Invalid file type - Type: ${file.type}`);
        return NextResponse.json({ success: false, error: `Tipo de arquivo inválido: ${file.type}` }, { status: 415 }); // 415 Unsupported Media Type
    }

    // --- S3 Upload --- 
    if (!s3BucketName) {
      console.error("[API POST /attachments] S3 bucket name not configured.");
      return NextResponse.json({ success: false, error: 'Storage configuration error' }, { status: 500 });
    }

    const fileExtension = file.name.split('.').pop() || 'bin';
    const uniqueFileName = `${randomUUID()}.${fileExtension}`;
    // Optional: Add conversation ID or workspace ID to the path for organization
    const s3Key = `operator-uploads/${workspaceId}/${conversationId}/${uniqueFileName}`;

    console.log(`Attachments API: Uploading to S3 - Bucket: ${s3BucketName}, Key: ${s3Key}`);
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    const putCommand = new PutObjectCommand({
      Bucket: s3BucketName,
      Key: s3Key,
      Body: fileBuffer,
      ContentType: file.type,
      // ACL: 'public-read', // Set ACL if your bucket policy requires it for public access
    });

    try {
      await s3Client.send(putCommand);
      console.log(`Attachments API: Upload to S3 successful for key ${s3Key}`);
    } catch (s3Error: any) {
      console.error(`[API POST /attachments] S3 Upload Error for key ${s3Key}:`, s3Error);
      return NextResponse.json({ success: false, error: 'Failed to upload file to storage' }, { status: 500 });
    }

    // --- Construct Public URL (Adapt based on your S3/CDN setup) ---
    // Option 1: Simple concatenation (if bucket is public and endpoint is correct)
    const endpointUrl = process.env.STORAGE_ENDPOINT || '';
    let fileUrl = `${endpointUrl}/${s3BucketName}/${s3Key}`;
    // If using Cloudflare R2 public URL or similar:
    const publicUrlBase = process.env.STORAGE_PUBLIC_URL;
    if (publicUrlBase) {
        fileUrl = `${publicUrlBase}/${s3Key}`;
    }
    // Remove potential double slashes except after protocol
    fileUrl = fileUrl.replace(/([^:]\/)\/+/g, "$1"); 

    console.log(`[API POST /attachments] Generated File URL: ${fileUrl}`);

    // --- Save Message to Database --- 
    const messageType = getMessageTypeFromMime(file.type);
    const placeholderContent = `[Enviando ${messageType.toLowerCase()} ${file.name}...]`;
    const prefixedContent = `*${senderName}*\n${placeholderContent}`;

    try {
      const newMessage = await prisma.message.create({
        data: {
          conversation: {
            connect: {
              id: conversationId
            }
          },
          sender_type: MessageSenderType.AGENT, // Usar AGENT para consistência com envio manual
          content: prefixedContent,
          media_url: fileUrl,        // Corrigido: Salvar URL aqui
          media_mime_type: file.type, // Corrigido: Salvar MIME type aqui
          media_filename: file.name,   // Corrigido: Salvar filename aqui
          status: "PENDING", // Definir status inicial para o worker processar
          channel_message_id: `local-${randomUUID()}`, // ID temporário
          metadata: {
            uploadedToS3: true,
            s3Key: s3Key,
            // Podemos remover do metadata se já estão nos campos principais, mas manter pode ser útil
            originalFilename: file.name,
            mimeType: file.type,
            size: file.size,
            messageType: messageType,
            uploadedBy: userId,
          } as Prisma.JsonObject,
          timestamp: new Date(),
        },
        select: { // Selecionar todos os campos necessários para retorno e UI
          id: true, conversation_id: true, sender_type: true, content: true, timestamp: true,
          channel_message_id: true, metadata: true, media_url: true, media_mime_type: true,
          media_filename: true, status: true, providerMessageId: true, sentAt: true, errorMessage: true,
          // <<< ADICIONAR message_type AO SELECT se foi adicionado ao schema >>>
          // message_type: true, 
        }
      });
      console.log(`Attachments API: Message record created (ID: ${newMessage.id}) with prefixed content.`);
      
      // <<< ENFILEIRAR JOB PARA ENVIO VIA WHATSAPP >>>
      try {
        const jobData = { messageId: newMessage.id };
        // Usar ID da mensagem como Job ID para possível idempotência/referência
        const jobId = `media-${newMessage.id}`;
        await whatsappOutgoingMediaQueue.add(WHATSAPP_OUTGOING_MEDIA_QUEUE, jobData, { jobId: jobId });
        console.log(`Attachments API: Job added to queue ${WHATSAPP_OUTGOING_MEDIA_QUEUE} for message ${newMessage.id}`);
      } catch (queueError) {
        console.error(`Attachments API: Failed to add job to queue ${WHATSAPP_OUTGOING_MEDIA_QUEUE} for message ${newMessage.id}:`, queueError);
        // Continuar mesmo se falhar ao enfileirar? Ou retornar erro? 
        // Por enquanto, loga o erro mas retorna sucesso do upload/save.
      }

      // --- Disparar evento Pusher para notificar a UI ---
      try {
        await triggerWorkspacePusherEvent(workspaceId, 'new_message', newMessage);
    } catch (pusherError) {
        console.error(`[Attachments API] Failed to trigger Pusher event for msg ${newMessage.id}:`, pusherError);
        // Não falhar o processamento do webhook por causa do Pusher, apenas logar.
    }
    // --- Fim do disparo Pusher ---

  

      // Return the created message object (or a subset of it)
      return NextResponse.json({ success: true, data: newMessage }, { status: 201 });

    } catch (dbError: any) {
      console.error(`Attachments API: Database Error saving message for S3 key ${s3Key}:`, dbError);
       // TODO: Consider deleting the uploaded S3 object if DB save fails to avoid orphaned files
      return NextResponse.json({ success: false, error: 'Failed to save message details' }, { status: 500 });
    }

  } catch (error: any) {
    console.error("Attachments API: Unhandled error:", error);
    const errorMessage = error.message || 'Erro interno do servidor ao processar anexo.';
    // Tentar extrair um status code mais específico se possível (ex: S3 errors)
    let statusCode = 500;
    if (error.name === 'AccessDenied' || error.code === 'AccessDenied') {
        statusCode = 503; // Service Unavailable (problema S3)
    }

    return NextResponse.json({ success: false, error: errorMessage }, { status: statusCode });
  }
}
