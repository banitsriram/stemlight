import type { Hand, Vec3 } from '../contracts';

/** One hand as read from its XR joints this frame, in world metres. */
export interface HandFrame {
  tracked: boolean;
  /** 0..1, the share of the 25 joints the runtime reported. WebXR has no confidence value of its own. */
  confidence: number;
  palm: Vec3;
  /** Index fingertip. */
  tip: Vec3;
  thumbTip: Vec3;
  /** Curl per finger, 0 straight .. 1 fully curled: index, middle, ring, pinky. */
  curls: [number, number, number, number];
  /** Thumb tip to index tip, metres. */
  pinchDist: number;
}

/** Head position and forward direction (unit vector) in world space. Quest 3 has no eye tracking, so this is the gaze. */
export interface HeadFrame { pos: Vec3; dir: Vec3 }

/** Everything the recognisers see in one frame. `t` is seconds on any monotonic clock. */
export interface InputFrame {
  t: number;
  hands: Partial<Record<Hand, HandFrame | null>>;
  head: HeadFrame | null;
}

/** WebXR joint name → world position. Missing joints were not reported this frame. */
export type JointMap = Partial<Record<string, Vec3>>;
