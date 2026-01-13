import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";

const creamColor = "rgba(255, 253, 245, 0.85)";
const creamColorDim = "rgba(255, 253, 245, 0.5)";
const borderColor = "rgba(255, 253, 245, 0.25)";

type ModelInfo = [string, string, boolean];
type DownloadProgress = { size: string; downloaded: number; total: number };

export function Settings() {
  const [devices, setDevices] = useState<string[]>([]);
  const [currentDevice, setCurrentDevice] = useState<string | null>(null);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("small");
  const [micPermission, setMicPermission] = useState(true);
  const [accessibilityPermission, setAccessibilityPermission] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);

  useEffect(() => {
    invoke<string[]>("get_audio_devices").then(setDevices).catch(console.error);
    invoke<string | null>("get_current_device").then(setCurrentDevice).catch(console.error);
    invoke<ModelInfo[]>("get_available_models").then(setModels).catch(console.error);
    invoke<[string, boolean]>("get_model_info").then(([size]) => setSelectedModel(size)).catch(console.error);
    invoke<boolean>("check_microphone_permission").then(setMicPermission).catch(console.error);
    invoke<boolean>("check_accessibility_permission").then(setAccessibilityPermission).catch(console.error);
  }, []);

  useEffect(() => {
    const unlisten = listen<[string, number, number]>("model-download-progress", (event) => {
      const [size, downloaded, total] = event.payload;
      setDownloadProgress({ size, downloaded, total });
      if (downloaded >= total) {
        setDownloading(null);
        setDownloadProgress(null);
        invoke<ModelInfo[]>("get_available_models").then(setModels).catch(console.error);
      }
    });
    return () => { unlisten.then(fn => fn()); };
  }, []);

  const handleDeviceChange = async (deviceName: string) => {
    const device = deviceName === "default" ? null : deviceName;
    await invoke("set_audio_device", { deviceName: device });
    setCurrentDevice(device);
  };

  const handleModelSelect = async (size: string) => {
    const model = models.find(m => m[0] === size);
    if (!model) return;

    if (model[2]) {
      await invoke("set_model_size", { size });
      setSelectedModel(size);
    } else {
      setDownloading(size);
      await invoke("download_model_size", { size });
      setSelectedModel(size);
    }
  };

  const handleClose = () => {
    invoke("close_settings_window");
  };

  return (
    <div
      className="flex flex-col h-screen w-screen bg-neutral-900/95 backdrop-blur-xl rounded-2xl border-2 p-5 select-none"
      style={{ borderColor }}
      data-tauri-drag-region
    >
      <div className="flex items-center justify-between mb-6" data-tauri-drag-region>
        <h1 className="text-lg font-medium" style={{ color: creamColor }}>Settings</h1>
        <button
          onClick={handleClose}
          className="p-1 rounded-lg hover:bg-white/10 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke={creamColorDim} strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex flex-col gap-6 flex-1 overflow-y-auto">
        <section>
          <label className="text-xs font-medium uppercase tracking-wider mb-2 block" style={{ color: creamColorDim }}>
            Audio Input
          </label>
          <select
            value={currentDevice ?? "default"}
            onChange={(e) => handleDeviceChange(e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg bg-white/5 text-sm appearance-none cursor-pointer transition-colors hover:bg-white/10 focus:outline-none focus:ring-1"
            style={{ color: creamColor, borderColor, border: `1px solid ${borderColor}` }}
          >
            <option value="default">System Default</option>
            {devices.map((device) => (
              <option key={device} value={device}>{device}</option>
            ))}
          </select>
        </section>

        <section>
          <label className="text-xs font-medium uppercase tracking-wider mb-3 block" style={{ color: creamColorDim }}>
            Whisper Model
          </label>
          <div className="flex flex-col gap-2">
            {models.map(([size, label, downloaded]) => {
              const isSelected = selectedModel === size;
              const isDownloading = downloading === size;
              const progress = downloadProgress?.size === size
                ? Math.round((downloadProgress.downloaded / downloadProgress.total) * 100)
                : 0;

              return (
                <button
                  key={size}
                  onClick={() => handleModelSelect(size)}
                  disabled={isDownloading}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-left disabled:opacity-50"
                  style={{
                    backgroundColor: isSelected ? "rgba(255, 253, 245, 0.1)" : "transparent",
                    border: `1px solid ${isSelected ? creamColorDim : borderColor}`,
                  }}
                >
                  <div
                    className="w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0"
                    style={{ borderColor: isSelected ? creamColor : creamColorDim }}
                  >
                    {isSelected && (
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: creamColor }} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm" style={{ color: creamColor }}>{label}</span>
                    {isDownloading && (
                      <div className="mt-1.5 h-1 rounded-full overflow-hidden" style={{ backgroundColor: "rgba(255, 253, 245, 0.1)" }}>
                        <div
                          className="h-full transition-all duration-300 rounded-full"
                          style={{ width: `${progress}%`, backgroundColor: creamColor }}
                        />
                      </div>
                    )}
                  </div>
                  {!downloaded && !isDownloading && (
                    <span className="text-xs px-2 py-0.5 rounded" style={{ color: creamColorDim, backgroundColor: "rgba(255, 253, 245, 0.1)" }}>
                      Download
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        <section>
          <label className="text-xs font-medium uppercase tracking-wider mb-3 block" style={{ color: creamColorDim }}>
            Permissions
          </label>
          <div className="flex flex-col gap-2">
            <div
              className="flex items-center justify-between px-3 py-2.5 rounded-lg"
              style={{ border: `1px solid ${borderColor}` }}
            >
              <span className="text-sm" style={{ color: creamColor }}>Microphone</span>
              <div className="flex items-center gap-2">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: micPermission ? "#4ade80" : "#f87171" }}
                />
                <span className="text-xs" style={{ color: micPermission ? "#4ade80" : "#f87171" }}>
                  {micPermission ? "Granted" : "Required"}
                </span>
                {!micPermission && (
                  <button
                    onClick={() => invoke("open_microphone_settings")}
                    className="text-xs px-2 py-0.5 rounded hover:bg-white/10 transition-colors"
                    style={{ color: creamColorDim, border: `1px solid ${borderColor}` }}
                  >
                    Open
                  </button>
                )}
              </div>
            </div>

            <div
              className="flex items-center justify-between px-3 py-2.5 rounded-lg"
              style={{ border: `1px solid ${borderColor}` }}
            >
              <span className="text-sm" style={{ color: creamColor }}>Accessibility</span>
              <div className="flex items-center gap-2">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: accessibilityPermission ? "#4ade80" : "#f87171" }}
                />
                <span className="text-xs" style={{ color: accessibilityPermission ? "#4ade80" : "#f87171" }}>
                  {accessibilityPermission ? "Granted" : "Required"}
                </span>
                {!accessibilityPermission && (
                  <button
                    onClick={() => invoke("open_accessibility_settings")}
                    className="text-xs px-2 py-0.5 rounded hover:bg-white/10 transition-colors"
                    style={{ color: creamColorDim, border: `1px solid ${borderColor}` }}
                  >
                    Open
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>

      <div className="pt-4 mt-auto text-center">
        <span className="text-xs" style={{ color: creamColorDim }}>⇧⌘Space to record</span>
      </div>
    </div>
  );
}
