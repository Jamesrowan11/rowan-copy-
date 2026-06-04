"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { uploadDocument } from "@/app/admin/actions";

type Result = { ok: boolean; error?: string };

export function DocumentUpload({
  clientId,
  projectId,
  allowNotify = true,
}: {
  clientId: string;
  projectId?: string;
  allowNotify?: boolean;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(
    uploadDocument,
    { ok: false } as Result,
  );

  useEffect(() => {
    if (state.ok) {
      router.refresh();
      formRef.current?.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form ref={formRef} action={action} className="space-y-3">
      <input type="hidden" name="clientId" value={clientId} />
      {projectId && <input type="hidden" name="projectId" value={projectId} />}
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <div>
          <input
            type="file"
            name="file"
            required
            accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.gif,.webp,.txt"
            className="block w-full text-sm text-navy-600 file:mr-3 file:rounded-lg file:border-0 file:bg-navy file:px-3 file:py-2 file:text-sm file:font-600 file:text-white hover:file:bg-navy-600"
          />
        </div>
        <select name="kind" className="input !w-auto !py-2 text-sm" defaultValue="deliverable">
          <option value="deliverable">Deliverable</option>
          <option value="document">Document</option>
        </select>
      </div>
      {allowNotify && (
        <label className="flex items-center gap-2 text-sm text-navy-600">
          <input type="checkbox" name="notify" defaultChecked className="rounded" />
          Email the client that a new file is ready
        </label>
      )}
      <div className="flex items-center gap-3">
        <button type="submit" className="btn-primary btn-sm" disabled={pending}>
          {pending ? "Uploading…" : "Upload file"}
        </button>
        {state.error && <span className="text-sm text-red-600">{state.error}</span>}
      </div>
      <p className="text-xs text-navy-400">PDF, DOCX, images, or TXT · up to 15 MB.</p>
    </form>
  );
}
