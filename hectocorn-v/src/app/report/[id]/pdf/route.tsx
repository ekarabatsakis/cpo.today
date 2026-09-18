import { renderToStream } from "@react-pdf/renderer";
import { Readable } from "node:stream";

import { prisma } from "@/lib/db";
import { ReportDocument } from "@/lib/pdf/ReportDocument";
import { parseReport } from "@/types/report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /report/[id]/pdf — streams the branded PDF report. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const row = await prisma.report.findUnique({ where: { id } });
  if (!row) return new Response("Report not found.", { status: 404 });
  const report = parseReport(row);
  const nodeStream = await renderToStream(<ReportDocument report={report} />);
  const safeName =
    report.name
      .replace(/[^a-z0-9-]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "report";
  return new Response(Readable.toWeb(nodeStream as Readable) as ReadableStream, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="hectocorn-v-${safeName}-${id}.pdf"`,
      "cache-control": "no-store",
    },
  });
}
