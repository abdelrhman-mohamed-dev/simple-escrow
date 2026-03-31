import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ESCROW - Transaction Manager",
  description: "Track and manage escrow transactions with ease",
};

export const viewport: Viewport = {
  themeColor: "#0f172a", // sleek dark blue theme color for native feel
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
      className={`${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900 font-sans overscroll-none overflow-x-hidden selection:bg-indigo-100">
        {children}
      </body>
    </html>
  );
}
