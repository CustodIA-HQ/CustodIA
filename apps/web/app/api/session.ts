import { readSessionToken, SESSION_COOKIE_NAME } from "./auth/session";

export const cookieValue = (header: string | null): string | undefined =>
  header
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE_NAME}=`))
    ?.slice(SESSION_COOKIE_NAME.length + 1);

export const sessionFrom = (request: Request) =>
  readSessionToken(cookieValue(request.headers.get("cookie")));
