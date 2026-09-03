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

export function parseMfCadastralArea(value: string | null | undefined) {
  const raw = (value ?? "").trim();
  const codeMatch = raw.match(/[\[(]\s*(\d{6})\s*[\])]\s*$/);
  const code = codeMatch?.[1] ?? null;
  const name = codeMatch ? raw.slice(0, codeMatch.index).trim() : raw;
  return { raw, name, code };
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
  const parsedCadastralArea = parseMfCadastralArea(cadastralArea);
  if (parsedCadastralArea.code) {
    const codeMatches = candidates.filter((candidate) => {
      const candidateCode = candidate.territoryCode.split("/", 1)[0];
      return candidateCode === parsedCadastralArea.code;
    });
    if (codeMatches.length === 1) return codeMatches[0];
  }

  const cadastralKey = normalizeMfLocationName(parsedCadastralArea.name);
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
