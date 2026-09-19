/** Pure validation shared by the reset handler and its regression checks. */
export function passwordResetError(input: { actorId: string; targetId: string; targetActive: boolean; targetRole: string; password: string; confirmation: string; confirmed: boolean; reason: string }): string | null {
  if (input.actorId === input.targetId || input.targetRole === "SUPER_ADMIN") return "Heslo hlavního administrátora měňte přes jeho vlastní účet.";
  if (!input.targetActive) return "Deaktivovanému účtu nelze obnovit heslo.";
  if (!input.confirmed) return "Potvrďte obnovu hesla a odhlášení uživatele.";
  if (input.reason.trim().length < 5 || input.reason.trim().length > 500) return "Důvod musí mít 5 až 500 znaků.";
  if (input.password.length < 12 || Buffer.byteLength(input.password, "utf8") > 72) return "Nové heslo musí mít alespoň 12 znaků a nejvýše 72 bajtů UTF-8.";
  if (input.password !== input.confirmation) return "Potvrzení nového hesla se neshoduje.";
  return null;
}

export function sessionVersionMatches(claim: unknown, current: number): boolean {
  // Legacy sessions predate the version field and are valid only until the first reset.
  return (claim === undefined ? 0 : claim) === current;
}
