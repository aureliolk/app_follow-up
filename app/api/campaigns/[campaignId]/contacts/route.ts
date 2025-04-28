import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

interface RouteParams {
  params: {
    campaignId: string;
  };
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { campaignId } = await params;
  if (!campaignId) {
    return NextResponse.json({ success: false, error: 'campaignId is required' }, { status: 400 });
  }
  try {
    const contacts = await prisma.campaignContact.findMany({
      where: { campaignId },
      select: {
        id: true,
        contactInfo: true,
        contactName: true,
        status: true,
        sentAt: true,
        error: true
      }
    });
    return NextResponse.json({ success: true, data: contacts });
  } catch (err: any) {
    console.error(`[API GET /campaigns/${campaignId}/contacts]`, err);
    return NextResponse.json({ success: false, error: 'Failed to fetch contacts' }, { status: 500 });
  }
}