"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { CameraOff, Keyboard, RotateCcw, ScanLine } from "lucide-react";
import { Button, Spinner } from "@/components/ui";
import { Sheet } from "@/components/ui/sheet";
import { useI18n } from "@/i18n/client";
import { parseQrPayload, type QrTarget } from "../codes";

type ScanState = "starting" | "scanning" | "denied" | "unsupported" | "error" | "unknown";

interface Detector {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}

/**
 * Camera QR scanner in a sheet. Uses the native BarcodeDetector when the browser has it,
 * otherwise jsQR on downscaled video frames. Frames stay in memory; nothing is recorded.
 */
export function QrScanner({ open, onClose, onResult, onTypeInstead }: { open: boolean; onClose: () => void; onResult: (t: QrTarget) => void; onTypeInstead: () => void }) {
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [state, setState] = useState<ScanState>("starting");
  const [attempt, setAttempt] = useState(0);
  const resultCb = useRef(onResult);
  resultCb.current = onResult;

  const stop = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    if (!open) {
      stop();
      return;
    }
    let cancelled = false;
    (async () => {
      setState("starting");
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setState("unsupported");
        return;
      }
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      } catch (e) {
        if (cancelled) return;
        const name = (e as { name?: string })?.name;
        setState(name === "NotAllowedError" || name === "SecurityError" ? "denied" : name === "NotFoundError" ? "unsupported" : "error");
        return;
      }
      if (cancelled) {
        stream.getTracks().forEach((tr) => tr.stop());
        return;
      }
      streamRef.current = stream;
      const video = videoRef.current!;
      video.srcObject = stream;
      try {
        await video.play();
      } catch {
        /* autoplay policies: the stream still renders frames */
      }
      setState("scanning");

      const W = window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector };
      let detector: Detector | null = null;
      try {
        if (W.BarcodeDetector) detector = new W.BarcodeDetector({ formats: ["qr_code"] });
      } catch {
        detector = null;
      }
      const jsQR = detector ? null : (await import("jsqr")).default;
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true });

      const tick = async () => {
        if (cancelled || !streamRef.current) return;
        let raw: string | null = null;
        try {
          if (video.readyState >= 2) {
            if (detector) {
              const codes = await detector.detect(video);
              raw = codes[0]?.rawValue ?? null;
            } else if (jsQR && ctx) {
              const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
              canvas.width = Math.round(video.videoWidth * scale);
              canvas.height = Math.round(video.videoHeight * scale);
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
              raw = jsQR(img.data, img.width, img.height, { inversionAttempts: "attemptBoth" })?.data ?? null;
            }
          }
        } catch {
          /* a bad frame; keep scanning */
        }
        if (raw) {
          const target = parseQrPayload(raw);
          if (target.kind === "unknown") {
            setState("unknown");
          } else {
            stop();
            resultCb.current(target);
            return;
          }
        }
        timer.current = setTimeout(tick, 220);
      };
      void tick();
    })();
    return () => {
      cancelled = true;
      stop();
    };
  }, [open, attempt, stop]);

  const problem =
    state === "denied" ? { title: t("heritage.scan.deniedTitle"), body: t("heritage.scan.deniedBody") }
    : state === "unsupported" ? { title: t("heritage.scan.unsupported"), body: null }
    : state === "error" ? { title: t("heritage.scan.error"), body: null }
    : null;

  return (
    <Sheet open={open} onClose={onClose} title={t("heritage.scan.title")} description={t("heritage.scan.hint")} closeLabel={t("action.close")}>
      <div className="flex flex-col gap-4" data-testid="qr-scanner" data-state={state}>
        {problem ? (
          <div className="flex flex-col items-center text-center gap-3 rounded-[var(--radius-lg)] bg-surface-2 px-5 py-8" role="alert">
            <span className="size-14 rounded-full bg-surface grid place-items-center text-ink-2">
              <CameraOff className="size-7" aria-hidden />
            </span>
            <p className="font-semibold text-ink max-w-[34ch]">{problem.title}</p>
            {problem.body && <p className="text-ink-2 text-sm max-w-[40ch]">{problem.body}</p>}
            <div className="flex flex-wrap justify-center gap-2 pt-1">
              <Button onClick={onTypeInstead}>
                <Keyboard className="size-4" aria-hidden />
                {t("heritage.scan.typeInstead")}
              </Button>
              {state !== "unsupported" && (
                <Button variant="secondary" onClick={() => setAttempt((a) => a + 1)}>
                  <RotateCcw className="size-4" aria-hidden />
                  {t("action.retry")}
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="relative aspect-square w-full max-w-sm mx-auto overflow-hidden rounded-[var(--radius-lg)] bg-brand">
            <video ref={videoRef} className="absolute inset-0 size-full object-cover" playsInline muted aria-label={t("heritage.scan.viewfinder")} />
            <div className="absolute inset-[14%] rounded-[22px] border-2 border-white/85 shadow-[0_0_0_999px_rgb(7_10_34/0.45)]" aria-hidden />
            <ScanLine className="absolute inset-0 m-auto size-10 text-white/70 motion-safe:animate-pulse" aria-hidden />
            {state === "starting" && (
              <div className="absolute inset-0 grid place-items-center text-white">
                <Spinner label={t("heritage.scan.starting")} className="text-white" />
              </div>
            )}
          </div>
        )}
        {state === "unknown" && <p className="text-sm text-warn text-center" role="status">{t("heritage.scan.unknown")}</p>}
        {!problem && (
          <Button variant="ghost" onClick={onTypeInstead} className="self-center">
            <Keyboard className="size-4" aria-hidden />
            {t("heritage.scan.typeInstead")}
          </Button>
        )}
      </div>
    </Sheet>
  );
}
