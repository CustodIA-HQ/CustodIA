export const publicAppOrigin = (env: NodeJS.ProcessEnv = process.env): string =>
  (env.APP_URL ?? env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");

export const taskSlug = (template?: string | null): string =>
  (template?.trim() || "portfolio-guard").replaceAll("_", "-").toLowerCase();

export const ownerDirectoryPath = (ownerName: string): string =>
  `/${encodeURIComponent(ownerName)}`;

export const taskDirectoryPath = (
  ownerName: string,
  taskId: string,
  template?: string | null,
): string => `${ownerDirectoryPath(ownerName)}/${taskId}/${taskSlug(template)}`;

export const directoryUrl = (path: string, origin = publicAppOrigin()): string =>
  origin ? `${origin}${path}` : path;

/** `{taskId}.{label}.{parent}` → `{label}.{parent}` */
export const ownerNameFromTaskEns = (ensName: string, taskId: string): string => {
  const prefix = `${taskId}.`;
  if (ensName.toLowerCase().startsWith(prefix.toLowerCase())) {
    return ensName.slice(prefix.length);
  }
  return ensName.split(".").slice(1).join(".");
};

export const parseOwnerParam = (
  raw: string,
  parentName: string,
): { label: string; name: string } => {
  const decoded = decodeURIComponent(raw).trim().toLowerCase();
  const parent = parentName.toLowerCase();
  if (decoded.endsWith(`.${parent}`) || decoded === parent) {
    const label =
      decoded === parent
        ? (parent.split(".")[0] ?? decoded)
        : decoded.slice(0, -(parent.length + 1));
    return { label, name: decoded };
  }
  return { label: decoded, name: `${decoded}.${parent}` };
};
