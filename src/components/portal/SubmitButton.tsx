"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({
  children,
  className = "btn-primary",
  idleText,
}: {
  children?: React.ReactNode;
  className?: string;
  idleText?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? "Saving…" : children ?? idleText ?? "Save"}
    </button>
  );
}
