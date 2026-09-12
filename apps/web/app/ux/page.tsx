import { SiteFooter, SiteHeader } from "../components/site-header";
import { UxPlayground } from "./playground";

export default function UxIndexPage() {
  return (
    <main className="product-page product-page--lab" id="main">
      <SiteHeader active="cases" />
      <UxPlayground />
      <SiteFooter />
    </main>
  );
}
