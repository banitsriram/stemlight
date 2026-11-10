// Pure hand geometry: XR joint positions in, curl / pinch / palm out. No framework imports, so node can test it.
import type { Vec3 } from '../contracts';
import type { HandFrame, JointMap } from './types';

export const FINGERS = ['index', 'middle', 'ring', 'pinky'] as const;
const SEGMENTS = ['metacarpal', 'phalanx-proximal', 'phalanx-intermediate', 'phalanx-distal', 'tip'] as const;
const THUMB = ['thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip'] as const;

/** Every WebXR hand joint, in the spec's order. */
export const JOINT_NAMES: string[] = [
  'wrist', ...THUMB, ...FINGERS.flatMap((f) => SEGMENTS.map((s) => `${f}-finger-${s}`)),
];

/**
 * Total bend (MCP + PIP + DIP) of a fully curled finger, in degrees. Calibrated on IWER's hand
 * library: its `fist` pose bends each finger about 240-255 degrees, `open` about 10-35.
 */
export const FULL_CURL_DEG = 250;

export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const dist = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export const mid = (a: Vec3, b: Vec3): Vec3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];

function angleDeg(a: Vec3, b: Vec3): number {
  const la = Math.hypot(...a), lb = Math.hypot(...b);
  if (la === 0 || lb === 0) return 0;
  const c = (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (la * lb);
  return (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI;
}

/** 0 straight .. 1 fully curled, from the angles between the finger's four bones; null if a joint is missing. */
export function fingerCurl(joints: JointMap, finger: (typeof FINGERS)[number]): number | null {
  const points = SEGMENTS.map((s) => joints[`${finger}-finger-${s}`]);
  if (points.some((p) => !p)) return null;
  const p = points as Vec3[];
  let bend = 0;
  for (let i = 2; i < p.length; i++) bend += angleDeg(sub(p[i - 1], p[i - 2]), sub(p[i], p[i - 1]));
  return Math.min(1, bend / FULL_CURL_DEG);
}

/**
 * The single curl the fist rule uses: the second-lowest of the four finger curls, so
 * `handCurl >= x` exactly when at least 3 of the 4 fingers curl to x or more.
 */
export function handCurl(curls: readonly number[]): number {
  return [...curls].sort((a, b) => a - b)[1];
}

/** Builds a HandFrame from joint positions. Untracked when the wrist, a fingertip or a finger chain is missing. */
export function readHand(joints: JointMap): HandFrame {
  const present = JOINT_NAMES.filter((n) => joints[n]).length;
  const wrist = joints.wrist, knuckle = joints['middle-finger-phalanx-proximal'];
  const tip = joints['index-finger-tip'], thumbTip = joints['thumb-tip'];
  const curls = FINGERS.map((f) => fingerCurl(joints, f));
  const zero: Vec3 = [0, 0, 0];
  if (!wrist || !knuckle || !tip || !thumbTip || curls.some((c) => c === null)) {
    return {
      tracked: false, confidence: present / JOINT_NAMES.length,
      palm: wrist ?? zero, tip: tip ?? zero, thumbTip: thumbTip ?? zero, curls: [0, 0, 0, 0], pinchDist: Infinity,
    };
  }
  return {
    tracked: true,
    confidence: present / JOINT_NAMES.length,
    palm: mid(wrist, knuckle),
    tip,
    thumbTip,
    curls: curls as [number, number, number, number],
    pinchDist: dist(tip, thumbTip),
  };
}
