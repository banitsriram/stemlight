// Thin IWSDK layer: reads the WebXR hand joints and head pose each frame and feeds the pure gesture engine.
import { createSystem, type World } from '@iwsdk/core';
import { Quaternion, Vector3 } from 'three';
import type { AppContext, Hand, Vec3 } from '../contracts';
import { SPEC, createGestureEngine, type GestureEngine } from './engine.ts';
import { JOINT_NAMES, readHand } from './handmath.ts';
import type { HeadFrame, InputFrame, JointMap } from './types';

/** Starts hand-gesture input: every recognised gesture goes out on ctx.bus. */
export function initInput(ctx: AppContext, world: World): GestureEngine {
  const engine = createGestureEngine(ctx.bus);
  const v = new Vector3(), ahead = new Vector3(), rot = new Quaternion();
  let wasInXR = false;
  // Gesture time runs on the ECS delta, so a paused-and-stepped world (ecs pause / step) steps it exactly.
  let clock = 0;

  // Reference-space positions are relative to the XR origin; the player rig places that origin in the world.
  const toWorld = (p: DOMPointReadOnly): Vec3 => {
    v.set(p.x, p.y, p.z).applyMatrix4(world.player.matrixWorld);
    return [v.x, v.y, v.z];
  };

  function readHead(frame: XRFrame, ref: XRReferenceSpace): HeadFrame | null {
    const viewer = frame.getViewerPose(ref);
    if (!viewer) return null;
    const { position: p, orientation: q } = viewer.transform;
    const pos = toWorld(p);
    // A point 1 m ahead of the viewer (-Z), carried into world space the same way, gives the gaze direction.
    ahead.set(0, 0, -1).applyQuaternion(rot.set(q.x, q.y, q.z, q.w)).add(v.set(p.x, p.y, p.z));
    ahead.applyMatrix4(world.player.matrixWorld).sub(v.set(...pos)).normalize();
    return { pos, dir: [ahead.x, ahead.y, ahead.z] };
  }

  world.registerSystem(class InputSystem extends createSystem() {
    update(delta: number) {
      clock += delta;
      const time = clock;
      const frame = world.xrFrame, ref = world.xrReferenceSpace, session = world.session;
      if (!frame || !ref || !session) {
        // Leaving XR: two empty frames past the gap hold, so held gestures end through the quiet-release path.
        if (wasInXR) {
          engine.step({ t: time, hands: {}, head: null }, ctx.registry.all());
          clock += SPEC.gapHold + 0.1;
          engine.step({ t: clock, hands: {}, head: null }, ctx.registry.all());
        }
        wasInXR = false;
        return;
      }
      wasInXR = true;
      world.player.updateMatrixWorld();
      const hands: InputFrame['hands'] = {};
      for (const source of session.inputSources) {
        const side = source.handedness as Hand;
        if (!source.hand || (side !== 'left' && side !== 'right') || !frame.getJointPose) continue;
        const joints: JointMap = {};
        for (const name of JOINT_NAMES) {
          const space = source.hand.get(name as XRHandJoint);
          const pose = space && frame.getJointPose(space, ref);
          if (pose) joints[name] = toWorld(pose.transform.position);
        }
        hands[side] = readHand(joints);
      }
      engine.step({ t: time, hands, head: readHead(frame, ref) }, ctx.registry.all());
    }
  });
  return engine;
}
