import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { DesignGallery } from './design-gallery';
import { DesignStore, SavedDesign } from './design-store';

describe('Saved wall designs', () => {
  const design = (id: string): SavedDesign => ({ id, name: `Room ${id}`, savedAt: 1, fileName: 'room.png', photo: new Blob(), preview: new Blob(), color: '#713343', strength: 90, tolerance: 32, boundary: null, safety: null, protectedAreas: new Uint8Array(), seeds: [], polygons: [] });
  const setup = async () => {
    let records = [design('one'), design('two'), design('three')];
    const store = {
      scope: signal('local'), accountName: signal(''), localCount: signal(0),
      list: vi.fn(async () => records),
      delete: vi.fn(async (ids: string[]) => { records = records.filter(item => !ids.includes(item.id)); }),
    };
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:test'), revokeObjectURL: vi.fn() });
    await TestBed.configureTestingModule({ imports: [DesignGallery], providers: [{ provide: DesignStore, useValue: store }] }).compileComponents();
    const fixture = TestBed.createComponent(DesignGallery);
    await fixture.whenStable();
    return { fixture, gallery: fixture.componentInstance, store };
  };
  afterEach(() => vi.unstubAllGlobals());
  it('deletes only selected designs after confirmation and preserves unselected photos', async () => {
    const { gallery, store } = await setup();
    gallery.toggle('one'); gallery.toggle('three');
    gallery.requestDelete(gallery.selected());
    expect(store.delete).not.toHaveBeenCalled();
    await gallery.confirmDelete();
    expect(store.delete).toHaveBeenCalledWith(['one', 'three']);
    expect(gallery.designs().map(item => item.id)).toEqual(['two']);
    expect(gallery.selected()).toEqual([]);
  });
  it('cancels deletion and supports clearing the whole collection', async () => {
    const { gallery, store } = await setup();
    gallery.requestDelete(gallery.allIds());
    gallery.pendingDelete.set([]);
    await gallery.confirmDelete();
    expect(store.delete).not.toHaveBeenCalled();
    gallery.requestDelete(gallery.allIds());
    await gallery.confirmDelete();
    expect(gallery.designs()).toEqual([]);
  });
  it('keeps designs and selection when a deletion fails', async () => {
    const { gallery, store } = await setup();
    store.delete.mockRejectedValueOnce(new Error('disk unavailable'));
    gallery.toggle('two'); gallery.requestDelete(gallery.selected());
    await gallery.confirmDelete();
    expect(gallery.designs()).toHaveLength(3);
    expect(gallery.selected()).toEqual(['two']);
    expect(gallery.pendingDelete()).toEqual(['two']);
    expect(gallery.error()).toContain('could not be deleted');
    expect(gallery.busy()).toBe(false);
  });
});
