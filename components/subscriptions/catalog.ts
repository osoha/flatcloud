import type { FeatureKey } from "@/lib/subscriptions/types";

export const subscriptionFeatures: { key: FeatureKey; label: string; help: string }[] = [
  { key: "profi", label: "Režim Profi", help: "Uživatel může dál používat i zjednodušený pohled Basic." },
  { key: "reports", label: "Reporty a pokročilé přehledy", help: "Základní přístup k uloženým datům a dokumentům zůstává zachován." },
  { key: "bankNotifications", label: "Bankovní notifikace", help: "Automatické zpracování oznámení o úhradách nájemného." },
  { key: "paymentMatching", label: "Párování plateb", help: "Vyžaduje zpřístupněné bankovní notifikace." },
  { key: "paymentReceipts", label: "Doklady o zaplacení", help: "Vystavování nových dokladů. Již uložené doklady zůstanou čitelné." },
  { key: "electronicContracts", label: "Elektronické smlouvy a dodatky", help: "Příprava a vystavení smluvních dokumentů v aplikaci." },
  { key: "portfolioOversight", label: "Dohled nad portfoliem", help: "Pokročilá správa vlastního či svěřeného portfolia; nemění globální roli." },
];

export const subscriptionPlanDescriptions = {
  FREE: "Samostatná správa malého portfolia v pohledu Basic. Portál nájemníka zůstává dostupný.",
  PROFI: "Automatizace plateb, reporty, doklady a elektronické smlouvy. Basic i Profi podle potřeby.",
  ENTERPRISE: "Funkce Profi a dohled nad kompletním přiděleným portfoliem. Oprávnění určuje uživatelská role.",
};

export const paymentMethodLabels: Record<string, string> = { CARD: "Karta", APPLE_PAY: "Apple Pay", GOOGLE_PAY: "Google Pay", BANK: "Bankovní převod / QR" };
