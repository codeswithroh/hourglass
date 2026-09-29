import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AccountProvider } from "@/components/AccountProvider";
import { Header } from "@/components/Header";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Hourglass — spot GPU-hours on Monad",
  description: "Physically-settled, SLA-backed GPU-hour tokens. Buy compute, redeem for a real machine, get paid when the provider misses its SLA.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <AccountProvider>
          <Header />
          <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-8">{children}</main>
          <footer className="border-t border-line text-xs text-muted py-4 text-center">
            Hourglass · Monad testnet · Tokens are prepaid, physically-delivered compute credits
          </footer>
        </AccountProvider>
      </body>
    </html>
  );
}
