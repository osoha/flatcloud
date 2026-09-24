import PropertyPage from "../[section]/page";

export const dynamic = "force-dynamic";

export default function PropertySettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    ok?: string;
    error?: string;
    invite?: string;
    financeYear?: string;
  }>;
}) {
  return PropertyPage({
    params: params.then(({ id }) => ({ id, section: "nastaveni" })),
    searchParams,
  });
}
