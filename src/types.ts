export type Bounds = {
  north: number;
  south: number;
  east: number;
  west: number;
};

export type ArrowSelection = {
  latitude: number;
  longitude: number;
  bearingDeg: number; // 0..360, 0 is north, clockwise
  lengthMeters: number;
};

export type MapStateSnapshot = {
  zoom: number;
  center: { latitude: number; longitude: number };
  bounds: Bounds;
  style: string;
};

export type PovRequest = {
  prompt: string;
  arrow: ArrowSelection;
  map: MapStateSnapshot;
};

export type PovResult = {
  id: string;
  createdAt: number; // epoch ms
  request: PovRequest;
  mapSnapshotDataUrl: string; // small preview of map
  imageDataUrl: string; // generated image (data url)
  model?: string;
  safetyLabels?: string[];
};

