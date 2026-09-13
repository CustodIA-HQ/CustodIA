import Link from "next/link";

export function BackToHome({ className }: { className?: string }) {
  return (
    <Link
      className={className ? `back-to-home ${className}` : "back-to-home"}
      href="/"
      aria-label="Back to CustodIA"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M15.2 5.2 8.4 12l6.8 6.8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span>Back</span>
    </Link>
  );
}
