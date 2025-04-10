import { S3Client } from "@aws-sdk/client-s3";

// Validação básica das variáveis de ambiente
const endpoint = process.env.STORAGE_ENDPOINT;
const region = process.env.STORAGE_REGION;
const accessKeyId = process.env.STORAGE_ACCESS_KEY_ID;
const secretAccessKey = process.env.STORAGE_SECRET_ACCESS_KEY;
const forcePathStyle = process.env.STORAGE_FORCE_PATH_STYLE === 'true';

if (!endpoint || !region || !accessKeyId || !secretAccessKey) {
  console.error("Erro: Variáveis de ambiente do S3 (Minio) não configuradas corretamente.");
  // Lançar um erro ou usar um cliente mock/desabilitado pode ser uma opção
  // Por enquanto, vamos logar e permitir que a aplicação continue, mas as operações S3 falharão.
}

// Configuração do cliente S3
// Nota: Certifique-se de que @aws-sdk/client-s3 está instalado: pnpm install @aws-sdk/client-s3
export const s3Client = new S3Client({
  endpoint: endpoint,
  region: region,
  credentials: {
    accessKeyId: accessKeyId!, // O ! assume que a validação acima falharia se fossem nulos
    secretAccessKey: secretAccessKey!,
  },
  forcePathStyle: forcePathStyle, // Importante para Minio
});

console.log(`[S3 Client] Cliente S3 inicializado para endpoint: ${endpoint}, Região: ${region}, ForcePathStyle: ${forcePathStyle}`);

// Opcional: Exportar o nome do bucket também para facilitar o uso
export const s3BucketName = process.env.STORAGE_BUCKET_NAME;

if (!s3BucketName) {
    console.error("Erro: Variável de ambiente STORAGE_BUCKET_NAME não definida.");
} 