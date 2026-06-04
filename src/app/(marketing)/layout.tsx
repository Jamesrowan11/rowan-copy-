import { SiteHeader } from "@/components/marketing/SiteHeader";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { ProfessionalServiceJsonLd } from "@/components/marketing/JsonLd";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <span id="top" />
      <ProfessionalServiceJsonLd />
      <SiteHeader />
      <main id="main">{children}</main>
      <SiteFooter />
    </>
  );
}
