"use client";
import { useCallback, useRef, useState } from "react";
import Map, { MapRef, NavigationControl } from "react-map-gl/maplibre";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import Image from "next/image";
import { ArrowSelection, MapStateSnapshot, PovResult } from "@/types";
import { useHistory } from "@/hooks/useHistory";

const DEFAULT_CENTER = { latitude: 18.5204, longitude: 73.8567 };

type GeneratePayload = {
  prompt?: string;
  arrow?: ArrowSelection;
  map: MapStateSnapshot;
};

export default function MapView() {
  const mapRef = useRef<MapRef | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [arrow, setArrow] = useState<ArrowSelection | undefined>(undefined);
  const [bearingDeg, setBearingDeg] = useState<number>(0);
  const [lengthMeters, setLengthMeters] = useState<number>(150);
  const [mode, setMode] = useState<"pan" | "draw">("draw");
  const { items, add, remove } = useHistory();

  const styleUrl = "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json";

  const onMapClick = useCallback((e: { lngLat: { lng: number; lat: number } }) => {
    if (mode !== "draw") return;
    setArrow({
      latitude: e.lngLat.lat,
      longitude: e.lngLat.lng,
      bearingDeg: bearingDeg,
      lengthMeters: lengthMeters,
    });
  }, [bearingDeg, lengthMeters, mode]);

  const snapshotMapState = useCallback((): MapStateSnapshot | undefined => {
    const map = mapRef.current?.getMap();
    if (!map) return undefined;
    const bounds = map.getBounds();
    return {
      zoom: map.getZoom(),
      center: { latitude: map.getCenter().lat, longitude: map.getCenter().lng },
      bounds: {
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest(),
      },
      style: styleUrl,
    };
  }, [styleUrl]);

  const drawOverlay = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const map = mapRef.current?.getMap();
    if (!map || !arrow) return;

    const origin = map.project([arrow.longitude, arrow.latitude]);
    const angle = (arrow.bearingDeg * Math.PI) / 180;
    const lengthPx = Math.min(width, height) * 0.25;

    const endX = origin.x + Math.sin(angle) * lengthPx;
    const endY = origin.y - Math.cos(angle) * lengthPx;

    ctx.save();
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#ef4444";
    ctx.fillStyle = "#ef4444";
    ctx.lineCap = "round";

    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    const headLen = 12;
    const headAngle = Math.PI / 8;
    const leftX = endX - headLen * Math.sin(angle - headAngle);
    const leftY = endY + headLen * Math.cos(angle - headAngle);
    const rightX = endX - headLen * Math.sin(angle + headAngle);
    const rightY = endY + headLen * Math.cos(angle + headAngle);

    ctx.beginPath();
    ctx.moveTo(endX, endY);
    ctx.lineTo(leftX, leftY);
    ctx.lineTo(rightX, rightY);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }, [arrow]);

  const exportMapSnapshot = useCallback(async (): Promise<string | undefined> => {
    const map = mapRef.current?.getMap();
    if (!map) return undefined;
    const canvas = map.getCanvas();
    const offscreen = document.createElement("canvas");
    offscreen.width = canvas.width;
    offscreen.height = canvas.height;
    const ctx = offscreen.getContext("2d");
    if (!ctx) return undefined;
    ctx.drawImage(canvas, 0, 0);
    drawOverlay(ctx, offscreen.width, offscreen.height);
    return offscreen.toDataURL("image/jpeg", 0.8);
  }, [drawOverlay]);

  const generate = useCallback(async () => {
    if (!arrow) return;
    setIsGenerating(true);
    try {
      const mapState = snapshotMapState();
      if (!mapState) return;
      const mapSnapshotDataUrl = (await exportMapSnapshot()) ?? "";
      const payload: GeneratePayload & { mapSnapshotDataUrl?: string } = {
        prompt: prompt.trim() || undefined,
        arrow,
        map: mapState,
        mapSnapshotDataUrl,
      };
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Generation failed");
      const data = await res.json();
      const result: PovResult = {
        id: data.id ?? crypto.randomUUID(),
        createdAt: Date.now(),
        request: { prompt: payload.prompt || "", arrow: payload.arrow!, map: payload.map },
        mapSnapshotDataUrl: payload.mapSnapshotDataUrl || "",
        imageDataUrl: data.imageDataUrl,
        model: data.model,
        safetyLabels: data.safetyLabels,
      };
      add(result);
    } catch (e) {
      console.error(e);
      alert("Failed to generate image. Check console.");
    } finally {
      setIsGenerating(false);
    }
  }, [add, arrow, exportMapSnapshot, prompt, snapshotMapState]);

  const clearArrow = useCallback(() => setArrow(undefined), []);

  const onRender = useCallback(() => {
    const canvas = canvasRef.current;
    const map = mapRef.current?.getMap();
    if (!canvas || !map) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { width, height } = map.getCanvas();
    canvas.width = width;
    canvas.height = height;
    ctx.clearRect(0, 0, width, height);
    drawOverlay(ctx, width, height);
  }, [drawOverlay]);

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-[1fr_380px]">
      <div className="relative">
        <Map
          ref={mapRef}
          mapLib={maplibregl}
          initialViewState={{ latitude: DEFAULT_CENTER.latitude, longitude: DEFAULT_CENTER.longitude, zoom: 12 }}
          style={{ width: "100%", height: "100vh" }}
          mapStyle={styleUrl}
          dragPan={mode === "pan"}
          onClick={onMapClick}
          onRender={onRender}
        >
          <NavigationControl position="top-left" />
        </Map>
        <canvas ref={canvasRef} className="pointer-events-none absolute inset-0" />
        <div className="absolute top-3 left-3 bg-white/90 backdrop-blur border rounded-full flex items-center overflow-hidden">
          <button onClick={() => setMode("pan")} className={`px-3 py-1.5 text-xs ${mode === "pan" ? "bg-gray-900 text-white" : "text-gray-700"}`}>Pan</button>
          <button onClick={() => setMode("draw")} className={`px-3 py-1.5 text-xs ${mode === "draw" ? "bg-gray-900 text-white" : "text-gray-700"}`}>Draw arrow</button>
        </div>
        <div className="absolute top-3 left-[160px] px-3 py-1.5 rounded-full text-xs bg-white/80 backdrop-blur border text-gray-700">{mode === "draw" ? "Click map to set viewpoint" : "Drag to pan map"}</div>
      </div>

      <aside className="border-l bg-white/90 backdrop-blur p-4 flex flex-col gap-4">
        <h2 className="text-base font-semibold">What does the arrow see?</h2>

        <div className="grid gap-2">
          <label className="text-xs text-gray-600">Direction: {Math.round(bearingDeg)}°</label>
          <input type="range" min={0} max={359} value={bearingDeg} onChange={(e) => {
            const v = Number(e.target.value);
            setBearingDeg(v);
            if (arrow) setArrow({ ...arrow, bearingDeg: v });
          }} />
        </div>

        <div className="grid gap-2">
          <label className="text-xs text-gray-600">Arrow length: {Math.round(lengthMeters)} m</label>
          <input type="range" min={50} max={400} value={lengthMeters} onChange={(e) => {
            const v = Number(e.target.value);
            setLengthMeters(v);
            if (arrow) setArrow({ ...arrow, lengthMeters: v });
          }} />
        </div>

        <div className="grid gap-2">
          <label className="text-xs text-gray-600">Optional caption</label>
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="e.g., busy bazaar street at dusk"
            className="rounded border px-3 py-2 text-sm min-h-20" />
        </div>

        <div className="flex gap-2">
          <button onClick={clearArrow} className="rounded border px-3 py-2 text-sm">Clear arrow</button>
          <button disabled={!arrow || isGenerating} onClick={generate} className="rounded bg-green-600 text-white px-3 py-2 text-sm disabled:opacity-50">
            {isGenerating ? "Generating…" : "Generate View"}
          </button>
        </div>

        <div className="border-t pt-3 grid gap-2">
          <h3 className="text-sm font-medium">History</h3>
          {items.length === 0 && <p className="text-xs text-gray-500">No results yet.</p>}
          <div className="grid gap-3">
            {items.map((item) => (
              <article key={item.id} className="border rounded overflow-hidden bg-white">
                <div className="grid grid-cols-2 gap-0">
                  <Image src={item.mapSnapshotDataUrl} alt="Map" width={320} height={160} className="w-full h-32 object-cover" />
                  <Image src={item.imageDataUrl} alt="AI" width={320} height={160} className="w-full h-32 object-cover" />
                </div>
                <div className="p-3 border-t">
                  <p className="text-xs line-clamp-2">{item.request.prompt}</p>
                  <div className="mt-2 flex gap-2 text-xs">
                    <button onClick={() => { setPrompt(item.request.prompt); setArrow(item.request.arrow); }} className="px-2 py-1 border rounded">Tweak</button>
                    <button onClick={() => navigator.clipboard.writeText(JSON.stringify(item, null, 2))} className="px-2 py-1 border rounded">Copy JSON</button>
                    <button onClick={() => remove(item.id)} className="px-2 py-1 border rounded text-red-600">Delete</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}

