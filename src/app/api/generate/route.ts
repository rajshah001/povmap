import { NextRequest } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

// NOTE: Default to preview model id per Nano Banana docs; allow override via env
const DEFAULT_MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image-preview";

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const { prompt, arrow, map, mapSnapshotDataUrl } = json as {
      prompt: string;
      arrow?: { latitude: number; longitude: number; bearingDeg: number; lengthMeters: number };
      map: {
        zoom: number;
        center: { latitude: number; longitude: number };
        bounds: { north: number; south: number; east: number; west: number };
        style: string;
      };
      mapSnapshotDataUrl?: string;
    };

    const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;

    if (!apiKey) {
      // Mock when no key present to keep app functional in OSS/demo.
      const dataUrl = await synthMockImage(prompt);
      return Response.json({ id: crypto.randomUUID(), imageDataUrl: dataUrl, model: "mock" });
    }

    const client = new GoogleGenerativeAI(apiKey);

    // The Node SDK surface for image generation may vary. We attempt a fallback to REST if needed.
    // First try via generateContent with text-only prompt; newer SDKs return inline image parts.
    try {
      const model = client.getGenerativeModel({ model: DEFAULT_MODEL });
      const contextText = buildContextText(prompt, arrow, map);
      const imagePart = mapSnapshotDataUrl ? dataUrlToPart(mapSnapshotDataUrl) : undefined;
      const res = await model.generateContent(
        imagePart
          ? {
              contents: [
                {
                  role: "user",
                  parts: [{ text: contextText }, imagePart],
                },
              ],
              generationConfig: { responseMimeType: "image/png" },
            }
          : {
              contents: [
                {
                  role: "user",
                  parts: [{ text: contextText }],
                },
              ],
              generationConfig: { responseMimeType: "image/png" },
            }
      );
      const imgPart = res.response.candidates?.[0]?.content?.parts?.find(
        (p: { inlineData?: { mimeType?: string; data?: string } }) => p.inlineData?.mimeType?.startsWith("image/")
      );
      if (imgPart?.inlineData?.data) {
        const dataUrl = `data:${imgPart.inlineData.mimeType};base64,${imgPart.inlineData.data}`;
        return Response.json({ id: crypto.randomUUID(), imageDataUrl: dataUrl, model: DEFAULT_MODEL });
      }
    } catch {
      // Fall through to REST path below
    }

    // Fallback: direct REST call to Images API (v1beta) if available in your environment.
    // This uses fetch to POST to images:generate.
    const rest = await callImagesGenerateREST(apiKey, DEFAULT_MODEL, prompt, arrow, map, mapSnapshotDataUrl);
    if (rest) return Response.json(rest);

    throw new Error("Model did not return an image");
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }
}

function buildContextText(
  prompt: string,
  arrow?: { latitude: number; longitude: number; bearingDeg: number; lengthMeters: number },
  map?: { zoom: number; center: { latitude: number; longitude: number }; bounds?: { north: number; south: number; east: number; west: number } }
) {
  const loc = arrow
    ? `Location (lat,lng): ${arrow.latitude.toFixed(5)}, ${arrow.longitude.toFixed(5)}. Direction bearing: ${Math.round(
        arrow.bearingDeg
      )}°. Length ~${Math.round(arrow.lengthMeters)}m.`
    : "No directional arrow provided.";
  const bounds = map?.bounds
    ? `Bounds N${map.bounds.north.toFixed(4)} S${map.bounds.south.toFixed(4)} E${map.bounds.east.toFixed(4)} W${
        map.bounds.west
      .toFixed(4)}. Zoom ${map.zoom}.`
    : "";
  return `Generate an image of what the red arrow sees. Use the map snapshot as spatial context and viewpoint.
${loc}
${bounds}
User caption (optional): ${prompt || ""}
Label AI-generated if watermarks are supported.`;
}

async function callImagesGenerateREST(
  apiKey: string,
  model: string,
  prompt: string,
  arrow?: { latitude: number; longitude: number; bearingDeg: number; lengthMeters: number },
  map?: { zoom: number; center: { latitude: number; longitude: number }; bounds?: { north: number; south: number; east: number; west: number } },
  mapSnapshotDataUrl?: string
) {
  try {
    const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [
      { text: buildContextText(prompt, arrow, map) },
    ];
    if (mapSnapshotDataUrl) {
      const inline = dataUrlToPart(mapSnapshotDataUrl);
      parts.push(inline);
    }

    const rq: {
      contents: Array<{ role: string; parts: typeof parts }>;
    } = {
      // Basic text prompt. If SDK supports region conditioning in the future, add structured fields.
      contents: [{ role: "user", parts }],
    };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rq),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data: {
      candidates?: Array<{
        content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }> };
      }>;
    } = await resp.json();
    const part = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.mimeType?.startsWith("image/"));
    if (part?.inlineData?.data) {
      const dataUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      return { id: crypto.randomUUID(), imageDataUrl: dataUrl, model };
    }
  } catch {
    // ignore
  }
  return null;
}

async function synthMockImage(text: string) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='800' height='450'>
    <rect width='100%' height='100%' fill='#f3f4f6'/>
    <text x='50%' y='45%' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='20' fill='#374151'>Mock image</text>
    <text x='50%' y='55%' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='14' fill='#6b7280'>${escapeHtml(
      text
    ).slice(0, 90)}</text>
  </svg>`;
  const base64 = Buffer.from(svg).toString("base64");
  return `data:image/svg+xml;base64,${base64}`;
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function dataUrlToPart(dataUrl: string): { inlineData: { mimeType: string; data: string } } {
  const match = /^data:([^;]+);base64,(.*)$/.exec(dataUrl);
  if (!match) {
    return { inlineData: { mimeType: "image/jpeg", data: "" } };
  }
  const [, mimeType, data] = match;
  return { inlineData: { mimeType, data } };
}

