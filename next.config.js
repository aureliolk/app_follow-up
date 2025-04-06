/** @type {import('next').NextConfig} */
const nextConfig = {
    output: 'standalone', // Importante para Docker
    experimental: {
        // Desabilitar se não estiver usando
        serverComponentsExternalPackages: [],
    },
    // Adicione outras configurações se necessário
}

module.exports = nextConfig