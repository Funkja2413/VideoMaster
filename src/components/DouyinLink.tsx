import type { ReactNode } from "react";
import { canonicalDouyinUrl, canonicalHttpUrl } from "../lib/url";

export function DouyinLink({
  href,
  children,
  className,
  label,
}: {
  href: string;
  children: ReactNode;
  className?: string;
  label?: string;
}) {
  const safe = canonicalDouyinUrl(href);
  if (!safe) return <span className={className}>{children}</span>;
  return (
    <a className={className} href={safe} target="_blank" rel="noopener noreferrer" aria-label={label}>
      {children}
    </a>
  );
}

export function HttpLink({ href, children }: { href: string; children: ReactNode }) {
  const safe = canonicalHttpUrl(href);
  if (!safe) return <span>{children}</span>;
  return (
    <a href={safe} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}
