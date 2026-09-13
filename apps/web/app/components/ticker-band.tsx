const TICKER_ITEMS = [
  "WHATSAPP",
  "TELEGRAM",
  "REVIEW",
  "CHARTS",
  "CONFIRM",
  "SELF-CUSTODIAL",
  "SECURE APPROVAL",
  "CONTEXT FIRST",
  "NO BLIND EXECUTION",
  "CUSTODIA",
] as const;

function FalconMark() {
  return (
    <img
      className="ticker-band__mark"
      src="/brand/falcon-eye/falcon-eye-reference.png"
      alt=""
      width={1448}
      height={1086}
    />
  );
}

function TickerRow({ hidden }: { hidden?: boolean }) {
  return (
    <div className="ticker-band__row" aria-hidden={hidden || undefined}>
      {TICKER_ITEMS.map((item) => (
        <span className="ticker-band__item" key={`${hidden ? "dup" : "src"}-${item}`}>
          <FalconMark />
          {item}
        </span>
      ))}
    </div>
  );
}

export function TickerBand({ direction }: { direction: "ltr" | "rtl" }) {
  return (
    <div className={`ticker-band ticker-band--${direction}`} aria-hidden="true">
      <div className="ticker-band__track">
        <TickerRow />
        <TickerRow hidden />
      </div>
    </div>
  );
}
