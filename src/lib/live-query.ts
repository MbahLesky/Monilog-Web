import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase-client";

type ChangeListener = () => void;
const listeners = new Set<ChangeListener>();

export function notifyDatabaseChange() {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch (e) {
      console.error("[LiveQuery] Listener error:", e);
    }
  });
}

let activeRealtimeChannel: ReturnType<NonNullable<typeof supabase>["channel"]> | null = null;

export function initGlobalRealtime(userId: string) {
  if (!supabase || !userId) return () => {};

  if (activeRealtimeChannel) {
    try {
      supabase.removeChannel(activeRealtimeChannel);
    } catch {}
    activeRealtimeChannel = null;
  }

  const channel = supabase
    .channel(`realtime-ledger-live-${userId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "transactions", filter: `user_id=eq.${userId}` },
      () => notifyDatabaseChange()
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "accounts", filter: `user_id=eq.${userId}` },
      () => notifyDatabaseChange()
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "categories", filter: `user_id=eq.${userId}` },
      () => notifyDatabaseChange()
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "transfers", filter: `user_id=eq.${userId}` },
      () => notifyDatabaseChange()
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "budgets", filter: `user_id=eq.${userId}` },
      () => notifyDatabaseChange()
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "recurring_transactions", filter: `user_id=eq.${userId}` },
      () => notifyDatabaseChange()
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "profiles", filter: `id=eq.${userId}` },
      () => notifyDatabaseChange()
    )
    .subscribe();

  activeRealtimeChannel = channel;

  return () => {
    if (activeRealtimeChannel) {
      try {
        supabase?.removeChannel(activeRealtimeChannel);
      } catch {}
      activeRealtimeChannel = null;
    }
  };
}

export function useLiveQuery<T>(
  querier: () => Promise<T> | T,
  deps: unknown[] = []
): T | undefined {
  const [data, setData] = useState<T | undefined>(undefined);
  const querierRef = useRef(querier);
  querierRef.current = querier;

  useEffect(() => {
    let isCancelled = false;

    async function execute() {
      try {
        const result = await querierRef.current();
        if (!isCancelled) {
          setData(result);
        }
      } catch (err) {
        console.error("[useLiveQuery] Query execution failed:", err);
      }
    }

    void execute();

    const handleChange = () => {
      void execute();
    };

    listeners.add(handleChange);
    return () => {
      isCancelled = true;
      listeners.delete(handleChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return data;
}
