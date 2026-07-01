"use client";

import { useState } from "react";

/** Small reusable "copy to clipboard" button with transient confirmation. */
export function CopyButton({
  text,
  label = "Copy",
  className = "text-xs text-copper hover:underline",
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        } catch {
          /* clipboard blocked — ignore */
        }
      }}
    >
      {done ? "Copied ✓" : label}
    </button>
  );
}
