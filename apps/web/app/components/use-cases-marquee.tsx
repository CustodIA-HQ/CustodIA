import { PRODUCT_CASES } from "../cases";
import { UseCaseCard } from "./use-case-card";

function CaseRow({ hidden }: { hidden?: boolean }) {
  return (
    <div className="use-cases-marquee__group" aria-hidden={hidden || undefined}>
      {PRODUCT_CASES.map((item) => (
        <UseCaseCard key={`${hidden ? "dup" : "src"}-${item.template}`} item={item} hidden={hidden} />
      ))}
    </div>
  );
}

export function UseCasesMarquee() {
  return (
    <div className="use-cases-marquee" aria-label="Use case interfaces">
      <div className="use-cases-marquee__fade use-cases-marquee__fade--left" />
      <div className="use-cases-marquee__fade use-cases-marquee__fade--right" />
      <div className="use-cases-marquee__track">
        <CaseRow />
        <CaseRow hidden />
      </div>
    </div>
  );
}
