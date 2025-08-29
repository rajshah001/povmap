"use client";
import { useCallback, useRef, useState } from "react";
import Map, { MapRef, NavigationControl } from "react-map-gl/maplibre";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { ArrowSelection, MapStateSnapshot, PovResult } from "@/types";
import { useHistory } from "@/hooks/useHistory";

const DEFAULT_CENTER = { latitude: 37.7749, longitude: -122.4194 };

type GeneratePayload = {
  prompt: string;
  arrow?: ArrowSelection;
  map: MapStateSnapshot;
};

export default function MapView() {
  const mapRef = useRef<MapRef | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [arrow, setArrow] = useState<ArrowSelection | undefined>(undefined);
  const { items, add, remove, clear } = useHistory();

  const styleUrl = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

  const onMapClick = useCallback((e: { lngLat: { lng: number; lat: number } }) => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    const clickLngLat = e.lngLat; // {lng, lat}

    // Compute bearing from center to click for quick UX.
    const center = map.getCenter();
    const bearing = Math.atan2(
      (clickLngLat.lng - center.lng) * Math.cos((center.lat * Math.PI) / 180),
      clickLngLat.lat - center.lat
    );
    const bearingDeg = ((bearing * 180) / Math.PI + 360) % 360;

    setArrow({
      latitude: clickLngLat.lat,
      longitude: clickLngLat.lng,
      bearingDeg,
      lengthMeters: 150,
    });
  }, []);

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
    if (!arrow) return;
    const angle = (arrow.bearingDeg * Math.PI) / 180;
    const centerX = width / 2;
    const centerY = height / 2;
    const lengthPx = Math.min(width, height) * 0.25;

    const endX = centerX + Math.sin(angle) * lengthPx;
    const endY = centerY - Math.cos(angle) * lengthPx;

    ctx.save();
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#ef4444";
    ctx.fillStyle = "#ef4444";
    ctx.lineCap = "round";

    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    // Arrow head
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
    if (!prompt.trim()) return;
    setIsGenerating(true);
    try {
      const mapState = snapshotMapState();
      if (!mapState) return;

      const payload: GeneratePayload = { prompt: prompt.trim(), arrow, map: mapState };
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Generation failed");
      const data = await res.json();

      const mapSnapshotDataUrl = (await exportMapSnapshot()) ?? "";
      const result: PovResult = {
        id: data.id ?? crypto.randomUUID(),
        createdAt: Date.now(),
        request: { prompt: payload.prompt, arrow: payload.arrow!, map: payload.map },
        mapSnapshotDataUrl,
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
    <div className="grid grid-rows-[auto_1fr_auto] min-h-screen">
      <header className="px-4 py-3 border-b bg-white/80 backdrop-blur flex items-center gap-3">
        <h1 className="font-semibold">POV Map</h1>
        <span className="text-xs text-gray-500">Click map to set view and direction</span>
      </header>
      <div className="relative">
        <Map
          ref={mapRef}
          mapLib={maplibregl}
          initialViewState={{ latitude: DEFAULT_CENTER.latitude, longitude: DEFAULT_CENTER.longitude, zoom: 12 }}
          style={{ width: "100%", height: "calc(100vh - 200px)" }}
          mapStyle={styleUrl}
          onClick={onMapClick}
          onRender={onRender}
        >
          <NavigationControl position="top-left" />
        </Map>
        <canvas ref={canvasRef} className="pointer-events-none absolute inset-0" />
      </div>
      <section className="border-t bg-white/80 backdrop-blur">
        <div className="max-w-6xl mx-auto p-4 grid gap-3">
          <div className="flex gap-2">
            <input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the POV scene..."
              className="flex-1 rounded border px-3 py-2 text-sm"
            />
            <button onClick={clearArrow} className="rounded border px-3 py-2 text-sm">Clear arrow</button>
            <button disabled={!arrow || isGenerating || !prompt.trim()} onClick={generate} className="rounded bg-black text-white px-3 py-2 text-sm disabled:opacity-50">
              {isGenerating ? "Generating…" : "Generate View"}
            </button>
          </div>

          <div className="grid gap-3">
            {items.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {items.map((item) => (
                  <article key={item.id} className="border rounded overflow-hidden bg-white">
                    <div className="grid grid-cols-2 gap-0">
                      <img src={item.mapSnapshotDataUrl} alt="Map" className="w-full h-40 object-cover" />
                      <img src={item.imageDataUrl} alt="AI" className="w-full h-40 object-cover" />
                    </div>
                    <div className="p-3 border-t">
                      <p className="text-sm line-clamp-2">{item.request.prompt}</p>
                      <div className="mt-2 flex gap-2 text-xs">
                        <button
                          onClick={() => {
                            setPrompt(item.request.prompt);
                            setArrow(item.request.arrow);
                          }}
                          className="px-2 py-1 border rounded"
                        >
                          Tweak
                        </button>
                        <button
                          onClick={() => navigator.clipboard.writeText(JSON.stringify(item, null, 2))}
                          className="px-2 py-1 border rounded"
                        >
                          Copy JSON
                        </button>
                        <button onClick={() => remove(item.id)} className="px-2 py-1 border rounded text-red-600">Delete</button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">No results yet.</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

