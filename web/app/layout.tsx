import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AccountProvider } from "@/components/AccountProvider";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Hourglass — spot GPU-hours on Monad",
  description:
    "Physically-settled, SLA-backed GPU-hour tokens. Buy compute, redeem it for a real machine, get paid automatically when the provider misses its SLA.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <AccountProvider>{children}</AccountProvider>
      </body>
    </html>
  );
}
