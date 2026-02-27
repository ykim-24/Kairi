import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "../api/client";
import type { SyncProgress, Installation } from "../api/types";

export function useSync() {
  const [enabled, setEnabled] = useState(false);
  const [repos, setRepos] = useState<Installation[]>([]);
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [syncing, setSyncing] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();
    intervalRef.current = setInterval(async () => {
      try {
        const p = await api.getSyncStatus();
        setProgress(p);
        if (p.status === "done" || p.status === "error" || p.status === "idle") {
          setSyncing(false);
          stopPolling();
        }
      } catch {
        stopPolling();
        setSyncing(false);
      }
    }, 2000);
  }, [stopPolling]);

  // On mount: load flags, repos, and check if a sync is already running
  useEffect(() => {
    api.getSyncFlag().then((f) => setEnabled(f.enabled)).catch(() => {});
    api.getInstallations().then(setRepos).catch(() => {});
    api.getSyncStatus().then((p) => {
      setProgress(p);
      if (p.status === "running") {
        setSyncing(true);
        startPolling();
      }
    }).catch(() => {});
  }, [startPolling]);

  const toggleEnabled = useCallback(async (value: boolean) => {
    try {
      await api.setSyncFlag(value);
      setEnabled(value);
    } catch {
      // revert on failure
    }
  }, []);

  const startSync = useCallback(
    async (repo: string, installationId: number) => {
      const res = await api.startSync(repo, installationId);
      if (res.ok) {
        setSyncing(true);
        setProgress({
          status: "running",
          repo,
          totalPRs: 0,
          processedPRs: 0,
          commentsIngested: 0,
        });
        startPolling();
      }
      return res;
    },
    [startPolling]
  );

  useEffect(() => stopPolling, [stopPolling]);

  return { enabled, repos, progress, syncing, toggleEnabled, startSync };
}
