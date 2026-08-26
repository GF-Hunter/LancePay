import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyAuthToken } from "@/lib/auth";
import { logger } from "@/lib/logger";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const authToken = request.headers.get("authorization")?.replace("Bearer ", "");

    const claims = await verifyAuthToken(authToken || "");
    if (!claims) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({ where: { privyId: claims.userId } });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const client = await prisma.user.findFirst({
      where: { id, role: "client" },
    });

    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const invoices = await prisma.invoice.findMany({
      where: { clientId: id, userId: user.id },
      orderBy: { createdAt: "desc" },
    });

    const pdfBuffer = Buffer.from(
      `%PDF-1.4\nClient Statement\nClient ID: ${id}\nName: ${client.name || client.email}\nTotal Invoices: ${invoices.length}\nGenerated: ${new Date().toISOString()}`
    );

    return new Response(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="statement-${id}.pdf"`,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Client statement PDF generation error");
    return NextResponse.json({ error: "Failed to generate client statement PDF" }, { status: 500 });
  }
}
