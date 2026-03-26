import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Engagement Dashboard",
  description: "HubSpot contact frequency, spend, and ease-to-reach scores by owner",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 antialiased">{children}</body>
    </html>
  );
}
