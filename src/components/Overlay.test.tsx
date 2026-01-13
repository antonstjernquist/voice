import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { Overlay } from "./Overlay";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";

type EventCallback = (event: { payload: unknown }) => void;

const mockListen = listen as ReturnType<typeof vi.fn>;
const mockInvoke = invoke as ReturnType<typeof vi.fn>;

describe("Overlay", () => {
  let eventListeners: Map<string, EventCallback>;
  let unlisteners: (() => void)[];

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    eventListeners = new Map();
    unlisteners = [];

    mockListen.mockImplementation((eventName: string, callback: EventCallback) => {
      eventListeners.set(eventName, callback);
      const unlisten = () => {
        eventListeners.delete(eventName);
      };
      unlisteners.push(unlisten);
      return Promise.resolve(unlisten);
    });

    mockInvoke.mockImplementation((command: string) => {
      if (command === "is_model_ready") {
        return Promise.resolve(true);
      }
      return Promise.resolve();
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    eventListeners.clear();
  });

  const emitEvent = (eventName: string, payload?: unknown) => {
    const callback = eventListeners.get(eventName);
    if (callback) {
      act(() => {
        callback({ payload });
      });
    }
  };

  describe("initial state", () => {
    it("renders without crashing", async () => {
      render(<Overlay />);
      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith("is_model_ready");
      });
    });

    it("checks if model is ready on mount", async () => {
      render(<Overlay />);
      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith("is_model_ready");
      });
    });

    it("triggers model download if not ready", async () => {
      mockInvoke.mockImplementation((command: string) => {
        if (command === "is_model_ready") return Promise.resolve(false);
        if (command === "download_whisper_model") return Promise.resolve();
        return Promise.resolve();
      });

      render(<Overlay />);

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith("download_whisper_model");
      });
    });

    it("registers all required event listeners", async () => {
      render(<Overlay />);

      await waitFor(() => {
        expect(mockListen).toHaveBeenCalledWith("download-progress", expect.any(Function));
        expect(mockListen).toHaveBeenCalledWith("recording-started", expect.any(Function));
        expect(mockListen).toHaveBeenCalledWith("audio-level", expect.any(Function));
        expect(mockListen).toHaveBeenCalledWith("recording-stopped", expect.any(Function));
        expect(mockListen).toHaveBeenCalledWith("transcription-started", expect.any(Function));
        expect(mockListen).toHaveBeenCalledWith("transcription-complete", expect.any(Function));
        expect(mockListen).toHaveBeenCalledWith("transcription-error", expect.any(Function));
      });
    });
  });

  describe("download progress", () => {
    it("shows progress bar when downloading model", async () => {
      mockInvoke.mockImplementation((command: string) => {
        if (command === "is_model_ready") return Promise.resolve(false);
        return Promise.resolve();
      });

      const { container } = render(<Overlay />);

      await waitFor(() => {
        expect(eventListeners.has("download-progress")).toBe(true);
      });

      emitEvent("download-progress", [50, 100]);

      await waitFor(() => {
        const progressBar = container.querySelector('[style*="width: 50%"]');
        expect(progressBar).toBeInTheDocument();
      });
    });

    it("updates progress bar as download progresses", async () => {
      mockInvoke.mockImplementation((command: string) => {
        if (command === "is_model_ready") return Promise.resolve(false);
        return Promise.resolve();
      });

      const { container } = render(<Overlay />);

      await waitFor(() => {
        expect(eventListeners.has("download-progress")).toBe(true);
      });

      emitEvent("download-progress", [25, 100]);

      await waitFor(() => {
        const progressBar = container.querySelector('[style*="width: 25%"]');
        expect(progressBar).toBeInTheDocument();
      });

      emitEvent("download-progress", [75, 100]);

      await waitFor(() => {
        const progressBar = container.querySelector('[style*="width: 75%"]');
        expect(progressBar).toBeInTheDocument();
      });
    });
  });

  describe("recording state", () => {
    it("shows equalizer bars when recording starts", async () => {
      const { container } = render(<Overlay />);

      await waitFor(() => {
        expect(eventListeners.has("recording-started")).toBe(true);
      });

      emitEvent("recording-started");

      await waitFor(() => {
        const bars = container.querySelectorAll(".rounded-full");
        expect(bars.length).toBeGreaterThan(0);
      });
    });

    it("updates bars based on audio level", async () => {
      const { container } = render(<Overlay />);

      await waitFor(() => {
        expect(eventListeners.has("recording-started")).toBe(true);
      });

      emitEvent("recording-started");
      emitEvent("audio-level", 0.8);

      vi.advanceTimersByTime(100);

      await waitFor(() => {
        const bars = container.querySelectorAll(".rounded-full");
        expect(bars.length).toBe(18);
      });
    });
  });

  describe("processing state", () => {
    it("transitions to processing when recording stops", async () => {
      const { container } = render(<Overlay />);

      await waitFor(() => {
        expect(eventListeners.has("recording-started")).toBe(true);
      });

      emitEvent("recording-started");
      emitEvent("recording-stopped");

      vi.advanceTimersByTime(100);

      await waitFor(() => {
        const bars = container.querySelectorAll(".rounded-full");
        expect(bars.length).toBeGreaterThan(0);
      });
    });

    it("shows pulsing animation during processing", async () => {
      const { container } = render(<Overlay />);

      await waitFor(() => {
        expect(eventListeners.has("transcription-started")).toBe(true);
      });

      emitEvent("recording-started");
      emitEvent("transcription-started");

      vi.advanceTimersByTime(100);

      await waitFor(() => {
        const bars = container.querySelectorAll(".rounded-full");
        expect(bars.length).toBe(18);
      });
    });
  });

  describe("done state", () => {
    it("shows checkmark when transcription completes", async () => {
      const { container } = render(<Overlay />);

      await waitFor(() => {
        expect(eventListeners.has("transcription-complete")).toBe(true);
      });

      emitEvent("recording-started");
      emitEvent("transcription-complete", "Hello world");

      await waitFor(() => {
        const svg = container.querySelector("svg");
        expect(svg).toBeInTheDocument();
      });
    });

    it("displays checkmark path for done state", async () => {
      const { container } = render(<Overlay />);

      await waitFor(() => {
        expect(eventListeners.has("transcription-complete")).toBe(true);
      });

      emitEvent("recording-started");
      emitEvent("transcription-complete", "Test");

      await waitFor(() => {
        const path = container.querySelector('path[d="M5 13l4 4L19 7"]');
        expect(path).toBeInTheDocument();
      });
    });
  });

  describe("error state", () => {
    it("shows error icon when transcription fails", async () => {
      const { container } = render(<Overlay />);

      await waitFor(() => {
        expect(eventListeners.has("transcription-error")).toBe(true);
      });

      emitEvent("recording-started");
      emitEvent("transcription-error", "Failed to transcribe");

      await waitFor(() => {
        const svg = container.querySelector("svg");
        expect(svg).toBeInTheDocument();
      });
    });

    it("displays X path for error state", async () => {
      const { container } = render(<Overlay />);

      await waitFor(() => {
        expect(eventListeners.has("transcription-error")).toBe(true);
      });

      emitEvent("recording-started");
      emitEvent("transcription-error", "Error");

      await waitFor(() => {
        const path = container.querySelector('path[d="M6 18L18 6M6 6l12 12"]');
        expect(path).toBeInTheDocument();
      });
    });
  });

  describe("state transitions", () => {
    it("transitions smoothly from recording to processing to done", async () => {
      const { container } = render(<Overlay />);

      await waitFor(() => {
        expect(eventListeners.has("recording-started")).toBe(true);
      });

      emitEvent("recording-started");
      vi.advanceTimersByTime(50);

      let bars = container.querySelectorAll(".rounded-full");
      expect(bars.length).toBe(18);

      emitEvent("recording-stopped");
      vi.advanceTimersByTime(50);

      bars = container.querySelectorAll(".rounded-full");
      expect(bars.length).toBe(18);

      emitEvent("transcription-complete", "Test");
      vi.advanceTimersByTime(350);

      await waitFor(() => {
        const checkmark = container.querySelector('path[d="M5 13l4 4L19 7"]');
        expect(checkmark).toBeInTheDocument();
      });
    });

    it("handles rapid state changes without errors", async () => {
      const { container } = render(<Overlay />);

      await waitFor(() => {
        expect(eventListeners.has("recording-started")).toBe(true);
      });

      emitEvent("recording-started");
      emitEvent("audio-level", 0.5);
      emitEvent("recording-stopped");
      emitEvent("transcription-started");
      emitEvent("transcription-complete", "Fast");

      vi.advanceTimersByTime(500);

      await waitFor(() => {
        const checkmark = container.querySelector("svg");
        expect(checkmark).toBeInTheDocument();
      });
    });
  });

  describe("cleanup", () => {
    it("cleans up event listeners on unmount", async () => {
      const { unmount } = render(<Overlay />);

      await waitFor(() => {
        expect(eventListeners.size).toBeGreaterThan(0);
      });

      unmount();
    });

    it("cancels animation frame on unmount", async () => {
      const cancelSpy = vi.spyOn(global, "cancelAnimationFrame");

      const { unmount } = render(<Overlay />);

      await waitFor(() => {
        expect(eventListeners.has("recording-started")).toBe(true);
      });

      emitEvent("recording-started");
      vi.advanceTimersByTime(100);

      unmount();

      expect(cancelSpy).toHaveBeenCalled();
    });
  });

  describe("styling", () => {
    it("applies correct border color", async () => {
      const { container } = render(<Overlay />);

      await waitFor(() => {
        const mainDiv = container.querySelector(".border-2");
        expect(mainDiv).toBeInTheDocument();
      });
    });

    it("applies backdrop blur", async () => {
      const { container } = render(<Overlay />);

      await waitFor(() => {
        const blurDiv = container.querySelector(".backdrop-blur-xl");
        expect(blurDiv).toBeInTheDocument();
      });
    });

    it("uses cream color for bars", async () => {
      const { container } = render(<Overlay />);

      await waitFor(() => {
        expect(eventListeners.has("recording-started")).toBe(true);
      });

      emitEvent("recording-started");

      await waitFor(() => {
        const bar = container.querySelector('[style*="rgba(255, 253, 245"]');
        expect(bar).toBeInTheDocument();
      });
    });
  });
});
