import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: "#0b6e6a",
  colorScheme: "light",
};

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const base = new URL(`${protocol}://${host}`);
  const socialImage = new URL("/og.png", base).toString();

  return {
    metadataBase: base,
    title: "Entrena AHP | Tests históricos de Agentes de Hacienda",
    description: "Practica con 372 preguntas de convocatorias anteriores, explicaciones razonadas, historial y repaso de fallos.",
    applicationName: "Entrena AHP",
    manifest: "/manifest.webmanifest",
    icons: {
      icon: "/icon-192.png",
      apple: "/icon-192.png",
    },
    openGraph: {
      type: "website",
      url: base,
      title: "Entrena AHP",
      description: "Preguntas de convocatorias anteriores, explicaciones y panel de progreso · 2022–2025",
      locale: "es_ES",
      images: [{ url: socialImage, width: 1728, height: 909, alt: "Entrena AHP, preguntas oficiales 2022–2025" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Entrena AHP",
      description: "Tests históricos con puntuación directa oficial, explicaciones y repaso de fallos.",
      images: [socialImage],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
