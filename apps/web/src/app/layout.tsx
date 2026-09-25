import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "LEP", template: "%s · LEP" },
  description: "Plataforma de inteligência e automação da LEP Filmes",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
