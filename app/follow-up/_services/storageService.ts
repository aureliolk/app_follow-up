import { getSupabaseAdmin } from "@/lib/supabase"
import { createClientSupabaseClient } from "@/lib/supabase"

// Define bucket names
const CAMPAIGN_TEMPLATES_BUCKET = "campaign-templates"
const CSV_IMPORTS_BUCKET = "csv-imports"
const MESSAGE_ATTACHMENTS_BUCKET = "message-attachments"

// Initialize buckets if they don't exist
async function initializeBuckets() {
  try {
    // Este código só deve rodar no servidor
    if (typeof window !== "undefined") {
      console.warn("initializeBuckets foi chamado no cliente, ignorando...")
      return
    }
    
    const supabaseAdmin = getSupabaseAdmin()
    // Check and create campaign templates bucket
    const { data: buckets } = await supabaseAdmin.storage.listBuckets()

    const bucketsToCreate = [
      { name: CAMPAIGN_TEMPLATES_BUCKET, public: false },
      { name: CSV_IMPORTS_BUCKET, public: false },
      { name: MESSAGE_ATTACHMENTS_BUCKET, public: false },
    ]

    for (const bucket of bucketsToCreate) {
      if (!buckets?.find((b) => b.name === bucket.name)) {
        await supabaseAdmin.storage.createBucket(bucket.name, {
          public: bucket.public,
          fileSizeLimit: 10485760, // 10MB
        })
        console.log(`Created bucket: ${bucket.name}`)
      }
    }
  } catch (error) {
    console.error("Erro ao inicializar buckets:", error)
  }
}

// Initialize buckets on server start (in production, this would be in a migration)
if (typeof window === "undefined") {
  initializeBuckets().catch(console.error)
}

export const getSupabaseBrowserClient = () => {
  return createClientSupabaseClient()
}

export const storageService = {
  // Upload a campaign template file
  async uploadCampaignTemplate(file: File, campaignId: string): Promise<string> {
    const client = createClientSupabaseClient()
    const fileName = `${campaignId}/${Date.now()}_${file.name}`

    const { data, error } = await client.storage.from(CAMPAIGN_TEMPLATES_BUCKET).upload(fileName, file, {
      cacheControl: "3600",
      upsert: false,
    })

    if (error) {
      console.error("Error uploading campaign template:", error)
      throw new Error(`Failed to upload template: ${error.message}`)
    }

    return data.path
  },

  // Get a campaign template file URL
  async getCampaignTemplateUrl(filePath: string): Promise<string> {
    const client = createClientSupabaseClient()

    const { data } = await client.storage.from(CAMPAIGN_TEMPLATES_BUCKET).createSignedUrl(filePath, 3600) // 1 hour expiry

    if (!data?.signedUrl) {
      throw new Error("Failed to generate signed URL")
    }

    return data.signedUrl
  },

  // Upload a CSV import file
  async uploadCsvImport(file: File): Promise<string> {
    try {
      console.log("Iniciando upload do CSV...", {
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type
      });
      
      const client = createClientSupabaseClient()
      
      // Verificando buckets
      console.log("Verificando existência do bucket...");
      const { data: buckets, error: bucketError } = await client.storage.listBuckets();
      
      if (bucketError) {
        console.error("Erro ao listar buckets:", bucketError);
        // Criar o bucket se não existir
        if (bucketError.message.includes("not found")) {
          try {
            console.log("Tentando criar bucket csv-imports...");
            const { data: newBucket, error: createError } = await client.storage.createBucket("csv-imports", {
              public: false
            });
            
            if (createError) {
              console.error("Erro ao criar bucket:", createError);
            } else {
              console.log("Bucket criado com sucesso!");
            }
          } catch (e) {
            console.error("Exceção ao criar bucket:", e);
          }
        }
      } else {
        console.log("Buckets encontrados:", buckets?.map(b => b.name).join(", "));
      }
      
      // Prosseguir com upload
      const fileName = `${Date.now()}_${file.name}`
      console.log(`Realizando upload para ${fileName}...`);

      const { data, error } = await client.storage.from(CSV_IMPORTS_BUCKET).upload(fileName, file, {
        cacheControl: "3600",
        upsert: true, // Alterado para true para substituir se existir
      })

      if (error) {
        console.error("Erro detalhado no upload do CSV:", JSON.stringify(error));
        console.error("Tipo do erro:", error.name);
        console.error("Mensagem de erro:", error.message);
        console.error("Detalhes adicionais:", error.details);
        throw error;
      }

      console.log("Upload concluído com sucesso:", data);
      return data.path;
    } catch (error) {
      console.error("Exceção capturada durante upload:", error);
      throw new Error(`Falha no upload do CSV: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
  },

  // Get a CSV import file URL
  async getCsvImportUrl(filePath: string): Promise<string> {
    const client = createClientSupabaseClient()

    const { data } = await client.storage.from(CSV_IMPORTS_BUCKET).createSignedUrl(filePath, 3600) // 1 hour expiry

    if (!data?.signedUrl) {
      throw new Error("Failed to generate signed URL")
    }

    return data.signedUrl
  },

  // Download a CSV import file
  async downloadCsvImport(filePath: string): Promise<Blob> {
    const client = createClientSupabaseClient()

    const { data, error } = await client.storage.from(CSV_IMPORTS_BUCKET).download(filePath)

    if (error || !data) {
      console.error("Error downloading CSV import:", error)
      throw new Error(`Failed to download CSV: ${error?.message}`)
    }

    return data
  },

  // Upload a message attachment
  async uploadMessageAttachment(file: File, followUpId: string): Promise<string> {
    const client = createClientSupabaseClient()
    const fileName = `${followUpId}/${Date.now()}_${file.name}`

    const { data, error } = await client.storage.from(MESSAGE_ATTACHMENTS_BUCKET).upload(fileName, file, {
      cacheControl: "3600",
      upsert: false,
    })

    if (error) {
      console.error("Error uploading message attachment:", error)
      throw new Error(`Failed to upload attachment: ${error.message}`)
    }

    return data.path
  },

  // Get a message attachment URL
  async getMessageAttachmentUrl(filePath: string): Promise<string> {
    const client = createClientSupabaseClient()

    const { data } = await client.storage.from(MESSAGE_ATTACHMENTS_BUCKET).createSignedUrl(filePath, 3600) // 1 hour expiry

    if (!data?.signedUrl) {
      throw new Error("Failed to generate signed URL")
    }

    return data.signedUrl
  },

  // List all files in a bucket folder
  async listFiles(bucket: string, folder?: string): Promise<Array<{ name: string; path: string; size: number }>> {
    const client = createClientSupabaseClient()

    const { data, error } = await client.storage.from(bucket).list(folder || "")

    if (error) {
      console.error(`Error listing files in ${bucket}/${folder}:`, error)
      throw new Error(`Failed to list files: ${error.message}`)
    }

    return data.map((item) => ({
      name: item.name,
      path: folder ? `${folder}/${item.name}` : item.name,
      size: item.metadata.size,
    }))
  },

  // Delete a file
  async deleteFile(bucket: string, filePath: string): Promise<void> {
    const client = createClientSupabaseClient()

    const { error } = await client.storage.from(bucket).remove([filePath])

    if (error) {
      console.error(`Error deleting file ${filePath} from ${bucket}:`, error)
      throw new Error(`Failed to delete file: ${error.message}`)
    }
  },
}

export default storageService