"use client";

import { useActionState } from "react";
import { submitInquiry, type ContactState } from "./actions";
import { SERVICE_TYPES } from "@/lib/constants";

const initial: ContactState = { ok: false };

export function ContactForm() {
  const [state, formAction, pending] = useActionState(submitInquiry, initial);

  if (state.ok) {
    return (
      <div className="card p-8 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-2xl text-accent-hover">
          ✓
        </div>
        <h2 className="text-2xl font-600 text-navy">Thanks — got it.</h2>
        <p className="mt-2 text-navy-600">
          Your request landed in my inbox. I&apos;ll get back to you with a
          quote and a few questions, usually within one business day.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="card space-y-5 p-7" noValidate>
      {state.error && (
        <p className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700" role="alert">
          {state.error}
        </p>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Your name" name="name" required error={state.fieldErrors?.name} />
        <Field label="Business name" name="business" error={state.fieldErrors?.business} />
        <Field label="Email" name="email" type="email" required error={state.fieldErrors?.email} />
        <Field label="Phone" name="phone" type="tel" error={state.fieldErrors?.phone} />
      </div>

      <div>
        <label htmlFor="serviceType" className="label">
          What do you need? <span className="text-accent">*</span>
        </label>
        <select id="serviceType" name="serviceType" className="input" required defaultValue="">
          <option value="" disabled>
            Choose a service…
          </option>
          {SERVICE_TYPES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {state.fieldErrors?.serviceType && (
          <p className="mt-1 text-xs text-red-600">{state.fieldErrors.serviceType}</p>
        )}
      </div>

      <Field
        label="Budget (optional)"
        name="budget"
        placeholder="e.g. $300–$500, or not sure yet"
        error={state.fieldErrors?.budget}
      />

      <div>
        <label htmlFor="message" className="label">
          Tell me about the project <span className="text-accent">*</span>
        </label>
        <textarea
          id="message"
          name="message"
          rows={5}
          className="input"
          placeholder="What are you trying to get written, and by when?"
          required
        />
        {state.fieldErrors?.message && (
          <p className="mt-1 text-xs text-red-600">{state.fieldErrors.message}</p>
        )}
      </div>

      <button type="submit" className="btn-primary w-full" disabled={pending}>
        {pending ? "Sending…" : "Send request"}
      </button>
      <p className="text-center text-xs text-navy-400">
        No spam, ever. Your details are only used to reply to this request.
      </p>
    </form>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
  placeholder,
  error,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  error?: string;
}) {
  return (
    <div>
      <label htmlFor={name} className="label">
        {label} {required && <span className="text-accent">*</span>}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        className="input"
        required={required}
        placeholder={placeholder}
      />
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
