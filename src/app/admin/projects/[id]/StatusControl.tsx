"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  updateProjectStatus,
  cancelProject,
  reinstateProject,
} from "../../actions";
import { PROJECT_STATUSES } from "@/lib/constants";

export function StatusControl({
  projectId,
  status,
}: {
  projectId: string;
  status: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [showCancel, setShowCancel] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const cancelled = status === "Cancelled";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm font-medium text-navy-600" htmlFor="status">
          Status
        </label>
        <select
          id="status"
          className="input !w-auto !py-1.5"
          value={status}
          disabled={pending || cancelled}
          onChange={(e) =>
            start(async () => {
              const res = await updateProjectStatus(projectId, e.target.value);
              if (!res.ok) setError(res.error || "Failed");
              else router.refresh();
            })
          }
        >
          {PROJECT_STATUSES.filter((s) => s !== "Cancelled").map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
          {cancelled && <option value="Cancelled">Cancelled</option>}
        </select>

        {!cancelled ? (
          <button
            type="button"
            className="btn-danger btn-sm"
            disabled={pending}
            onClick={() => setShowCancel((v) => !v)}
          >
            Cancel project
          </button>
        ) : (
          <button
            type="button"
            className="btn-outline btn-sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await reinstateProject(projectId);
                if (!res.ok) setError(res.error || "Failed");
                else router.refresh();
              })
            }
          >
            Reinstate
          </button>
        )}
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {showCancel && !cancelled && (
        <div className="rounded-lg border border-red-200 bg-red-50/60 p-3">
          <label className="label text-red-700" htmlFor="reason">
            Reason for cancelling (kept on record)
          </label>
          <textarea
            id="reason"
            className="input"
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className="btn-danger btn-sm"
              disabled={pending || !reason.trim()}
              onClick={() => {
                if (!window.confirm("Cancel this project? It will be kept, marked Cancelled.")) return;
                start(async () => {
                  const fd = new FormData();
                  fd.set("id", projectId);
                  fd.set("reason", reason);
                  const res = await cancelProject({ ok: false }, fd);
                  if (!res.ok) setError(res.error || "Failed");
                  else {
                    setShowCancel(false);
                    router.refresh();
                  }
                });
              }}
            >
              Confirm cancel
            </button>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setShowCancel(false)}>
              Keep project
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
