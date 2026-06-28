import type { NameserverStatus } from "@/lib/nameservers";

/**
 * Shows whether a domain's nameservers point at our server. When they don't, it
 * tells the user exactly what to change their nameservers to at their registrar.
 * Audience-aware copy via `tone`: "admin" or "client".
 */
export function NameserverNotice({
  status,
  tone = "client",
}: {
  status: NameserverStatus;
  tone?: "admin" | "client";
}) {
  // Couldn't resolve the NS at all — stay quiet rather than alarm.
  if (!status.checked) return null;

  if (status.pointsHere) {
    return (
      <div className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
        ✓ This domain&apos;s nameservers point to us, so records you add here take effect.
      </div>
    );
  }

  return (
    <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <p className="font-600">Your DNS isn&apos;t managed here yet — changes below won&apos;t take effect.</p>
      <p className="mt-1">
        The domain&apos;s nameservers currently point to{" "}
        <span className="font-mono">{status.current.join(", ") || "an external provider"}</span>.
        {tone === "admin"
          ? " To manage its DNS in the portal, change the nameservers at the domain's registrar to:"
          : " To manage your DNS here, sign in to your domain registrar and change the nameservers to:"}
      </p>
      <ul className="mt-2 space-y-0.5">
        {status.expected.map((ns) => (
          <li key={ns} className="font-mono font-600 text-amber-950">{ns}</li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-amber-700">
        Nameserver changes can take 24–48 hours to take effect worldwide.
      </p>
    </div>
  );
}
