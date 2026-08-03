import Link from "next/link";
import Image from "next/image";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/dashboard" className="brand" aria-label="K-Labs Chatbot dashboard">
      <span className="brand-mark" aria-hidden="true"><Image src="/klabs-mark.png" width={64} height={64} alt="" priority /></span>
      {!compact ? (
        <span className="brand-copy">
          <strong>K-Labs</strong>
          <small>Website AI</small>
        </span>
      ) : null}
    </Link>
  );
}
