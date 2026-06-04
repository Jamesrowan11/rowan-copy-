import { COMPANY } from "@/lib/constants";

// JSON-LD ProfessionalService schema for SEO.
export function ProfessionalServiceJsonLd() {
  const appUrl = process.env.APP_URL || "https://rowancopy.com";
  const data = {
    "@context": "https://schema.org",
    "@type": "ProfessionalService",
    name: COMPANY.name,
    description:
      "Freelance copywriting and web studio. Website copy, policies, social captions, and marketing emails for small businesses.",
    slogan: COMPANY.tagline,
    email: COMPANY.email,
    url: appUrl,
    founder: { "@type": "Person", name: COMPANY.owner },
    areaServed: "US",
    address: {
      "@type": "PostalAddress",
      addressRegion: "MD",
      addressLocality: "Howard County",
      addressCountry: "US",
    },
    priceRange: "$$",
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
