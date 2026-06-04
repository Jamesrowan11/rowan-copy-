import Link from "next/link";
import { Wordmark } from "@/components/Wordmark";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-navy-50/40 px-5 text-center">
      <Wordmark />
      <div>
        <p className="font-heading text-6xl font-700 text-navy">404</p>
        <h1 className="mt-2 text-2xl font-600 text-navy">Page not found</h1>
        <p className="mt-2 max-w-sm text-navy-600">
          That page doesn&apos;t exist, or you don&apos;t have access to it.
        </p>
      </div>
      <div className="flex gap-3">
        <Link href="/" className="btn-outline">
          Home
        </Link>
        <Link href="/portal" className="btn-primary">
          Go to portal
        </Link>
      </div>
    </div>
  );
}
