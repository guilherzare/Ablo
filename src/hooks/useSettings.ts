import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface Settings {
  template_path: string | null;
  export_folder: string;
  microphone_id: string | null;
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    invoke<{ result: Settings }>("call_backend", {
      method: "get_settings",
      params: {},
    })
      .then((res) => setSettings(res.result))
      .finally(() => setLoading(false));
  }, []);

  async function save(patch: Partial<Settings>) {
    const res = await invoke<{ result: Settings }>("call_backend", {
      method: "update_settings",
      params: patch,
    });
    setSettings(res.result);
    return res.result;
  }

  return { settings, loading, save };
}
