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
function getMessageTypeFromMime(mimeType: string): string {
  if (mimeType.startsWith('image/')) return 'IMAGE';
  if (mimeType.startsWith('video/')) return 'VIDEO';
  if (mimeType.startsWith('audio/')) return 'AUDIO';
  return 'DOCUMENT'; // Default to document
}

export async function POST(req: NextRequest) {
  console.log("[API POST /attachments] Received upload request.");
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const conversationId = formData.get('conversationId') as string | null;
    const workspaceId = formData.get('workspaceId') as string | null; // Get workspaceId too

    if (!file || !conversationId || !workspaceId) {
      return NextResponse.json({ success: false, error: 'Missing file, conversationId, or workspaceId' }, { status: 400 });
    }

    // Check user permission for the workspace
    const hasAccess = await checkPermission(workspaceId, userId, 'VIEWER'); // Allow VIEWER and above
    if (!hasAccess) {
        return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
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
      console.warn(`[API POST /attachments] File too large: ${file.size} bytes (Max: ${MAX_FILE_SIZE_BYTES})`);
      return NextResponse.json({ success: false, error: `File too large. Maximum size: ${MAX_FILE_SIZE_MB}MB` }, { status: 413 });
    }
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
        console.warn(`[API POST /attachments] Invalid file type: ${file.type}`);
        return NextResponse.json({ success: false, error: `Invalid file type: ${file.type}` }, { status: 415 });
    }

    // --- S3 Upload --- 
    if (!s3BucketName) {
      console.error("[API POST /attachments] S3 bucket name not configured.");
      return NextResponse.json({ success: false, error: 'Storage configuration error' }, { status: 500 });
    }

    const fileExtension = file.name.split('.').pop() || 'bin';
    const uniqueFileName = `${randomUUID()}.${fileExtension}`;
    // Optional: Add conversation ID or workspace ID to the path for organization
    const s3Key = `attachments/${conversationId}/${uniqueFileName}`;

    console.log(`[API POST /attachments] Uploading to S3: Bucket=${s3BucketName}, Key=${s3Key}`);
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
      console.log(`[API POST /attachments] Successfully uploaded ${s3Key} to S3.`);
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
    const contentPlaceholder = `[Anexo: ${file.name}]`; // Usar um placeholder no content

    try {
      const newMessage = await prisma.message.create({
        data: {
          conversation: {
            connect: {
              id: conversationId
            }
          },
          sender_type: MessageSenderType.AI, // Marcando como AI ou SYSTEM?
          // content: contentPlaceholder, // Usar placeholder ou deixar vazio? Vamos usar o placeholder.
          content: contentPlaceholder, // Definindo o content com placeholder
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
      });
      console.log(`[API POST /attachments] Message saved to DB: ID=${newMessage.id} with media_url.`); // Log atualizado
      
      // <<< ENFILEIRAR JOB PARA ENVIO VIA WHATSAPP >>>
      try {
        const jobData = { messageId: newMessage.id };
        // Usar ID da mensagem como Job ID para possível idempotência/referência
        const jobId = `send-media-${newMessage.id}`;
        await whatsappOutgoingMediaQueue.add('sendWhatsappMedia', jobData, { jobId: jobId });
        console.log(`[API POST /attachments] Job ${jobId} added to queue ${WHATSAPP_OUTGOING_MEDIA_QUEUE} for message ${newMessage.id}`);
      } catch (queueError) {
        console.error(`[API POST /attachments] Failed to add job to queue ${WHATSAPP_OUTGOING_MEDIA_QUEUE} for message ${newMessage.id}:`, queueError);
        // Continuar mesmo se falhar ao enfileirar? Ou retornar erro? 
        // Por enquanto, loga o erro mas retorna sucesso do upload/save.
      }

      // Return the created message object (or a subset of it)
      return NextResponse.json({ success: true, data: newMessage }, { status: 201 });

    } catch (dbError: any) {
      console.error(`[API POST /attachments] Database Error saving message for S3 key ${s3Key}:`, dbError);
       // TODO: Consider deleting the uploaded S3 object if DB save fails to avoid orphaned files
      return NextResponse.json({ success: false, error: 'Failed to save message details' }, { status: 500 });
    }

  } catch (error: any) {
    console.error("[API POST /attachments] General Error:", error);
    // Avoid exposing internal errors directly
    if (error.code === 'ENOENT') { // Example specific error check
      return NextResponse.json({ success: false, error: 'Invalid path or file not found' }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: 'An unexpected error occurred' }, { status: 500 });
  }
} 