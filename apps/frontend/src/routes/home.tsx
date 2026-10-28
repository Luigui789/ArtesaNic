import { PublicLayout } from "@/components/layout/public-layout";
import { HeroSection } from "@/components/home/hero-section";
import { HowItWorksSection } from "@/components/home/how-it-works-section";
import { ArtisanSection } from "@/components/home/artisan-section";
import { DiscoverPreview } from "@/components/home/discover-preview";
import { FinalCta } from "@/components/home/final-cta";
import { useDocumentHead } from "@/hooks/use-document-head";

export default function Home() {
  useDocumentHead({
    title: "ArtesaNic | Artesanía de Masaya",
    meta: [
      {
        name: "description",
        content:
          "Conecta con talleres artesanales de Masaya, descubre sus productos y conoce cómo ArtesaNic facilita las solicitudes y pedidos.",
      },
      { property: "og:title", content: "ArtesaNic | Artesanía de Masaya" },
      {
        property: "og:description",
        content:
          "Conecta con talleres artesanales de Masaya, descubre sus productos y conoce cómo ArtesaNic facilita las solicitudes y pedidos.",
      },
      { property: "og:url", content: "/" },
    ],
    canonical: "/",
  });

  return (
    <PublicLayout>
      <HeroSection />
      <DiscoverPreview />
      <HowItWorksSection />
      <ArtisanSection />
      <FinalCta />
    </PublicLayout>
  );
}
