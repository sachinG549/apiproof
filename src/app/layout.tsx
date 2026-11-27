import type { Metadata } from "next";
import { IBM_Plex_Mono, Newsreader, Outfit } from "next/font/google";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { getConfig } from "@/lib/config";
import "./globals.css";

const sans = Outfit({ subsets: ["latin"], variable: "--font-outfit" });
const serif = Newsreader({ subsets: ["latin"], variable: "--font-newsreader" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex" });

const config = getConfig();

export const metadata: Metadata = {
  metadataBase: new URL(config.siteUrl),
  title: {
    default: "APIProof — task success for OpenAPI",
    template: "%s · APIProof",
  },
  description:
    "Static linters score how an OpenAPI spec looks. APIProof measures whether an agent can actually finish a task against a mock of that API.",
  openGraph: {
    title: "APIProof — task success for OpenAPI",
    description: "Hand an agent your spec and a real task. See if the job gets done.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable} ${mono.variable}`}>
      <body className="min-h-screen font-sans text-ink antialiased">
        <Header />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
