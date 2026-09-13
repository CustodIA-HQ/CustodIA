import type { PRODUCT_CASES } from "../cases";

type CaseItem = (typeof PRODUCT_CASES)[number];

function IconShield() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 3.2 5.2 6v5.4c0 4.2 2.8 7.9 6.8 9.2 4-1.3 6.8-5 6.8-9.2V6L12 3.2Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M12 8.2v7.2"
        stroke="var(--custodia-accent)"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconPortfolio() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="7.4" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M12 4.6V12l5.2 3.1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="12" cy="12" r="1.2" fill="var(--custodia-accent)" />
    </svg>
  );
}

function IconHealth() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 3.4 5.4 6.1v5.2c0 4 2.6 7.5 6.6 8.7 4-1.2 6.6-4.7 6.6-8.7V6.1L12 3.4Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M7.8 12.1h2.1l1.1-2.4 1.8 4.6 1.2-2.2h2.2"
        fill="none"
        stroke="var(--custodia-accent)"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconSpot() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="7.4" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M8.6 12.1h6.8m0 0-2.3-2.3m2.3 2.3-2.3 2.3"
        fill="none"
        stroke="var(--custodia-accent)"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconFutures() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4.6 16.2 8.4 11l3.3 2.7 4.2-6.1 3.5 3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M15.2 7.6h4.2v4.1"
        fill="none"
        stroke="var(--custodia-accent)"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconCompare() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M5 16.6h3.2V7.4H5zM10.4 16.6h3.2V10H10.4zM15.8 16.6H19V5.8h-3.2z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M5 16.6h14"
        stroke="var(--custodia-accent)"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconSignature() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M5.2 17.4c1.8-1.6 3.3-1.7 4.6-.3 1.4 1.5 2.8 1.4 4.6-.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="m14.2 6.6 3.2 3.2-7.4 7.4H6.8v-3.2z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M13.4 7.4 16.6 10.6" stroke="var(--custodia-accent)" strokeWidth="1.3" />
    </svg>
  );
}

function CaseIcon({ template }: { template: CaseItem["template"] }) {
  switch (template) {
    case "position_protection":
      return <IconShield />;
    case "portfolio_guard":
      return <IconPortfolio />;
    case "collateral_guard":
      return <IconHealth />;
    case "spot_execution":
      return <IconSpot />;
    case "futures_execution":
      return <IconFutures />;
    case "strategy_compare":
      return <IconCompare />;
    case "needs_human":
      return <IconSignature />;
    default:
      return <IconShield />;
  }
}

export function UseCaseCard({ item, hidden }: { item: CaseItem; hidden?: boolean }) {
  return (
    <a
      className="use-case-card"
      href={item.href}
      tabIndex={hidden ? -1 : undefined}
      aria-hidden={hidden || undefined}
    >
      <div className="use-case-card__frame">
        <div className="use-case-card__fill">
          <span className="use-case-card__sheen" />
          <span className="use-case-card__accent use-case-card__accent--tr" />
          <span className="use-case-card__accent use-case-card__accent--bl" />
          <span className="use-case-card__icon">
            <CaseIcon template={item.template} />
          </span>
          <span className="use-case-card__copy">
            <strong>{item.title}</strong>
            <span>{item.prompt}</span>
          </span>
          <span className="use-case-card__go" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path
                d="M7.5 12h9m0 0-3.4-3.4M16.5 12 13.1 15.4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </div>
      </div>
    </a>
  );
}
