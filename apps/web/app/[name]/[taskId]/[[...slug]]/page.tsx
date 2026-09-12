import { createDb, tables } from "@custodia/db";
import {
  getParentName,
  loadEnsConfig,
  lookupOwnerRecord,
  makeTaskName,
  parseOwnerParam,
  taskDirectoryPath,
  taskSlug,
} from "@custodia/ens";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { GuardUx } from "../../../components/guard-ux";
import "../../../env";

export const dynamic = "force-dynamic";

export default async function TaskDirectoryPage({
  params,
}: {
  params: Promise<{ name: string; taskId: string; slug?: string[] }>;
}) {
  const { name: raw, taskId, slug } = await params;
  if (!/^[0-9a-f]{8}$/.test(taskId)) notFound();
  const { label, name } = parseOwnerParam(raw, getParentName());
  const expectedEns = makeTaskName(taskId, label, getParentName());
  const db = createDb();
  const [task] = await db.select().from(tables.tasks).where(eq(tables.tasks.id, taskId)).limit(1);
  if (!task || task.ensName.toLowerCase() !== expectedEns.toLowerCase()) {
    notFound();
  }

  const wantedSlug = taskSlug(task.template);
  const currentSlug = slug?.[0];
  if (currentSlug !== wantedSlug) {
    redirect(taskDirectoryPath(name, taskId, task.template));
  }

  let onchainOwner: string | null = null;
  try {
    onchainOwner = await lookupOwnerRecord(loadEnsConfig(), name);
  } catch {
    onchainOwner = null;
  }
  if (onchainOwner && onchainOwner.toLowerCase() !== task.userWallet.toLowerCase()) {
    notFound();
  }

  return (
    <main className="guard-page">
      <div className="guard-page__topbar">
        <Link href={`/${encodeURIComponent(name)}`}>{name}</Link>
        <span>{`${name}/${taskId}/${wantedSlug}`}</span>
      </div>
      <GuardUx ensName={task.ensName} directoryPath={`${name}/${taskId}/${wantedSlug}`} />
      <p className="guard-page__muted">
        <Link href={`/task/${task.id}`}>Open signed review (simulate / revoke) ↗</Link>
      </p>
    </main>
  );
}
