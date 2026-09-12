import { createDb, tables } from "@custodia/db";
import { loadEnsConfig, ownerNameFromTaskEns, resolveTask, taskDirectoryPath } from "@custodia/ens";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { GuardUx } from "../../components/guard-ux";

export const dynamic = "force-dynamic";

export default async function GuardPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const db = createDb();
  const [task] = await db
    .select()
    .from(tables.tasks)
    .where(eq(tables.tasks.ensName, name))
    .limit(1);
  if (task) {
    redirect(
      taskDirectoryPath(ownerNameFromTaskEns(task.ensName, task.id), task.id, task.template),
    );
  }
  try {
    await resolveTask(loadEnsConfig(), name);
    return (
      <main className="guard-page">
        <div className="guard-page__topbar">
          <Link href="/chat">← Back to chat</Link>
          <span>ENS guard · Sepolia</span>
        </div>
        <GuardUx ensName={name} />
      </main>
    );
  } catch (error) {
    return (
      <main className="guard-page guard-page--error">
        <p className="guard-card__eyebrow">ENS guard</p>
        <h1>Unable to resolve this guard</h1>
        <p>{error instanceof Error ? error.message : "The ENS guard could not be resolved."}</p>
        <Link href="/chat">Return to chat</Link>
      </main>
    );
  }
}
