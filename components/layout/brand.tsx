import Link from "next/link";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/dashboard" className="brand" aria-label="K-Labs Chatbot dashboard">
      <span className="brand-mark" aria-hidden="true"><i>K</i></span>
      {!compact ? (
        <span className="brand-copy">
          <strong>K-Labs</strong>
          <small>Website AI</small>
        </span>
      ) : null}
    </Link>
  );
}
