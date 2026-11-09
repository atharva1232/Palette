import { Injectable, computed, inject, signal } from '@angular/core';
import { PaintStyle } from './paint-style';
import { Point } from './paint-engine';
import { Auth } from './auth';
import { LocalDesignStore } from './local-design-store';

export interface WallDesign {
  color: string;
  strength: number;
  appearance?: PaintStyle;
  tolerance: number;
  boundary: Uint8Array | null;
  safety: Uint8Array | null;
  protectedAreas: Uint8Array;
  seeds: Point[];
  polygons: Point[][];
}

export interface SavedDesign extends WallDesign {
  id: string;
  name: string;
  savedAt: number;
  fileName: string;
  photo: Blob;
  preview: Blob;
  walls?: { active: number; others: WallDesign[] };
}

export type DesignListing = Pick<SavedDesign, 'id' | 'name' | 'savedAt' | 'fileName' | 'color'> & { photo?: Blob; preview?: Blob; photoUrl?: string; previewUrl?: string };
function base64(bytes: Uint8Array): string {
  let result = '';
  for (let i = 0; i < bytes.length; i += 32768) result += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(result);
}
function bytes(value: string): Uint8Array<ArrayBuffer> { return Uint8Array.from(atob(value), character => character.charCodeAt(0)); }

type EncodedWall = Omit<WallDesign, 'boundary' | 'safety' | 'protectedAreas'> & {
  boundary: string | null;
  safety: string | null;
  protectedAreas: string;
};

async function compressMask(mask: Uint8Array): Promise<string> {
  const stream = new Response(Uint8Array.from(mask)).body!.pipeThrough(new CompressionStream('deflate'));
  return base64(new Uint8Array(await new Response(stream).arrayBuffer()));
}

async function decompressMask(mask: string): Promise<Uint8Array> {
  const stream = new Response(bytes(mask)).body!.pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function encodeWall(wall: WallDesign): Promise<EncodedWall> {
  const [boundary, safety, protectedAreas] = await Promise.all([
    wall.boundary && compressMask(wall.boundary), wall.safety && compressMask(wall.safety), compressMask(wall.protectedAreas),
  ]);
  return { ...wall, boundary, safety, protectedAreas };
}

async function decodeWall(wall: EncodedWall): Promise<WallDesign> {
  const [boundary, safety, protectedAreas] = await Promise.all([
    wall.boundary === null ? null : decompressMask(wall.boundary),
    wall.safety === null ? null : decompressMask(wall.safety),
    decompressMask(wall.protectedAreas),
  ]);
  return { ...wall, boundary, safety, protectedAreas };
}

@Injectable({ providedIn: 'root' })
export class DesignStore {
  private readonly auth = inject(Auth);
  private readonly local = inject(LocalDesignStore);
  readonly scope = computed(() => !this.auth.ready() ? 'loading' : this.auth.user()?.id || 'local');
  readonly accountName = computed(() => this.auth.user()?.name || '');
  readonly localCount = signal(0);
  private assertScope(scope: string): void { if (this.scope() !== scope) throw new Error('The account changed. Please try again.'); }
  private async request(path: string, method = 'GET', value?: unknown): Promise<any> {
    const scope = this.scope();
    const response = await fetch(path, { method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-SmartWall-Request': '1' }, ...(value === undefined ? {} : { body: JSON.stringify(value) }) });
    this.assertScope(scope);
    if (response.status === 401) { this.auth.expired(); throw new Error('Your session expired. Log in again to access your designs.'); }
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'The server could not complete this request.');
    return result;
  }
  async list(): Promise<DesignListing[]> {
    const scope = this.scope();
    if (scope === 'loading') return [];
    if (scope === 'local') return this.local.list();
    try { this.localCount.set((await this.local.list()).length); } catch { this.localCount.set(0); }
    this.assertScope(scope);
    return this.request('/api/designs');
  }
  async get(id: string): Promise<SavedDesign> {
    if (this.scope() === 'local') return this.local.get(id);
    const scope = this.scope();
    const design = await this.request(`/api/designs/${encodeURIComponent(id)}`);
    const walls = design.walls && { active: design.walls.active, others: await Promise.all(design.walls.others.map(decodeWall)) };
    this.assertScope(scope);
    return { ...design, walls, photo: new Blob([bytes(design.photo)], { type: design.photoType }), preview: new Blob([bytes(design.preview)], { type: 'image/png' }), boundary: design.boundary === null ? null : bytes(design.boundary), safety: design.safety === null ? null : bytes(design.safety), protectedAreas: bytes(design.protectedAreas) };
  }
  async save(design: SavedDesign): Promise<void> {
    const scope = this.scope();
    if (scope === 'loading') throw new Error('Please wait for your session to load.');
    if (scope === 'local') { await this.local.save(design); return; }
    const [photo, preview, others] = await Promise.all([
      design.photo.arrayBuffer(), design.preview.arrayBuffer(), design.walls && Promise.all(design.walls.others.map(encodeWall)),
    ]);
    this.assertScope(scope);
    await this.request('/api/designs', 'POST', { ...design, walls: design.walls && { active: design.walls.active, others }, photo: base64(new Uint8Array(photo)), preview: base64(new Uint8Array(preview)), boundary: design.boundary ? base64(design.boundary) : null, safety: design.safety ? base64(design.safety) : null, protectedAreas: base64(design.protectedAreas) });
  }
  async delete(ids: string[]): Promise<void> {
    if (this.scope() === 'local') return this.local.delete(ids);
    await this.request('/api/designs/delete', 'POST', { ids });
  }
  async importLocal(): Promise<number> {
    const scope = this.scope();
    if (scope === 'local' || scope === 'loading') throw new Error('Log in to import browser saves.');
    const designs = await this.local.list();
    for (const design of designs) { this.assertScope(scope); await this.save(design); }
    return designs.length;
  }
}


