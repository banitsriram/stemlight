// Dev-only (F38): loaded by main.ts behind import.meta.env.DEV with a dynamic import, so none of it reaches dist/.
//
// DevHandPose drives IWER's emulated hands from ECS, because tests can flip a component with
// `ecs set-component` but the emulator's hand pose is otherwise only reachable from the page.
// One entity per hand, named dev-hand-left / dev-hand-right. Nothing happens until `enabled` is true,
// so the mouse-driven emulator is untouched by default.
import { createComponent, createSystem, Types, type World } from '@iwsdk/core';
import { Object3D } from 'three';
import type { AppContext, Events, Hand } from '../contracts';
import type { GestureEngine } from '../input/engine';

export const DevHandPose = createComponent('DevHandPose', {
  hand: { type: Types.Enum, enum: { Left: 'left', Right: 'right' }, default: 'right' },
  /** Off: the emulator is left alone. */
  enabled: { type: Types.Boolean, default: false },
  /** Any IWER pose id: default, open, fist, pinch, point, ... */
  poseId: { type: Types.String, default: 'default' },
  /** 0..1 blends the four long fingers of `poseId` toward `fist` (partial curl); below 0 leaves the pose alone. */
  curl: { type: Types.Float32, default: -1 },
  /** Pinch (select) value 0..1; IWER selects at 0.9 and lets go at 0.7. */
  pinch: { type: Types.Float32, default: 0 },
  /** false = tracking lost. */
  connected: { type: Types.Boolean, default: true },
  /** true: hold `anchor` of the hand at `position` (XR-origin metres). */
  place: { type: Types.Boolean, default: false },
  position: { type: Types.Vec3, default: [0, 1.05, -0.45] },
  anchor: { type: Types.String, default: 'wrist' },
}, 'Dev-only: drives an IWER emulated hand. Never ships.');

const LONG_FINGERS = ['index', 'middle', 'ring', 'pinky'] as const;

/** The parts of IWER's XRDevice this file touches (window.IWER_DEVICE, set by the IWSDK dev plugin). */
interface IwerHand {
  poseId: string;
  connected: boolean;
  setFingerPose(finger: string, poseId: string, weight?: number): void;
  updatePinchValue(value: number): void;
}
interface IwerDevice {
  primaryInputMode: 'controller' | 'hand';
  hands: Partial<Record<Hand, IwerHand>>;
  remote: { dispatch(method: string, params?: Record<string, unknown>): Promise<unknown> } | null;
}

type Fields = { enabled: boolean; poseId: string; curl: number; pinch: number; connected: boolean; place: boolean; position: number[]; anchor: string };

function initDevHandPose(world: World) {
  world.registerComponent(DevHandPose);
  for (const hand of ['left', 'right'] as const) {
    const object = new Object3D();
    object.name = `dev-hand-${hand}`;
    world.createTransformEntity(object, { persistent: true }).addComponent(DevHandPose, { hand });
  }

  const applied = new Map<number, string>();
  world.registerSystem(class DevHandPoseSystem extends createSystem({ hands: { required: [DevHandPose] } }) {
    update() {
      const device = (window as unknown as { IWER_DEVICE?: IwerDevice }).IWER_DEVICE;
      if (!device) return;
      for (const entity of this.queries.hands.entities) {
        const get = <K extends keyof Fields>(k: K) => entity.getValue(DevHandPose, k as never) as unknown as Fields[K];
        if (!get('enabled')) { applied.delete(entity.index); continue; }
        const fields: Fields = {
          enabled: true, poseId: get('poseId'), curl: get('curl'), pinch: get('pinch'), connected: get('connected'),
          place: get('place'), position: [...entity.getVectorView(DevHandPose, 'position')], anchor: get('anchor'),
        };
        const key = JSON.stringify(fields);
        const before = applied.get(entity.index);
        if (key === before) continue;
        applied.set(entity.index, key);
        const prev: Partial<Fields> = before ? JSON.parse(before) : {};
        const side = entity.getValue(DevHandPose, 'hand') as Hand;

        if (device.primaryInputMode !== 'hand') device.primaryInputMode = 'hand';
        const hand = device.hands[side];
        if (!hand) continue;
        if (fields.connected !== prev.connected) hand.connected = fields.connected;
        if (fields.poseId !== prev.poseId || fields.curl !== prev.curl) {
          try {
            hand.poseId = fields.poseId; // clears earlier finger blends
            if (fields.curl >= 0) for (const f of LONG_FINGERS) hand.setFingerPose(f, 'fist', Math.min(1, fields.curl));
          } catch (e) {
            console.warn('[DevHandPose]', e);
          }
        }
        if (fields.pinch !== prev.pinch) hand.updatePinchValue(Math.max(0, Math.min(1, fields.pinch)));
        const moved = fields.place !== prev.place || fields.anchor !== prev.anchor
          || JSON.stringify(fields.position) !== JSON.stringify(prev.position) || (fields.connected && !prev.connected);
        if (fields.place && fields.connected && moved) {
          const [x, y, z] = fields.position;
          device.remote?.dispatch('set_transform', {
            device: `hand-${side}`, position: { x, y, z }, anchor: fields.anchor, orientation: 'auto',
          }).catch((e) => console.warn('[DevHandPose] place', e));
        }
      }
    }
  });
}

/** Logs every gesture event (not the per-frame pose and near streams) and keeps them for scripted checks. */
function initEventLog(ctx: AppContext, gestures: GestureEngine) {
  const log: { t: number; k: string; e: unknown }[] = [];
  let lastMute = '';
  const keep = <K extends keyof Events>(k: K, e: Events[K]) => {
    log.push({ t: performance.now(), k, e });
    if (log.length > 500) log.shift();
    console.log(`[input] ${k} ${JSON.stringify(e)}`);
  };
  ctx.bus.on('gaze:summon', (e) => keep('gaze:summon', e));
  ctx.bus.on('stem:solo', (e) => keep('stem:solo', e));
  ctx.bus.on('stem:mute', (e) => {
    // The held stream repeats every frame; log state changes only.
    const sig = `${e.stem}:${e.state}`;
    if (sig !== lastMute) keep('stem:mute', e);
    lastMute = sig;
  });
  for (const k of ['stem:eq', 'cut:preview', 'cut:add', 'cut:remove', 'app:reset', 'transport:state'] as const) {
    ctx.bus.on(k, (e) => keep(k, e as never));
  }
  // The progress stream runs at 30 Hz; log where it starts, cancels and completes.
  ctx.bus.on('reset:progress', (e) => { if (e.progress === 0 || e.progress === 1) keep('reset:progress', e); });
  const hands: Partial<Record<Hand, Events['hand:pose']>> = {};
  const poseSig: Partial<Record<Hand, string>> = {};
  ctx.bus.on('hand:pose', (e) => {
    hands[e.hand] = e;
    // Logged when tracking, pinching or the curl band (open <= 0.45 < between < 0.75 <= fist) changes.
    const band = e.curl >= 0.75 ? 'fist' : e.curl <= 0.45 ? 'open' : 'between';
    const sig = `${e.tracked}:${e.pinching}:${band}`;
    if (sig === poseSig[e.hand]) return;
    poseSig[e.hand] = sig;
    const r = (v: number[]) => v.map((x) => +x.toFixed(3));
    console.log(`[input] hand:pose ${JSON.stringify({ ...e, curl: +e.curl.toFixed(3), palm: r(e.palm), tip: r(e.tip), band })}`);
  });
  Object.assign(window, { __stemlightInput: { log, hands, debug: () => gestures.debug() } });
  return () => {
    // Pad strikes go straight to the audio parts, not the bus: log them from the engine's counter.
    const { strikes, lastStrike } = gestures.debug();
    if (strikes !== seenStrikes) console.log(`[input] pad:strike ${JSON.stringify({ count: strikes, ...lastStrike })}`);
    seenStrikes = strikes;
  };
}
let seenStrikes = 0;

export function initDevInput(world: World, ctx: AppContext, gestures: GestureEngine): void {
  initDevHandPose(world);
  const pollStrikes = initEventLog(ctx, gestures);
  world.registerSystem(class DevInputLogSystem extends createSystem() {
    update() { pollStrikes(); }
  });
}
