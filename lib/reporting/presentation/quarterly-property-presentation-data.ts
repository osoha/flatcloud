import { ReportDesignPageRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { reportDesignTemplateConfigSchema, REPORT_DESIGN_PAGE_ROLES } from "@/lib/reporting/design-template-schema";
import { technicalSectionsSchema, valuationRowsSchema, valuationTotalCents } from "@/lib/reporting/editorial-schema";
import { resolveQuarterlyPropertyTrendSeries } from "@/lib/reporting/trend-series";
import type { QuarterlyPropertyPresentation } from "./quarterly-property-presentation-model";

export class QuarterlyPropertyPresentationNotFound extends Error {}
export class QuarterlyPropertyPresentationTemplateMissing extends Error {}

export async function loadQuarterlyPropertyPresentation(input: { groupId: string; reportId: string; propertyId: string }): Promise<QuarterlyPropertyPresentation> {
  const propertyReport = await prisma.quarterlyPropertyReport.findFirst({
    where: { quarterlyReportId: input.reportId, propertyId: input.propertyId, quarterlyReport: { reportingGroupId: input.groupId } },
    select: {
      propertyId: true, propertyNameSnapshot: true, propertyAddressSnapshot: true, propertyStatus: true, managementCommentary: true, additionalCommentary: true, technicalSections: true, valuationRows: true,
      snapshot: { select: { data: true } },
      media: { where: { OR: [{ role: "PRIMARY", sortOrder: 0 }, { role: "SECONDARY", sortOrder: 0 }] }, select: { id: true, role: true, sortOrder: true, caption: true } },
      quarterlyReport: { select: { id: true, reportingGroupId: true, year: true, quarter: true, status: true, publishedAt:true, designTemplateVersion: { select: { id: true, version: true, config: true, template: { select: { name: true } }, pages: { select: { role: true, backgroundMode: true, backgroundAssetId: true } } } } } },
    },
  });
  if (!propertyReport) throw new QuarterlyPropertyPresentationNotFound();
  const report = propertyReport.quarterlyReport;
  if (!report.designTemplateVersion) throw new QuarterlyPropertyPresentationTemplateMissing();
  const config = reportDesignTemplateConfigSchema.parse(report.designTemplateVersion.config);
  const pageByRole = new Map(report.designTemplateVersion.pages.map((page) => [page.role, page]));
  const backgrounds = Object.fromEntries(REPORT_DESIGN_PAGE_ROLES.map((role) => {
    const page = pageByRole.get(role as ReportDesignPageRole);
    const mode = page?.backgroundMode === "ASSET" ? "ASSET" : "GENERATED";
    return [role, { role, mode, imageUrl: mode === "ASSET" ? `/api/reporting-groups/${input.groupId}/quarterly-reports/${input.reportId}/presentation/backgrounds/${role}` : null }];
  })) as QuarterlyPropertyPresentation["template"]["backgrounds"];
  const mediaUrl = (id: string) => `/api/reporting-groups/${input.groupId}/quarterly-reports/${input.reportId}/properties/${input.propertyId}/media/${id}/image?variant=preview`;
  const primary = propertyReport.media.find((item) => item.role === "PRIMARY" && item.sortOrder === 0);
  const supportive = propertyReport.media.find((item) => item.role === "SECONDARY" && item.sortOrder === 0);

  const trends=await resolveQuarterlyPropertyTrendSeries({propertyId:input.propertyId,targetReport:report,currentSnapshot:propertyReport.snapshot});
  const technical = technicalSectionsSchema.safeParse(propertyReport.technicalSections ?? []);
  const valuation = valuationRowsSchema.safeParse(propertyReport.valuationRows ?? []);
  const valuationRows = valuation.success ? valuation.data : [];
  return {
    report: { id: report.id, groupId: report.reportingGroupId, year: report.year, quarter: report.quarter, status: report.status },
    property: { id: propertyReport.propertyId, name: propertyReport.propertyNameSnapshot, address: propertyReport.propertyAddressSnapshot, status: propertyReport.propertyStatus },
    template: { id: report.designTemplateVersion.id, name: report.designTemplateVersion.template.name, version: report.designTemplateVersion.version, config, backgrounds },
    media: { primary: primary ? { id: primary.id, caption: primary.caption, imageUrl: mediaUrl(primary.id) } : null, supportive: supportive ? { id: supportive.id, caption: supportive.caption, imageUrl: mediaUrl(supportive.id) } : null },
    managementCommentary: propertyReport.managementCommentary,
    additionalCommentary: propertyReport.additionalCommentary,
    technicalSections: technical.success ? technical.data : [], valuationRows, valuationTotalCents: valuationTotalCents(valuationRows), trends,
  };
}
