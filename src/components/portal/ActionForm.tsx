"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

type Result = { ok: boolean; error?: string };

/**
 * Wraps a (prevState, FormData) => Result server action with consistent
 * error/success handling. Refreshes the route on success and (optionally)
 * resets the form. Pass the form fields as children.
 */
export function ActionForm({
  action,
  children,
  submitText = "Save",
  successText,
  className = "space-y-4",
  resetOnSuccess = false,
  hidden,
}: {
  action: (prev: Result, fd: FormData) => Promise<Result>;
  children?: React.ReactNode;
  submitText?: string;
  successText?: string;
  className?: string;
  resetOnSuccess?: boolean;
  hidden?: Record<string, string>;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(action, { ok: false });

  useEffect(() => {
    if (state.ok) {
      router.refresh();
      if (resetOnSuccess) formRef.current?.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className={className}>
      {hidden &&
        Object.entries(hidden).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
      {children}
      <div className="flex items-center gap-3">
        <button type="submit" className="btn-primary btn-sm" disabled={pending}>
          {pending ? "Saving…" : submitText}
        </button>
        {state.error && <span className="text-sm text-red-600">{state.error}</span>}
        {state.ok && successText && (
          <span className="text-sm text-emerald-600">{successText}</span>
        )}
      </div>
    </form>
  );
}
