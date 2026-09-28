import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Pacotes internos do monorepo são TypeScript puro e compilados pelo Next.
  transpilePackages: ["@lep/core", "@lep/db", "@lep/funding", "@lep/ingestion", "@lep/projects"],
  // pdfjs-dist (texto de PDF, etapa 7) roda no Node sem ser empacotado.
  serverExternalPackages: ["pdfjs-dist"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
