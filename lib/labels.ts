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

export const unitDispositions: Record<string, string> = {
  STUDIO: "Garsoniéra / studio",
  ONE_KK: "1+kk",
  ONE_PLUS_ONE: "1+1",
  TWO_KK: "2+kk",
  TWO_PLUS_ONE: "2+1",
  THREE_KK: "3+kk",
  THREE_PLUS_ONE: "3+1",
  FOUR_KK: "4+kk",
  FOUR_PLUS_ONE: "4+1",
  OTHER: "Jiná dispozice",
};

export const unitStatuses: Record<string, string> = {
  VACANT: "Volná",
  OCCUPIED: "Obsazená",
  RENOVATION: "Rekonstrukce (legacy)",
  INACTIVE: "Neaktivní (legacy)",
};

export const unitOperationalStatuses: Record<string, string> = {
  STANDARD: "Standardní provoz",
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

export const securityDepositStatuses = {
  NOT_CONFIGURED: "Nesjednána",
  UNPAID: "Nesložena",
  PARTIAL: "Částečně složena",
  FUNDED: "Složena",
  TO_SETTLE: "K vypořádání",
  SETTLED: "Vypořádána",
} as const;

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

export const meterTypes = {
  COLD_WATER: "Studená voda",
  HOT_WATER: "Teplá voda",
  ELECTRICITY_HIGH_TARIFF: "Elektřina – vysoký tarif",
  ELECTRICITY_LOW_TARIFF: "Elektřina – nízký tarif",
  GAS: "Plyn",
} as const;

export const taskStatuses: Record<string, string> = {
  OPEN: "Otevřený",
  IN_PROGRESS: "Řeší se",
  WAITING: "Čeká na reakci",
  DONE: "Hotovo",
  CANCELLED: "Zrušeno",
};

export const taskPriorities: Record<string, string> = {
  LOW: "Nízká",
  NORMAL: "Běžná",
  HIGH: "Vysoká",
  URGENT: "Urgentní",
};

export const taskCategories: Record<string, string> = {
  COLLECTION: "Vymáhání / upomínka",
  MAINTENANCE: "Provoz / závada",
  LEASE: "Smlouva",
  COMPLIANCE: "Revize / kontrola",
  GENERAL: "Obecný úkol",
};

export const taskEntryKinds: Record<string, string> = {
  COMMENT: "Poznámka",
  CALL: "Telefonát",
  EMAIL: "E-mail",
  PROMISE: "Příslib úhrady",
  STATUS: "Změna stavu",
  SYSTEM: "Systém",
};

export const contactCategories: Record<string, string> = {
  MANAGER: "Správce",
  EMERGENCY: "Havarijní služba",
  ELECTRICIAN: "Elektrikář",
  PLUMBER: "Instalatér",
  HEATING: "Topení / kotelna",
  ELEVATOR: "Výtah",
  FIRE_SAFETY: "PO / EPS",
  INSPECTION: "Revizní technik",
  INSURANCE: "Pojišťovna",
  CLEANING: "Úklid",
  UTILITY: "Dodavatel energií / sítí",
  OTHER: "Ostatní",
};

export const complianceResults: Record<string, string> = {
  OK: "V pořádku",
  ISSUE: "Závada",
  FOLLOW_UP: "Vyžaduje nápravu",
};
