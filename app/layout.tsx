import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { AuthProvider } from "@/context/AuthContext";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "Profil — Feux de forêt",
  description: "Connexion et gestion d'abonnement",
  icons: {
    icon: [{ url: "/icone.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icone.svg", type: "image/svg+xml" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className={cn("font-sans", outfit.variable)}>
      <body className={cn(outfit.className, "antialiased")}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
