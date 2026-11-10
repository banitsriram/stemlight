import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FULL_CURL_DEG, JOINT_NAMES, fingerCurl, handCurl, readHand } from '../../src/input/handmath.ts';
// IWER's own hand library: the same skeletons the emulator renders, so the thresholds are checked against them.
import { oculusHandConfig } from 'iwer/lib/device/XRHandInput.js';

const jointsOf = (pose) => Object.fromEntries(JOINT_NAMES.map((j) => {
  const m = pose.jointTransforms[j].offsetMatrix;
  return [j, [m[12], m[13], m[14]]];
}));
const frameOf = (id) => readHand(jointsOf(oculusHandConfig.poses[id]));

test('IWER fist reads as a fist (3 of 4 fingers curl >= 0.75)', () => {
  const f = frameOf('fist');
  assert.equal(f.tracked, true);
  assert.equal(f.confidence, 1);
  assert.ok(handCurl(f.curls) >= 0.75, `fist curl ${handCurl(f.curls)}`);
  assert.ok(f.curls.every((c) => c >= 0.75));
});

test('IWER open, default and flat hands are open (curl <= 0.45)', () => {
  for (const id of ['open', 'default', 'flat', 'four']) {
    const f = frameOf(id);
    assert.ok(handCurl(f.curls) <= 0.45, `${id} curl ${handCurl(f.curls)}`);
  }
});

test('IWER pinch: tips within 1.5 cm, other fingers curl <= 0.6, not a fist', () => {
  const f = frameOf('pinch');
  assert.ok(f.pinchDist <= 0.015, `pinch ${f.pinchDist}`);
  assert.ok(Math.max(f.curls[1], f.curls[2], f.curls[3]) <= 0.6);
  assert.ok(handCurl(f.curls) < 0.75);
  assert.ok(frameOf('open').pinchDist >= 0.03);
});

/** One straight-then-bent finger along -Z, bending `deg` at each of MCP, PIP and DIP. */
function bentFinger(deg) {
  const joints = {};
  let p = [0, 0, 0], dir = 0;
  const step = (len) => { p = [p[0], p[1] - Math.sin(dir) * len, p[2] - Math.cos(dir) * len]; };
  ['metacarpal', 'phalanx-proximal', 'phalanx-intermediate', 'phalanx-distal', 'tip'].forEach((s, i) => {
    joints[`index-finger-${s}`] = p;
    if (i >= 1) dir += (deg * Math.PI) / 180;
    step(0.03);
  });
  return joints;
}

test('partial curl is proportional to total bend', () => {
  assert.ok(Math.abs(fingerCurl(bentFinger(0), 'index')) < 1e-9);
  const half = fingerCurl(bentFinger(FULL_CURL_DEG / 6), 'index');
  assert.ok(Math.abs(half - 0.5) < 1e-6, `half ${half}`);
  assert.equal(fingerCurl(bentFinger(120), 'index'), 1);
});

test('3-of-4 rule: one straight finger still counts, two do not', () => {
  assert.equal(handCurl([0, 0.9, 0.8, 0.95]), 0.8);
  assert.equal(handCurl([0, 0, 0.9, 0.9]), 0);
});

test('missing joints read as untracked', () => {
  const joints = jointsOf(oculusHandConfig.poses.fist);
  delete joints['ring-finger-tip'];
  const f = readHand(joints);
  assert.equal(f.tracked, false);
  assert.ok(f.confidence < 1);
  assert.equal(readHand({}).tracked, false);
});
