// lib/encryption.ts
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // GCM recomendado
const AUTH_TAG_LENGTH = 16; // GCM recomendado

// Pega a chave do ambiente.
const ENCRYPTION_KEY_HEX = process.env.NEXTAUTH_SECRET;

/* <<< VALIDAÇÃO COMENTADA >>>
if (!ENCRYPTION_KEY_HEX || ENCRYPTION_KEY_HEX.length !== 64) {
    console.warn('AVISO: ENCRYPTION_KEY inválida ou não definida. A criptografia pode falhar em tempo de execução.');
    // throw new Error('ENCRYPTION_KEY inválida ou não definida no .env. Deve ser uma string hexadecimal de 64 caracteres (32 bytes).');
}
*/

// Tenta criar o buffer mesmo que a chave seja inválida/ausente.
// Isso falhará em tempo de execução se ENCRYPTION_KEY_HEX for undefined ou incorreto.
const ENCRYPTION_KEY = Buffer.from(ENCRYPTION_KEY_HEX || '', 'hex');

export function encrypt(text: string): string {
    if (!ENCRYPTION_KEY_HEX || ENCRYPTION_KEY_HEX.length !== 64) {
        console.error('CRIPTOGRAFIA FALHOU: ENCRYPTION_KEY inválida ou ausente.');
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
    if (!ENCRYPTION_KEY_HEX || ENCRYPTION_KEY_HEX.length !== 64) {
        console.error('DESCRIPTOGRAFIA FALHOU: ENCRYPTION_KEY inválida ou ausente.');
        throw new Error("Falha ao descriptografar dados: Chave de criptografia inválida.");
    }
    try {
        const parts = hash.split(':');
        if (parts.length !== 3) {
            throw new Error("Formato do hash de criptografia inválido.");
        }
        const [ivHex, authTagHex, encryptedDataHex] = parts;

        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');
        const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(encryptedDataHex, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    } catch (error) {
        console.error("Erro na descriptografia:", error);
        // Não lance o erro exato para o cliente, mas logue
        throw new Error("Falha ao descriptografar os dados.");
    }
}