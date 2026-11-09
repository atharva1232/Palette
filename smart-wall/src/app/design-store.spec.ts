import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { vi } from 'vitest';
import { Auth, Account } from './auth';
import { DesignStore, SavedDesign } from './design-store';
import { LocalDesignStore } from './local-design-store';

describe('Private account design storage', () => {
  const account: Account = { id: 'account-one', name: 'Alice', email: 'alice@example.test' };
  const auth = { ready: signal(true), user: signal<Account | null>(account), expired: vi.fn() };
  const local = { list: vi.fn(async (): Promise<SavedDesign[]> => []), save: vi.fn(), delete: vi.fn(), get: vi.fn() };
  const response = (value: unknown, status = 200) => ({ ok: status < 400, status, json: async () => value });
  beforeEach(() => {
    auth.user.set(account); auth.expired.mockReset();
    local.list.mockReset().mockResolvedValue([]); local.save.mockReset(); local.delete.mockReset();
    TestBed.configureTestingModule({ providers: [{ provide: Auth, useValue: auth }, { provide: LocalDesignStore, useValue: local }] });
  });
  afterEach(() => vi.unstubAllGlobals());
  it('lists only lightweight account metadata and leaves photos on private URLs', async () => {
    const fetch = vi.fn(async (_path: string, _options?: unknown) => response([{ id: 'one', name: 'Room', previewUrl: '/api/designs/one/preview', photoUrl: '/api/designs/one/photo' }]));
    vi.stubGlobal('fetch', fetch);
    const designs = await TestBed.inject(DesignStore).list();
    expect(designs[0].previewUrl).toBe('/api/designs/one/preview');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe('/api/designs');
  });
  it('uses browser storage for guests and never uploads their photos', async () => {
    auth.user.set(null);
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    await TestBed.inject(DesignStore).list();
    expect(local.list).toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
  it('saves and reopens editable masks and colours for additional walls', async () => {
    let saved: Record<string, unknown> = {};
    vi.stubGlobal('fetch', vi.fn(async (_url: string, options: RequestInit) => {
      if (options.method === 'POST') saved = JSON.parse(options.body as string);
      return response({ ...saved, photoType: 'image/png' });
    }));
    const wall = {
      color: '#713343', strength: 90, tolerance: 32, seeds: [], polygons: [],
      boundary: Uint8Array.of(0, 255), safety: Uint8Array.of(0, 255), protectedAreas: Uint8Array.of(0, 32),
    };
    const photo = new Blob(['test photo'], { type: 'image/png' });
    const design: SavedDesign = {
      ...wall, id: 'design', name: 'Two walls', savedAt: 1, fileName: 'room.png', photo, preview: photo,
      walls: { active: 1, others: [{ ...wall, color: '#a3b9aa' }] },
    };
    const store = TestBed.inject(DesignStore);
    await store.save(design);
    const reopened = await store.get(design.id);
    expect(reopened.walls).toEqual(design.walls);
    expect(reopened.boundary).toEqual(design.boundary);
  });
  it('rejects an old account response after the session changes', async () => {
    let finish!: (value: unknown) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise(resolve => { finish = resolve; })));
    const pending = TestBed.inject(DesignStore).list();
    await Promise.resolve(); await Promise.resolve();
    auth.user.set({ ...account, id: 'account-two' });
    finish(response([{ id: 'private-old-room' }]));
    await expect(pending).rejects.toThrow('account changed');
  });
  it('expires the session instead of displaying an empty account gallery on 401', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response({ error: 'Login required' }, 401)));
    await expect(TestBed.inject(DesignStore).list()).rejects.toThrow('session expired');
    expect(auth.expired).toHaveBeenCalledOnce();
  });
  it('keeps legacy saves intact if import fails', async () => {
    const store = TestBed.inject(DesignStore);
    local.list.mockResolvedValue([{ id: 'one' }, { id: 'two' }] as SavedDesign[]);
    const save = vi.spyOn(store, 'save').mockResolvedValueOnce().mockRejectedValueOnce(new Error('quota'));
    await expect(store.importLocal()).rejects.toThrow('quota');
    expect(save).toHaveBeenCalledTimes(2);
    expect(local.delete).not.toHaveBeenCalled();
  });
});
