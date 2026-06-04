"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteInquiry,
  setInquiryStatus,
  convertInquiry,
} from "../actions";
import { INQUIRY_STATUSES } from "@/lib/constants";

export function InquiryActions({
  id,
  status,
  converted,
}: {
  id: string;
  status: string;
  converted: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        defaultValue={status}
        className="input !w-auto !py-1.5 text-xs"
        disabled={pending}
        onChange={(e) =>
          start(async () => {
            await setInquiryStatus(id, e.target.value);
            router.refresh();
          })
        }
        aria-label="Inquiry status"
      >
        {INQUIRY_STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>

      {!converted && (
        <button
          type="button"
          className="btn-outline btn-sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const fd = new FormData();
              fd.set("inquiryId", id);
              const res = await convertInquiry({ ok: false }, fd);
              if (!res.ok) setError(res.error || "Failed");
              else router.refresh();
            })
          }
        >
          Convert to project
        </button>
      )}

      <button
        type="button"
        className="btn-danger btn-sm"
        disabled={pending}
        onClick={() => {
          if (!window.confirm("Delete this inquiry? This cannot be undone.")) return;
          start(async () => {
            const res = await deleteInquiry(id);
            if (!res.ok) setError(res.error || "Failed");
            else router.refresh();
          });
        }}
      >
        Delete
      </button>

      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
