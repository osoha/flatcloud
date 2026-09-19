import { z } from "zod";

const optional = (max: number) => z.string().trim().max(max).default("");

export const annualTeamMemberSchema = z.object({
  sourceUserId: z.string().trim().max(100).nullable().default(null),
  name: z.string().trim().min(1).max(160),
  role: optional(240),
  email: optional(240),
  photoDataUrl: z.string().max(750_000).nullable().default(null),
});
export const annualTeamSchema = z.array(annualTeamMemberSchema).max(8);

export const annualGroupEntitySchema = z.object({
  name: z.string().trim().min(1).max(200),
  type: optional(160),
  ico: optional(32),
  address: optional(300),
  leadership: optional(500),
});
export const annualGroupStructureSchema = z.object({ parent: annualGroupEntitySchema, subsidiaries: z.array(annualGroupEntitySchema).max(8) });

export const annualContactSchema = z.object({
  companyName: z.string().trim().min(1).max(200), registeredAddress: optional(300), officeAddress: optional(300), phone: optional(80), email: optional(240), dataBox: optional(80), boardMembers: optional(2_000), investmentCommittee: optional(1_000),
  confidentialityNotice: z.string().trim().min(1).max(6_000), investmentDisclaimer: z.string().trim().min(1).max(1_000),
});

export type AnnualTeamMember = z.infer<typeof annualTeamMemberSchema>;
export type AnnualGroupEntity = z.infer<typeof annualGroupEntitySchema>;
export type AnnualGroupStructure = z.infer<typeof annualGroupStructureSchema>;
export type AnnualContact = z.infer<typeof annualContactSchema>;

export const DEFAULT_CONFIDENTIALITY_NOTICE = "Tento dokument obsahuje neveřejné a důvěrné informace společnosti a je určen výhradně pro potřeby akcionářů. Jakékoli neoprávněné užití, šíření, zveřejnění či poskytnutí tohoto dokumentu nebo jeho části třetím osobám bez předchozího písemného souhlasu společnosti je zakázáno. Společnost si vyhrazuje právo obsah dokumentu průběžně aktualizovat či měnit.";
export const DEFAULT_INVESTMENT_DISCLAIMER = "Tento dokument neslouží jako veřejná nabídka k investici.";

export function readAnnualTeam(value: unknown): AnnualTeamMember[] { const parsed = annualTeamSchema.safeParse(value); return parsed.success ? parsed.data : []; }
export function readAnnualGroupStructure(value: unknown, parentName = "FlatCloud a.s."): AnnualGroupStructure { const parsed = annualGroupStructureSchema.safeParse(value); return parsed.success ? parsed.data : { parent: { name: parentName, type: "holdingová společnost", ico: "", address: "", leadership: "" }, subsidiaries: [] }; }
export function readAnnualContact(value: unknown): AnnualContact { const parsed = annualContactSchema.safeParse(value); return parsed.success ? parsed.data : { companyName: "FlatCloud a.s.", registeredAddress: "", officeAddress: "", phone: "", email: "info@flatcloud.cz", dataBox: "", boardMembers: "", investmentCommittee: "", confidentialityNotice: DEFAULT_CONFIDENTIALITY_NOTICE, investmentDisclaimer: DEFAULT_INVESTMENT_DISCLAIMER }; }
export function imageDataUrl(bytes: Uint8Array | null | undefined, mimeType: string | null | undefined) { return bytes?.length && mimeType ? `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}` : null; }
