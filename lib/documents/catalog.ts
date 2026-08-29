import { businessDateEndInstant, businessDateKeyToInstant, type BusinessDateKey } from "../calendar";
export type DocumentCatalogQuery={q?:string;property?:string;category?:string;type?:string;dateFrom?:string;dateTo?:string;page?:string};
export const validDocumentDate=(value?:string):value is BusinessDateKey=>Boolean(value&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(`${value}T12:00:00Z`)));
export function documentDateRange(query:DocumentCatalogQuery){return {from:validDocumentDate(query.dateFrom)?businessDateKeyToInstant(query.dateFrom):undefined,to:validDocumentDate(query.dateTo)?businessDateEndInstant(query.dateTo):undefined}}
export function cleanDocumentCatalogParams(query:DocumentCatalogQuery,page:number){const params=new URLSearchParams();for(const key of ["q","property","category","type","dateFrom","dateTo"] as const)if(query[key])params.set(key,query[key]!);if(page>1)params.set("page",String(page));return params.toString()}
