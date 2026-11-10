// Piece loader (biyon-17): announces piece:load, decodes the stems, then piece:ready once the piece's
// JSON is servable, so B's notes layer can fetch notes.json and beats.json from the same folder.
import type { Beats, Bus, PieceId, PieceManifest } from '../contracts';
import type { Engine } from './engine.ts';

export async function loadPiece(engine: Engine, bus: Bus, id: PieceId, root = '/pieces'): Promise<PieceManifest> {
  const base = `${root}/${id}`;
  bus.emit('piece:load', { id });
  const get = async <T>(name: string): Promise<T> => {
    const r = await fetch(`${base}/${name}`);
    if (!r.ok) throw new Error(`piece ${id}: ${name} → ${r.status}`);
    return r.json() as Promise<T>;
  };
  const [manifest, beats] = await Promise.all([get<PieceManifest>('manifest.json'), get<Beats>('beats.json')]);
  const { decodedMB } = await engine.load(id, manifest, beats, base);
  console.info(`[audio] ${id}: ${manifest.stems.length} stems, ${decodedMB.toFixed(1)} MB decoded`);
  bus.emit('piece:ready', { id, manifest });
  return manifest;
}
