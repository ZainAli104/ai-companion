import React from "react";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ClerkProvider } from '@clerk/nextjs'

import {cn} from "@/lib/utils";
import {Toaster} from "@/components/ui/toaster";
import {ThemeProvider} from "@/provider/theme-provider";
import NextNProgressClient from "@/components/ui/next-progress";

import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "AI Companion",
  description: "AI Companion - Where you can generate AI avatar and chat with them.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
      <ClerkProvider>
        <html lang="en" suppressHydrationWarning>
          <body className={cn("bg-secondary", inter.className)}>
              <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
                  <NextNProgressClient />
                  {children}
                  <Toaster />
              </ThemeProvider>
          </body>
        </html>
      </ClerkProvider>
  );
}
