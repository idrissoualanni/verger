import type { NextConfig } from "next";

const API_URL = process.env.API_URL ?? "http://localhost:8788";
const IS_PROD = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  // Cloudflare Pages : output standalone pour déploiement optimisé
  output: IS_PROD ? "standalone" : undefined,

  // Images : autoriser Unsplash (landing, login, register, tarifs) + R2 en prod
  images: {
    remotePatterns: [
      {
        protocol: "https" as const,
        hostname: "images.unsplash.com",
      },
      ...(IS_PROD
        ? [
            {
              protocol: "https" as const,
              hostname: "**.r2.cloudflarestorage.com",
            },
          ]
        : []),
    ],
  },

  /* Proxy /api/* → worker (apps/api). Cookies de session first-party :
     le navigateur parle toujours à localhost:3000, le worker valide la
     session via le cookie signé. En prod, pointer API_URL vers le domaine
     du worker (déploiement E22). */
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${API_URL}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
