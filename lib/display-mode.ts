import { cookies } from "next/headers";

export type DisplayMode = "basic" | "pro";

export function displayModeCookie(userId: string) {
  return `flatberry-mode-${userId}`;
}

export async function displayMode(userId: string): Promise<DisplayMode> {
  return (await cookies()).get(displayModeCookie(userId))?.value === "basic" ? "basic" : "pro";
}
