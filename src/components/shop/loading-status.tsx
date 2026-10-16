import type { ReactNode } from "react";

/** Decorative CSS-only animation. The adjacent text communicates the real state. */
export function LoadingSpinner({ className = "" }: { className?: string }) {
  return <svg data-loading-spinner="true" aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" className={`inline-block h-[18px] w-[18px] shrink-0 align-middle motion-safe:animate-spin motion-reduce:animate-none ${className}`}>
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.2" />
    <path d="M12 3a9 9 0 0 1 9 9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
  </svg>;
}

/** Mount only for an actual pending operation, never for a disabled or idle form. */
export function LoadingStatus({ children, className = "", announce = true }: { children: ReactNode; className?: string; announce?: boolean }) {
  return <span role={announce ? "status" : undefined} aria-live={announce ? "polite" : undefined} aria-atomic={announce ? true : undefined} className={`inline-flex min-w-0 max-w-full items-center gap-2 align-middle ${className}`}>
    <LoadingSpinner />{children}
  </span>;
}
