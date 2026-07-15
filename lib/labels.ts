export const ownerTypes: Record<string, string> = {
  COMPANY: "Společnost",
  PERSON: "Fyzická osoba",
  SPV: "SPV / projektová společnost",
};

export const unitTypes: Record<string, string> = {
  APARTMENT: "Byt",
  COMMERCIAL: "Nebytový prostor",
  GARAGE: "Garáž",
  PARKING: "Parkovací stání",
  STORAGE: "Sklep / sklad",
  OTHER: "Jiné",
};

export const unitStatuses: Record<string, string> = {
  VACANT: "Volná",
  OCCUPIED: "Obsazená",
  RENOVATION: "Rekonstrukce",
  INACTIVE: "Neaktivní",
};

export const tenantTypes: Record<string, string> = {
  PERSON: "Fyzická osoba",
  COMPANY: "Právnická osoba",
};

export const leaseStatuses: Record<string, string> = {
  ACTIVE: "Aktivní",
  FUTURE: "Budoucí",
  ENDED: "Ukončená",
};

export const chargeCategories: Record<string, string> = {
  RENT: "Nájemné",
  WATER: "Voda",
  HEATING: "Teplo",
  ELECTRICITY: "Elektřina",
  SERVICES: "Služby",
  PARKING: "Parkování",
  DEPOSIT: "Kauce",
  OTHER: "Ostatní",
  ADJUSTMENT: "Úprava / korekce",
};

export const paymentStatuses: Record<string, string> = {
  UNMATCHED: "Ke spárování",
  SUGGESTED: "Navrženo",
  MATCHED: "Spárováno",
  PARTIAL: "Částečná úhrada",
  OVERPAYMENT: "Přeplatek",
  IGNORED: "Ignorováno",
};

export const matchingRuleActions: Record<string, string> = {
  IGNORE: "Ignorovat",
  MATCH_LEASE: "Automaticky párovat",
  SUGGEST_LEASE: "Pouze navrhnout",
};

export const propertyPermissions: Record<string, string> = {
  VIEW: "Pouze zobrazení",
  EDIT: "Zobrazení a editace",
  ADMIN: "Správa objektu a uživatelů",
};

export const userRoles: Record<string, string> = {
  SUPER_ADMIN: "Hlavní administrátor",
  MANAGER: "Generální správce",
  PROPERTY_MANAGER: "Správce nemovitosti",
  OWNER_VIEWER: "Vlastník / člen",
};
