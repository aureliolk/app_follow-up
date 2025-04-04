import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true, // Mude para false após corrigir erros
  },
  images: {
    formats: ['image/avif', 'image/webp'], // Exemplo para otimização
  },
  transpilePackages: ['@meuprojeto/shared-lib']
};

export default nextConfig;
