import Link from "next/link";

export function Wordmark({
  className = "",
  light = false,
}: {
  className?: string;
  light?: boolean;
}) {
  return (
    <Link
      href="/"
      className={`font-heading text-xl font-700 tracking-tight ${
        light ? "text-white" : "text-navy"
      } ${className}`}
      aria-label="Rowan Copy home"
    >
      {/* Text wordmark — replace with a logo image when supplied. */}
      Rowan<span className={light ? "text-accent" : "text-accent"}> Copy</span>
    </Link>
  );
}
