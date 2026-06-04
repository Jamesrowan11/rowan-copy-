"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateProjectStatusStaff } from "../../actions";
import { PROJECT_STATUSES } from "@/lib/constants";

export function StaffStatusControl({
  projectId,
  status,
}: {
  projectId: string;
  status: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="text-sm font-medium text-navy-600" htmlFor="status">Status</label>
      <select
        id="status"
        className="input !w-auto !py-1.5"
        value={status}
        disabled={pending}
        onChange={(e) =>
          start(async () => {
            const res = await updateProjectStatusStaff(projectId, e.target.value);
            if (!res.ok) setError(res.error || "Failed");
            else router.refresh();
          })
        }
      >
        {PROJECT_STATUSES.filter((s) => s !== "Cancelled").map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
