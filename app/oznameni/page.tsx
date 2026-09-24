import { redirect } from "next/navigation";
export default async function LegacyAnnouncements({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const params = new URLSearchParams();
  for (const key of ["view", "ok", "error"]) if (typeof query[key] === "string") params.set(key, query[key]);
  redirect(`/ukoly/oznameni${params.size ? `?${params}` : ""}`);
}
