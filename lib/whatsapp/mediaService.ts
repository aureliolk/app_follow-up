import axios from 'axios';
import { s3Client, s3BucketName } from '@/lib/s3Client';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';

interface WhatsappMediaInfo {
  url: string;
  mime_type: string;
  sha256: string;
  file_size: number;
  id: string;
  messaging_product: string;
}

export async function fetchAndUploadWhatsappMedia(
  mediaId: string,
  accessToken: string,
  workspaceId: string,
  conversationId: string,
  originalFilename?: string | null
): Promise<{ url: string; mimeType: string; filename: string } | null> {
  try {
    // 1. Get media URL from WhatsApp API
    const mediaInfoResponse = await axios.get<WhatsappMediaInfo>(
      `https://graph.facebook.com/v19.0/${mediaId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    const mediaInfo = mediaInfoResponse.data;
    const mediaUrl = mediaInfo.url;
    const mimeType = mediaInfo.mime_type;
    const fileSize = mediaInfo.file_size;

    console.log(`[WhatsappMediaService] Fetched media info for ${mediaId}: URL=${mediaUrl}, MimeType=${mimeType}, Size=${fileSize}`);

    // 2. Download media content
    const mediaContentResponse = await axios.get(mediaUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      responseType: 'arraybuffer', // Important for binary data
    });

    const fileBuffer = Buffer.from(mediaContentResponse.data);

    // 3. Upload to S3
    if (!s3BucketName) {
      console.error("[WhatsappMediaService] S3 bucket name not configured.");
      return null;
    }

    const fileExtension = originalFilename?.split('.').pop() || mimeType.split('/').pop() || 'bin';
    const uniqueFileName = `${randomUUID()}.${fileExtension}`;
    const s3Key = `whatsapp-media/${workspaceId}/${conversationId}/${uniqueFileName}`;

    console.log(`[WhatsappMediaService] Uploading to S3 - Bucket: ${s3BucketName}, Key: ${s3Key}`);

    const putCommand = new PutObjectCommand({
      Bucket: s3BucketName,
      Key: s3Key,
      Body: fileBuffer,
      ContentType: mimeType,
    });

    await s3Client.send(putCommand);
    console.log(`[WhatsappMediaService] Upload to S3 successful for key ${s3Key}`);

    // 4. Construct Public URL
    const publicUrlBase = process.env.STORAGE_PUBLIC_URL;
    let finalFileUrl = '';
    if (publicUrlBase) {
      finalFileUrl = `${publicUrlBase}/${s3Key}`;
    } else {
      // Fallback if STORAGE_PUBLIC_URL is not set, might not be publicly accessible
      const endpointUrl = process.env.STORAGE_ENDPOINT || '';
      finalFileUrl = `${endpointUrl}/${s3BucketName}/${s3Key}`;
    }
    finalFileUrl = finalFileUrl.replace(/([^:]\/)\/+/g, "$1"); // Remove potential double slashes

    console.log(`[WhatsappMediaService] Generated Public File URL: ${finalFileUrl}`);

    return { url: finalFileUrl, mimeType: mimeType, filename: originalFilename || uniqueFileName };

  } catch (error: any) {
    console.error(`[WhatsappMediaService] Error fetching or uploading media ${mediaId}:`, error.response?.data || error.message);
    return null;
  }
}