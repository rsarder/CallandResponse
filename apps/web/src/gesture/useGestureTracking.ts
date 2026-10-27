import { useCallback, useEffect, useRef, useState } from 'react';
import type { GestureFrame, GestureStatus } from './types';

interface WorkerMessage {
  kind: 'ready' | 'frame' | 'error';
  frame?: GestureFrame;
  message?: string;
}

export function useGestureTracking() {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const worker = useRef<Worker | null>(null);
  const frameRequest = useRef<number | null>(null);
  const frameInFlight = useRef(false);
  const lastVideoTime = useRef(-1);
  const ready = useRef<(() => void) | null>(null);
  const [status, setStatus] = useState<GestureStatus>('off');
  const [error, setError] = useState<string | null>(null);
  const [frame, setFrame] = useState<GestureFrame>({ hands: [], timestamp: 0 });

  const stop = useCallback(() => {
    if (frameRequest.current !== null) cancelAnimationFrame(frameRequest.current);
    frameRequest.current = null;
    frameInFlight.current = false;
    worker.current?.terminate(); worker.current = null; ready.current = null;
    stream.current?.getTracks().forEach(track => track.stop()); stream.current = null;
    if (video.current) video.current.srcObject = null;
    setFrame({ hands: [], timestamp: 0 }); setStatus('off'); setError(null);
  }, []);

  const start = useCallback(async () => {
    if (status === 'requesting' || status === 'loading' || status === 'tracking') return;
    setStatus('requesting'); setError(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser does not provide webcam access. Use HTTPS or localhost in a supported browser.');
      const cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
      stream.current = cameraStream;
      if (!video.current) throw new Error('The webcam preview is unavailable.');
      video.current.srcObject = cameraStream;
      await video.current.play();
      setStatus('loading');

      const visionWorker = new Worker(new URL('./gesture.worker.ts', import.meta.url), { type: 'classic' });
      worker.current = visionWorker;
      let initialized = false;
      const isReady = new Promise<void>((resolve, reject) => {
        ready.current = resolve;
        visionWorker.onmessage = (event: MessageEvent<WorkerMessage>) => {
          const message = event.data;
          if (message.kind === 'ready') { initialized = true; ready.current?.(); ready.current = null; }
          else if (message.kind === 'frame' && message.frame) { frameInFlight.current = false; setFrame(message.frame); }
          else if (message.kind === 'error') {
            frameInFlight.current = false;
            if (!initialized) reject(new Error(message.message ?? 'MediaPipe failed'));
            else {
              const failure = message.message ?? 'MediaPipe inference failed';
              if (frameRequest.current !== null) cancelAnimationFrame(frameRequest.current);
              frameRequest.current = null; visionWorker.terminate(); worker.current = null;
              stream.current?.getTracks().forEach(track => track.stop()); stream.current = null;
              if (video.current) video.current.srcObject = null;
              setError(failure); setStatus('error');
            }
          }
        };
        visionWorker.onerror = event => {
          const failure = new Error(event.message || 'Could not start the MediaPipe worker.');
          if (!initialized) reject(failure);
          else { setError(failure.message); setStatus('error'); }
        };
      });
      visionWorker.postMessage({
        kind: 'initialize',
        libraryUrl: `${import.meta.env.BASE_URL}mediapipe/vision_bundle.cjs`,
        wasmBaseUrl: `${import.meta.env.BASE_URL}mediapipe/wasm/`,
        modelUrl: `${import.meta.env.BASE_URL}gesture_recognizer.task`,
      });
      await isReady;
      setStatus('tracking');

      const detect = () => {
        const element = video.current;
        if (element && element.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && element.currentTime !== lastVideoTime.current && !frameInFlight.current) {
          lastVideoTime.current = element.currentTime; frameInFlight.current = true;
          void createImageBitmap(element).then(bitmap => {
            if (worker.current === visionWorker) visionWorker.postMessage({ kind: 'frame', bitmap, timestamp: performance.now() }, [bitmap]);
            else bitmap.close();
          }).catch(reason => { frameInFlight.current = false; setError(reason instanceof Error ? reason.message : 'Could not read webcam frame.'); });
        }
        frameRequest.current = requestAnimationFrame(detect);
      };
      detect();
    } catch (reason) {
      worker.current?.terminate(); worker.current = null;
      stream.current?.getTracks().forEach(track => track.stop()); stream.current = null;
      if (video.current) video.current.srcObject = null;
      const message = reason instanceof Error ? reason.message : 'Could not initialize webcam hand tracking.';
      setError(message); setStatus('error');
    }
  }, [status]);

  useEffect(() => () => {
    if (frameRequest.current !== null) cancelAnimationFrame(frameRequest.current);
    worker.current?.terminate(); stream.current?.getTracks().forEach(track => track.stop());
  }, []);

  return { video, frame, status, error, start, stop } as const;
}
