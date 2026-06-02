import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Day 28 - RAG Runtime V5 · Memory-aware Retrieval Pipeline",
  description:
    "RAG V5：Memory-aware Query Rewrite、Retrieval Pipeline、ambiguous detector、knowledgeTopics、pipeline metrics 与 RAG Debug Panel V5",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className="h-full antialiased"
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
