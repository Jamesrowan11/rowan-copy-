"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleAutomation } from "../actions";
import type { AutomationKey } from "@/lib/automations";

type Item = {
  key: AutomationKey;
  label: string;
  description: string;
  enabled: boolean;
};

export function AutomationToggles({ items }: { items: Item[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-1">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {items.map((item) => (
        <label
          key={item.key}
          className="flex cursor-pointer items-start gap-3 rounded-lg p-3 transition-colors hover:bg-navy-50/60"
        >
          <input
            type="checkbox"
            checked={item.enabled}
            disabled={pending}
            className="mt-1 rounded"
            onChange={(e) => {
              const next = e.target.checked;
              start(async () => {
                const res = await toggleAutomation(item.key, next);
                if (!res.ok) setError(res.error || "Failed to save.");
                else router.refresh();
              });
            }}
          />
          <span>
            <span className="block text-sm font-600 text-navy">{item.label}</span>
            <span className="block text-xs text-navy-500">{item.description}</span>
          </span>
        </label>
      ))}
    </div>
  );
}
