import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true, // Mude para false após corrigir erros
  },
  images: {
    formats: ['image/avif', 'image/webp'], // Exemplo para otimização
  }
};

export default nextConfig;
