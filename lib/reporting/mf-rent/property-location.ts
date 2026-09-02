export type MfTerritoryCandidate = {
  territoryCode: string;
  territoryName: string;
  municipalityName: string | null;
};

export function normalizeMfLocationName(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("cs-CZ")
    .replace(/\s+/g, " ")
    .trim();
}

export function selectMfTerritoryFromPropertyData({
  cadastralArea,
  city,
  candidates,
}: {
  cadastralArea: string | null | undefined;
  city: string | null | undefined;
  candidates: MfTerritoryCandidate[];
}) {
  const cadastralKey = normalizeMfLocationName(cadastralArea);
  if (!cadastralKey) return null;

  const exactTerritories = candidates.filter(
    (candidate) => normalizeMfLocationName(candidate.territoryName) === cadastralKey,
  );
  if (exactTerritories.length === 1) return exactTerritories[0];

  const cityKey = normalizeMfLocationName(city);
  if (!cityKey) return null;
  const municipalityMatches = exactTerritories.filter(
    (candidate) => normalizeMfLocationName(candidate.municipalityName) === cityKey,
  );
  return municipalityMatches.length === 1 ? municipalityMatches[0] : null;
}
