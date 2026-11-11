export type PieceId = 'beethoven5' | 'dvorak9' | 'trepak';
export type StemId = 'vln'|'vla_vc'|'cb'|'fl'|'reeds'|'hn'|'brass'|'perc'|'harp';
export type Glyph = 'whole'|'half'|'dotted_half'|'quarter'|'dotted_quarter'|'eighth'|'sixteenth'|'beamed_eighths'|'beamed_sixteenths';
export type Hand = 'left'|'right';
export type MuteState = 'on'|'held'|'locked';
export type Vec3 = [number, number, number];
export type Instrument = 'pads'|'harp'|'keys';
export type TutorialStep = 'summon'|'silence'|'return'|'lock'|'solo'|'ribbon'|'eq'|'cut'|'pads'|'free';

export interface NoteEvent { id: number; t: number; dur: number; pitch: number; vel: number; stem: StemId; glyph: Glyph; beat: number } // notes.json = NoteEvent[], sorted by t
export interface Beats { tempo: { t: number; bpm: number }[]; beats: number[]; downbeats: number[] } // beats.json, seconds
export interface Envelopes { rate: 30; stems: Partial<Record<StemId, number[]>> }                   // envelopes.json, 0..1
export interface PieceManifest {
  id: PieceId; title: string; composer: string; durationSec: number;
  stems: { id: StemId; file: string; homeSeat: Vec3; pitchRange: [number, number] }[];
  scale: { tonic: number; steps: number[] };              // harp and keyboard tuning
  replace: { stem: StemId; instrument: Instrument }[];
  credits: { text: string; licence: string; url: string }[];
}
export interface Cut { id: string; stem: StemId; t0: number; t1: number }  // beat-snapped seconds
export interface UserHit { tOffset: number; pitch: number; vel: number }
export interface UserPart { cutId: string; instrument: Instrument; hits: UserHit[] }
export interface MixState { mute: Record<StemId, MuteState>; solo: StemId|null; eq: Record<StemId, { low: number; mid: number; high: number }>; cuts: Cut[]; parts: UserPart[] }
export interface SaveState { version: 1; tutorialDone: boolean; perPiece: Partial<Record<PieceId, MixState>>; palette: 'default'|'cb' }

export type TargetKind = 'creature'|'playhead'|'lane'|'region'|'pad'|'string'|'key'|'reset';
export interface Target { id: string; kind: TargetKind; stem?: StemId; center: Vec3; radius: number; extra?: Record<string, number> } // B registers, A reads
// Target.extra keys the gestures read (biyon-16 convention): dx, dy, dz = unit direction of increasing time (playhead, lane)
// or the pad's face normal; secPerM = seconds per metre along that direction; tCenter = piece time at a lane's center;
// halfLength = capsule half-length along (dx, dy, dz) for long lanes and regions; pitch = a pad's MIDI note.
// Ids: 'creature:<stem>', 'region:<cutId>'.
export interface TargetRegistry { set(t: Target): void; remove(id: string): void; all(): Target[] }

export interface Transport { time(): number; playing(): boolean; play(): void; pause(): void; seek(t: number): void; duration(): number } // A implements
export interface AudioApi { unlock(): Promise<void>; context(): AudioContext; sfxOut(pos: Vec3): AudioNode } // B plays sound effects through sfxOut
export interface SaveApi { load(): SaveState; patch(p: Partial<SaveState>): void }

export interface Events {
  'piece:load': { id: PieceId }; 'piece:ready': { id: PieceId; manifest: PieceManifest }; 'piece:end': { id: PieceId };
  'transport:state': { playing: boolean; t: number }; 'transport:seek': { t: number };
  'beat': { index: number; t: number; downbeat: boolean };
  'hand:pose': { hand: Hand; tracked: boolean; confidence: number; palm: Vec3; tip: Vec3; curl: number; pinching: boolean };
  'hand:near': { hand: Hand; targetId: string; dist: number };
  'hand:pinch': { hand: Hand; down: boolean; targetId: string | null };   // agreed 11 Nov (biyon-16); targetId = what the pinch grabbed
  'gaze:summon': { stem: StemId };
  'stem:mute': { stem: StemId; state: MuteState; lockProgress: number };   // lockProgress 0..1 while held
  'stem:solo': { stem: StemId|null };
  'stem:eq': { stem: StemId; low: number; mid: number; high: number };     // dB
  'cut:preview': { stem: StemId; t0: number; t1: number } | null;
  'cut:add': { cut: Cut }; 'cut:remove': { id: string };
  'countin': { cutId: string; beatsLeft: number };
  'part:hit': { cutId: string; instrument: Instrument; pitch: number; vel: number; t: number; from: Vec3 };
  'reset:progress': { progress: number }; 'app:reset': { piece: PieceId };
  'app:pause': {}; 'app:resume': {};
  'tutorial:step': { step: TutorialStep };                                 // B emits; A may gate gestures
}
export interface Bus { on<K extends keyof Events>(k: K, f: (e: Events[K]) => void): () => void; emit<K extends keyof Events>(k: K, e: Events[K]): void }
export interface AppContext { bus: Bus; transport: Transport; registry: TargetRegistry; audio: AudioApi; save: SaveApi } // built in main.ts, passed to each module's init(ctx)
