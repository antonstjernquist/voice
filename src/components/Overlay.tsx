import { useEffect, useState, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";

type RecordingState = "idle" | "recording" | "processing" | "done" | "error";

const creamColor = "rgba(255, 253, 245, 0.85)";
const creamColorDim = "rgba(255, 253, 245, 0.5)";

function StateVisualizer({ state, level }: { state: RecordingState; level: number }) {
  const barCount = 18;
  const [tick, setTick] = useState(0);
  const frameRef = useRef<number>();

  useEffect(() => {
    const animate = () => {
      setTick(t => t + 1);
      frameRef.current = requestAnimationFrame(animate);
    };
    frameRef.current = requestAnimationFrame(animate);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  const getBarStyle = (index: number) => {
    if (state === "recording") {
      const wave = Math.sin(tick / 8 + index * 0.7) * 0.4 + Math.cos(tick / 12 + index * 1.1) * 0.3;
      const baseHeight = 0.3 + wave * 0.5;
      const height = 8 + (level * (baseHeight + 0.5) * 28);
      return {
        height: Math.max(8, Math.min(36, height)),
        opacity: 0.85,
      };
    }

    if (state === "processing") {
      const pulse = Math.sin(tick / 15 + index * 0.3) * 0.5 + 0.5;
      return {
        height: 6 + pulse * 4,
        opacity: 0.5 + pulse * 0.3,
      };
    }

    return { height: 0, opacity: 0 };
  };

  const showBars = state === "recording" || state === "processing";
  const showIcon = state === "done" || state === "error";

  return (
    <div className="relative flex items-center justify-center h-10 w-full">
      <div
        className="flex items-center justify-center gap-[4px] transition-all duration-300"
        style={{ opacity: showBars ? 1 : 0, transform: showBars ? "scale(1)" : "scale(0.5)" }}
      >
        {[...Array(barCount)].map((_, i) => {
          const style = getBarStyle(i);
          return (
            <div
              key={i}
              className="w-[4px] rounded-full transition-all duration-300 ease-out"
              style={{
                height: `${style.height}px`,
                opacity: style.opacity,
                backgroundColor: creamColor,
              }}
            />
          );
        })}
      </div>

      {showIcon && (
        <div
          className="absolute inset-0 flex items-center justify-center transition-all duration-300"
          style={{ opacity: showIcon ? 1 : 0, transform: showIcon ? "scale(1)" : "scale(0.8)" }}
        >
          {state === "done" && (
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke={creamColor} strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
          {state === "error" && (
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke={creamColorDim} strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
        </div>
      )}
    </div>
  );
}

export function Overlay() {
  const [state, setState] = useState<RecordingState>("idle");
  const [modelReady, setModelReady] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [downloadProgress, setDownloadProgress] = useState<{
    downloaded: number;
    total: number;
  } | null>(null);

  useEffect(() => {
    invoke<boolean>("is_model_ready").then((ready) => {
      setModelReady(ready);
      if (!ready) {
        invoke("download_whisper_model").catch(console.error);
      }
    });
  }, []);

  useEffect(() => {
    const unlisteners: (() => void)[] = [];

    listen("download-progress", (event) => {
      const [downloaded, total] = event.payload as [number, number];
      setDownloadProgress({ downloaded, total });
      if (downloaded >= total) {
        setModelReady(true);
        setDownloadProgress(null);
      }
    }).then((unlisten) => unlisteners.push(unlisten));

    listen("recording-started", () => {
      setState("recording");
      setAudioLevel(0);
    }).then((unlisten) => unlisteners.push(unlisten));

    listen<number>("audio-level", (event) => {
      setAudioLevel(event.payload);
    }).then((unlisten) => unlisteners.push(unlisten));

    listen("recording-stopped", () => {
      setState("processing");
      setAudioLevel(0);
    }).then((unlisten) => unlisteners.push(unlisten));

    listen("transcription-started", () => {
      setState("processing");
    }).then((unlisten) => unlisteners.push(unlisten));

    listen<string>("transcription-complete", () => {
      setState("done");
    }).then((unlisten) => unlisteners.push(unlisten));

    listen<string>("transcription-error", () => {
      setState("error");
    }).then((unlisten) => unlisteners.push(unlisten));

    return () => {
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, []);

  if (!modelReady && downloadProgress) {
    const percent = downloadProgress.total
      ? Math.round((downloadProgress.downloaded / downloadProgress.total) * 100)
      : 0;
    return (
      <div
        className="flex h-screen w-screen items-center justify-center bg-neutral-900/95 backdrop-blur-xl rounded-2xl border-2"
        style={{ borderColor: "rgba(255, 253, 245, 0.25)" }}
      >
        <div className="w-24 h-1 rounded-full overflow-hidden" style={{ backgroundColor: "rgba(255, 253, 245, 0.1)" }}>
          <div
            className="h-full transition-all duration-300 rounded-full"
            style={{ width: `${percent}%`, backgroundColor: "rgba(255, 253, 245, 0.8)" }}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex h-screen w-screen items-center justify-center bg-neutral-900/95 backdrop-blur-xl rounded-2xl border-2"
      style={{ borderColor: "rgba(255, 253, 245, 0.25)" }}
    >
      {state !== "idle" && (
        <StateVisualizer state={state} level={audioLevel} />
      )}
    </div>
  );
}
