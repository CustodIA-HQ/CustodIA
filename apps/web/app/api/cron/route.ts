import { createDb } from "@custodia/db";
import { cursors, tasks } from "@custodia/db/schema";
import { eq, gt } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET() {
  const db = createDb();
  
  // 1. Get the current cursor
  const [cursorRec] = await db.select().from(cursors).where(eq(cursors.id, "watcher"));
  const lastId = cursorRec?.lastProcessedId ?? "";

  // 2. Fetch the next batch using the cursor pattern
  const pendingTasks = await db.select()
    .from(tasks)
    .where(gt(tasks.id, lastId))
    .orderBy(tasks.id)
    .limit(50);

  if (pendingTasks.length === 0) {
    return NextResponse.json({ status: "idle", processed: 0 });
  }

  // 3. Process tasks (mock logic for the workshop)
  let latestIdProcessed = lastId;
  for (const task of pendingTasks) {
    console.log(`Processing task ${task.id}...`);
    // Example processing logic...
    latestIdProcessed = task.id;
  }

  // 4. Update the cursor transationally or explicitly
  if (cursorRec) {
    await db.update(cursors)
      .set({ lastProcessedId: latestIdProcessed, updatedAt: new Date() })
      .where(eq(cursors.id, "watcher"));
  } else {
    await db.insert(cursors).values({
      id: "watcher",
      lastProcessedId: latestIdProcessed,
    });
  }

  return NextResponse.json({ status: "ok", processed: pendingTasks.length, nextCursor: latestIdProcessed });
}
