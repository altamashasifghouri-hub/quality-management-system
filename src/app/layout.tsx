import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import ThreeBackground from "@/components/ThreeBackground";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Quality Management System",
  description: "Enterprise Quality Management System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <ThreeBackground />
        {children}
      </body>
    </html>
  );
}
