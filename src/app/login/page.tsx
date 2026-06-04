import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "./LoginForm";
import { Wordmark } from "@/components/Wordmark";
import { getCurrentUser } from "@/lib/authz";

export const metadata: Metadata = {
  title: "Portal Login",
  description: "Log in to the Rowan Copy client and team portal.",
  robots: { index: false },
};

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/portal");

  return (
    <div className="flex min-h-screen flex-col bg-navy-50/50">
      <div className="container-x flex h-16 items-center">
        <Wordmark />
      </div>
      <div className="flex flex-1 items-center justify-center px-5 py-12">
        <div className="w-full max-w-md">
          <div className="card p-8">
            <h1 className="text-2xl font-700 text-navy">Portal login</h1>
            <p className="mt-1 text-sm text-navy-600">
              Clients and team members sign in here.
            </p>
            <div className="mt-6">
              <LoginForm />
            </div>
          </div>
          <p className="mt-6 text-center text-sm text-navy-500">
            Not a client yet?{" "}
            <Link href="/contact" className="link">
              Get a quote
            </Link>{" "}
            or{" "}
            <Link href="/" className="link">
              back to the site
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
