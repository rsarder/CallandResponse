import type { GestureRecognizer as GestureRecognizerInstance } from '@mediapipe/tasks-vision';
import type { GestureFrame, TrackedHand } from './types';

type MediaPipeApi = Pick<typeof import('@mediapipe/tasks-vision'), 'FilesetResolver' | 'GestureRecognizer'>;
type VisionWorkerScope = {
  exports: Partial<MediaPipeApi>;
  importScripts: (...urls: string[]) => void;
  postMessage: (message: unknown) => void;
  onmessage: ((event: MessageEvent<GestureWorkerRequest>) => void) | null;
  onmessageerror: (() => void) | null;
};
type GestureWorkerRequest = { kind: 'initialize'; libraryUrl: string; wasmBaseUrl: string; modelUrl: string } | { kind: 'frame'; bitmap: ImageBitmap; timestamp: number };
const workerScope = self as unknown as VisionWorkerScope;
workerScope.exports = {};
let recognizer: GestureRecognizerInstance | null = null;

workerScope.onmessage = async (event: MessageEvent<GestureWorkerRequest>) => {
  const message = event.data;
  try {
    if (message.kind === 'initialize') {
      workerScope.importScripts(message.libraryUrl);
      const { FilesetResolver, GestureRecognizer } = workerScope.exports as MediaPipeApi;
      const files = await FilesetResolver.forVisionTasks(message.wasmBaseUrl);
      recognizer = await GestureRecognizer.createFromOptions(files, {
        baseOptions: { modelAssetPath: message.modelUrl },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.6,
        minHandPresenceConfidence: 0.6,
        minTrackingConfidence: 0.55,
      });
      workerScope.postMessage({ kind: 'ready' });
      return;
    }
    if (!recognizer) throw new Error('Gesture recognizer is not initialized');
    const result = recognizer.recognizeForVideo(message.bitmap, message.timestamp);
    const hands: TrackedHand[] = result.landmarks.map((landmarks, index) => ({
      landmarks: landmarks.map(({ x, y, z }) => ({ x, y, z })),
      worldLandmarks: (result.worldLandmarks[index] ?? []).map(({ x, y, z }) => ({ x, y, z })),
      gesture: result.gestures[index]?.[0]?.categoryName ?? 'None',
      confidence: result.gestures[index]?.[0]?.score ?? 0,
      handedness: result.handedness[index]?.[0]?.displayName ?? result.handedness[index]?.[0]?.categoryName ?? 'Unknown',
    }));
    const frame: GestureFrame = { hands, timestamp: message.timestamp };
    workerScope.postMessage({ kind: 'frame', frame });
  } catch (error) {
    workerScope.postMessage({ kind: 'error', message: error instanceof Error ? error.message : 'MediaPipe inference failed' });
  } finally {
    if (message.kind === 'frame') message.bitmap.close();
  }
};

workerScope.onmessageerror = () => workerScope.postMessage({ kind: 'error', message: 'Could not read a camera frame.' });
