import { NextRequest, NextResponse } from "next/server";

// TODO(lead-gen): Destination is a placeholder. Replace LEAD_FORWARD_URL with
// a Cloudflare Pages Function / Worker that appends leads to a Google Sheet
// (or forwards to a team email), then point this route at it. See spec §10.
const LEAD_FORWARD_URL = process.env.LEAD_FORWARD_URL ?? "";

type Lead = {
  name: string;
  school: string;
  enquiryType: "freeLesson" | "demo" | "trainingDelivery";
  email?: string;
  whatsapp?: string;
  needs?: string;
};

const ENQUIRY_TYPES = ["freeLesson", "demo", "trainingDelivery"] as const;

function isEnquiryType(value: string | undefined): value is Lead["enquiryType"] {
  return Boolean(value && ENQUIRY_TYPES.includes(value as Lead["enquiryType"]));
}

function sanitize(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 500) : undefined;
}

export async function POST(request: NextRequest) {
  try {
    const raw = await request.json();
    const enquiryType = sanitize(raw?.enquiryType);
    if (!isEnquiryType(enquiryType)) {
      return NextResponse.json(
        { error: "Please select an enquiry type." },
        { status: 400 }
      );
    }

    const lead: Lead = {
      name: sanitize(raw?.name) ?? "",
      school: sanitize(raw?.school) ?? "",
      enquiryType,
      email: sanitize(raw?.email),
      whatsapp: sanitize(raw?.whatsapp),
      needs: sanitize(raw?.needs),
    };

    if (!lead.name || !lead.school) {
      return NextResponse.json(
        { error: "Name and school are required." },
        { status: 400 }
      );
    }

    if (LEAD_FORWARD_URL) {
      const res = await fetch(LEAD_FORWARD_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(lead),
      });
      if (!res.ok) {
        return NextResponse.json(
          { error: "Upstream failed." },
          { status: 502 }
        );
      }
    } else {
      // No forward destination configured yet: log for local dev.
      console.info("[lead]", JSON.stringify(lead));
    }

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Invalid request." },
      { status: 400 }
    );
  }
}
