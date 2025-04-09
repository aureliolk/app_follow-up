// lib/encryption.ts
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // GCM recomendado
const AUTH_TAG_LENGTH = 16; // GCM recomendado

// Pega a chave do ambiente - AGORA USANDO ENCRYPTION_KEY
const ENCRYPTION_KEY_HEX = process.env.ENCRYPTION_KEY;

// Validação robusta da chave
if (!ENCRYPTION_KEY_HEX || ENCRYPTION_KEY_HEX.length !== 64) {
    // Em desenvolvimento, um aviso pode ser ok, mas em produção isso deve ser um erro fatal.
    // Considerar lançar um erro aqui em ambiente de produção.
    console.error('ERRO CRÍTICO: ENCRYPTION_KEY inválida ou não definida no .env. Deve ser uma string hexadecimal de 64 caracteres (32 bytes).');
    // Descomente a linha abaixo para impedir a inicialização se a chave for inválida:
    // throw new Error('ENCRYPTION_KEY inválida ou não definida no .env. Deve ser uma string hexadecimal de 64 caracteres (32 bytes).');
}

// Cria o Buffer da chave. Se a validação acima não lançou erro,
// mas a chave for inválida por outro motivo (ex: caracteres não hex),
// Buffer.from lançará um erro aqui.
// Usamos uma string vazia como fallback caso a validação esteja comentada,
// mas isso causará falha em encrypt/decrypt.
const ENCRYPTION_KEY = Buffer.from(ENCRYPTION_KEY_HEX || '', 'hex');

export function encrypt(text: string): string {
    // A validação principal já ocorreu na inicialização do módulo.
    // Se chegou aqui, ENCRYPTION_KEY deve ser um buffer válido.
    // Adicionamos um check extra para segurança em tempo de execução, caso a validação inicial seja pulada.
    if (ENCRYPTION_KEY.length !== 32) {
         console.error('CRIPTOGRAFIA FALHOU: Comprimento da ENCRYPTION_KEY incorreto em tempo de execução.');
         throw new Error("Falha ao criptografar dados: Chave de criptografia inválida.");
    }
    try {
        const iv = crypto.randomBytes(IV_LENGTH); // Gera um IV aleatório
        const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);

        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');

        const authTag = cipher.getAuthTag();

        // Combina IV, AuthTag e Texto Criptografado para armazenamento
        // Formato: iv(hex):authTag(hex):encryptedData(hex)
        return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
    } catch (error) {
        console.error("Erro na criptografia:", error);
        throw new Error("Falha ao criptografar os dados.");
    }
}

export function decrypt(hash: string): string {
    // Validação em tempo de execução
    if (ENCRYPTION_KEY.length !== 32) {
        console.error('DESCRIPTOGRAFIA FALHOU: Comprimento da ENCRYPTION_KEY incorreto em tempo de execução.');
        throw new Error("Falha ao descriptografar dados: Chave de criptografia inválida.");
    }
    try {
        const parts = hash.split(':');
        if (parts.length !== 3) {
            throw new Error("Formato do hash de criptografia inválido.");
        }
        const [ivHex, authTagHex, encryptedDataHex] = parts;

        // Adiciona validações básicas para os hexadecimais antes de criar buffers
        if (!/^[0-9a-fA-F]+$/.test(ivHex) || !/^[0-9a-fA-F]+$/.test(authTagHex) || !/^[0-9a-fA-F]+$/.test(encryptedDataHex)) {
            throw new Error("Componentes do hash contêm caracteres não hexadecimais.");
        }
         if (Buffer.from(ivHex, 'hex').length !== IV_LENGTH) {
            throw new Error("Comprimento do IV inválido no hash.");
         }


        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');
        const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(encryptedDataHex, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    } catch (error: any) { // Captura como 'any' para acessar message
        console.error("Erro na descriptografia:", error.message || error);
        // Não lance o erro exato para o cliente, mas logue
        throw new Error("Falha ao descriptografar os dados. Verifique se o hash está correto e a ENCRYPTION_KEY corresponde à usada na criptografia.");
    }
}