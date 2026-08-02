import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "K-Labs Website AI", template: "%s · K-Labs Website AI" },
  description: "Secure, reusable website chatbots managed by K-Labs.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
