"use client";

import { useState } from "react";

/**
 * A textarea with a live character / word counter and an optional character
 * limit (useful for length-constrained copy like captions under 280 chars).
 */
export function CountedTextarea({
  name,
  rows = 6,
  placeholder,
  defaultValue = "",
  limit,
  required,
  id,
}: {
  name: string;
  rows?: number;
  placeholder?: string;
  defaultValue?: string;
  limit?: number;
  required?: boolean;
  id?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const chars = value.length;
  const words = value.trim() ? value.trim().split(/\s+/).length : 0;
  const over = limit != null && chars > limit;

  return (
    <div>
      <textarea
        id={id}
        name={name}
        rows={rows}
        placeholder={placeholder}
        required={required}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className={`input ${over ? "border-red-400 focus:ring-red-200" : ""}`}
      />
      <div className="mt-1 flex justify-end gap-3 text-xs">
        <span className={over ? "font-600 text-red-600" : "text-navy-400"}>
          {chars}{limit != null ? ` / ${limit}` : ""} chars
        </span>
        <span className="text-navy-400">{words} words</span>
      </div>
    </div>
  );
}
