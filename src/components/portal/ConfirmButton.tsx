"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Result = { ok: boolean; error?: string };

/**
 * A button that invokes a bound server action, optionally confirming first.
 * Refreshes the route on success so revalidated data shows immediately.
 * Used for destructive / sensitive actions and simple one-click mutations.
 */
export function ConfirmButton({
  action,
  confirm,
  children,
  className = "btn-danger btn-sm",
  onDone,
}: {
  action: () => Promise<Result>;
  confirm?: string;
  children: React.ReactNode;
  className?: string;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        className={className}
        disabled={pending}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          setError(null);
          start(async () => {
            const res = await action();
            if (!res.ok) setError(res.error || "Something went wrong.");
            else {
              router.refresh();
              onDone?.();
            }
          });
        }}
      >
        {pending ? "Working…" : children}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
