"use client";
import { useEffect, useState } from "react";
import { PovResult } from "@/types";
import { loadHistory, saveHistory } from "@/utils/storage";

export function useHistory() {
  const [items, setItems] = useState<PovResult[]>([]);

  useEffect(() => {
    setItems(loadHistory());
  }, []);

  const add = (item: PovResult) => {
    setItems((prev) => {
      const next = [item, ...prev];
      saveHistory(next);
      return next;
    });
  };

  const remove = (id: string) => {
    setItems((prev) => {
      const next = prev.filter((p) => p.id !== id);
      saveHistory(next);
      return next;
    });
  };

  const clear = () => {
    setItems(() => {
      saveHistory([]);
      return [];
    });
  };

  return { items, add, remove, clear };
}

