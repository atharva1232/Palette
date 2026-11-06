import { Injectable } from '@angular/core';
import type { SavedDesign } from './design-store';

/** Guest saves and legacy browser projects. */
@Injectable({ providedIn: 'root' })
export class LocalDesignStore {
  private async database(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') { reject(new Error('Local storage unavailable')); return; }
      const request = indexedDB.open('smartwall-designs', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('designs', { keyPath: 'id' });
      request.onsuccess = () => {
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Local storage is busy'));
    });
  }
  private async transaction<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.database();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('designs', mode);
      const request = operation(transaction.objectStore('designs'));
      transaction.oncomplete = () => { db.close(); resolve(request.result); };
      transaction.onabort = () => { db.close(); reject(transaction.error || request.error); };
      transaction.onerror = () => { /* onabort reports the final failure. */ };
    });
  }
  async list(): Promise<SavedDesign[]> {
    return (await this.transaction('readonly', store => store.getAll() as IDBRequest<SavedDesign[]>))
      .sort((a, b) => b.savedAt - a.savedAt);
  }
  async get(id: string): Promise<SavedDesign> {
    const design = await this.transaction('readonly', store => store.get(id) as IDBRequest<SavedDesign | undefined>);
    if (!design) throw new Error('Design not found.');
    return design;
  }
  async save(design: SavedDesign): Promise<void> { await this.transaction('readwrite', store => store.put(design)); }
  async delete(ids: string[]): Promise<void> {
    if (!ids.length) return;
    await this.transaction('readwrite', store => {
      for (const id of ids.slice(0, -1)) store.delete(id);
      return store.delete(ids[ids.length - 1]);
    });
  }
}
