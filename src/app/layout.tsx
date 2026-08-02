import type { Metadata, Viewport } from "next";
import { Archivo, Archivo_Black } from "next/font/google";
import "./globals.css";

const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo",
  display: "swap",
});

const archivoBlack = Archivo_Black({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-archivo-black",
  display: "swap",
});

export const metadata: Metadata = {
  title: "TV Tracker",
  description: "Track the TV shows and anime you're watching, and when the next episode airs.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "TV Tracker",
    statusBarStyle: "default",
  },
};

// Pinch-zoom is deliberately disabled per the user's request, on top of the
// 16px form-control font-size fix in globals.css that already stops iOS's
// auto-zoom-on-focus.
export const viewport: Viewport = {
  themeColor: "#f3eedf",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${archivo.variable} ${archivoBlack.variable} h-full antialiased`}
    >
      <body className="min-h-full overflow-x-hidden">{children}</body>
    </html>
  );
}
