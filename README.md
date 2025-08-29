POV Map – Nano Banana
======================

Pick a spot on the map, draw an arrow for viewpoint and direction, add a short caption, and generate a plausible photo‑realistic POV image using Gemini 2.5 Flash Image ("Nano Banana").

Key points
- Frontend-only data persistence via localStorage (no uploads, no user accounts, no DB)
- Next.js 14 App Router + TypeScript + Tailwind
- MapLibre GL with open tiles; click to set location and direction
- API route calls Google Gemini Images API if API key is set, otherwise returns mock image

Quickstart
1) Install deps
```bash
npm install
```

2) Set environment variables
Create `.env.local` in the project root:
```bash
GEMINI_API_KEY=your_api_key_from_ai_studio
# Optional; defaults to gemini-2.5-flash-image
GEMINI_IMAGE_MODEL=gemini-2.5-flash-image
```

3) Run dev server
```bash
npm run dev
```
Open http://localhost:3000.

4) Deploy on Vercel
- Push to a Git repo and import in Vercel
- Add `GEMINI_API_KEY` (and optionally `GEMINI_IMAGE_MODEL`) as Environment Variables

Usage
- Pan/zoom the map, click once to set viewpoint and auto direction (from center toward click).
- Enter a short prompt and click Generate View.
- Results appear below in a gallery with: map snapshot, AI image, prompt.
- Use Tweak to re-fill the prompt and arrow from a saved item, Copy JSON to export.

Notes
- If no API key is configured, the app will generate a mock SVG image so you can test the full UX.
- All history is stored in your browser’s localStorage only.
- Watermarks/labels are displayed if provided by the model; otherwise the UI shows a general notice.

Safety
- Images are AI-generated. Do not use for safety‑critical or real‑world navigation.
- Prompts and certain geographies may be restricted by policy.

Tech
- Next.js 14, React, TypeScript, Tailwind
- MapLibre GL via `react-map-gl`
- `@google/generative-ai` for Gemini API calls
