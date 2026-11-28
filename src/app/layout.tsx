import type { Metadata } from "next";
import { IBM_Plex_Mono, Newsreader, Outfit } from "next/font/google";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { getConfig } from "@/lib/config";
import "./globals.css";

const sans = Outfit({ subsets: ["latin"], variable: "--font-outfit" });
const serif = Newsreader({ subsets: ["latin"], variable: "--font-newsreader" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex" });

const siteUrl = getConfig().siteUrl.replace(/\/$/, "");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  alternates: { canonical: siteUrl },
  title: {
    default: "APIProof — task success for OpenAPI",
    template: "%s · APIProof",
  },
  description:
    "APIProof tests whether an AI agent can complete tasks against your OpenAPI spec. It is not a linter. Paste a spec, name the tasks, and share the report.",
  openGraph: {
    title: "APIProof — can an agent actually use your API?",
    description: "Run tasks against a mock of your OpenAPI spec and see whether the agent finished the job.",
    type: "website",
    url: siteUrl,
    images: [{ url: `${siteUrl}/opengraph-image`, width: 1200, height: 630, alt: "APIProof" }],
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
