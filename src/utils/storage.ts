import { PovResult } from "@/types";

const KEY = "povmap:history:v1";

export function loadHistory(): PovResult[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as PovResult[];
  } catch {
    return [];
  }
}

export function saveHistory(history: PovResult[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(history));
}

export function appendResult(result: PovResult) {
  const history = loadHistory();
  history.unshift(result);
  saveHistory(history);
}

export function removeResult(id: string) {
  const history = loadHistory().filter((r) => r.id !== id);
  saveHistory(history);
}

export function clearHistory() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
}

