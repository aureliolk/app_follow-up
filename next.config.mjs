// next.config.mjs (ou next.config.js)

/** @type {import('next').NextConfig} */
const nextConfig = {
    // --- Configurações Recomendadas ---
  
    // Ativa o Strict Mode do React em desenvolvimento para ajudar a encontrar problemas.
    // Não afeta a produção.
    reactStrictMode: true,
  
    // --- Otimização Essencial para Docker ---
    // Gera uma saída otimizada para deploy isolado (containers).
    // Cria a pasta .next/standalone com o mínimo necessário para rodar.
    // REQUER AJUSTES NO Dockerfile (estágio 'runner') - veja nota abaixo.
    output: 'standalone',
  
    // --- Configurações Opcionais (Descomente e ajuste se necessário) ---
  
    // Otimização de Imagens: Se você usa o componente <Image> do Next.js
    // com imagens de domínios externos.
    // images: {
    //   remotePatterns: [
    //     {
    //       protocol: 'https',
    //       hostname: 'images.example.com', // Exemplo: domínio das suas imagens
    //     },
    //     // Adicione outros domínios permitidos aqui
    //   ],
    // },
  
    // Variáveis de Ambiente Públicas:
    // Se precisar expor alguma variável de ambiente para o navegador.
    // IMPORTANTE: NUNCA exponha segredos (API keys, senhas) aqui.
    // Use o prefixo NEXT_PUBLIC_ no nome da variável no seu .env
    // env: {
    //   NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    // },
  
    // Configurações Experimentais: Use com cautela.
    // Server Actions já são estáveis no Next 14+, então não precisa habilitar aqui.
    // experimental: {
    //   // Exemplo: Habilitar alguma feature específica
    // },
  };
  
  // Escolha a forma de exportar baseada na extensão do arquivo:
  // Para next.config.mjs (ES Modules)
  export default nextConfig;
  
  // Para next.config.js (CommonJS)
  // module.exports = nextConfig;