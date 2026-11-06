import { Component, OnDestroy, effect, inject, output, signal, untracked } from '@angular/core';
import { DatePipe } from '@angular/common';
import { DesignStore, SavedDesign, DesignListing } from './design-store';

@Component({
  selector: 'app-design-gallery',
  imports: [DatePipe],
  templateUrl: './design-gallery.html',
  styleUrl: './design-gallery.css',
})
export class DesignGallery implements OnDestroy {
  readonly store = inject(DesignStore);
  readonly openDesign = output<SavedDesign>();
  readonly designs = signal<(DesignListing & { previewUrl: string; photoUrl: string })[]>([]);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  readonly selected = signal<string[]>([]);
  readonly pendingDelete = signal<string[]>([]);
  private destroyed = false;
  private revision = 0;
  constructor() { effect(() => { this.store.scope(); untracked(() => { this.revision++; this.releaseUrls(); this.designs.set([]); this.selected.set([]); this.pendingDelete.set([]); this.message.set(''); void this.refresh(); }); }); }
  async refresh(): Promise<void> {
    const revision = ++this.revision;
    this.busy.set(true);
    this.error.set('');
    try {
      const designs = await this.store.list();
      if (this.destroyed || revision !== this.revision) return;
      this.releaseUrls();
      this.designs.set(designs.map(design => ({ ...design, previewUrl: design.previewUrl || URL.createObjectURL(design.preview!), photoUrl: design.photoUrl || URL.createObjectURL(design.photo!) })));
      this.selected.update(ids => ids.filter(id => designs.some(design => design.id === id)));
    } catch (error: any) { if (revision === this.revision) this.error.set(error?.message || 'Saved designs could not be loaded. Please retry.'); }
    finally { if (revision === this.revision) this.busy.set(false); }
  }
  toggle(id: string): void {
    this.pendingDelete.set([]);
    this.selected.update(ids => ids.includes(id) ? ids.filter(item => item !== id) : [...ids, id]);
  }
  selectAll(): void {
    this.pendingDelete.set([]);
    this.selected.set(this.selected().length === this.designs().length ? [] : this.designs().map(design => design.id));
  }
  requestDelete(ids: string[]): void { this.pendingDelete.set([...ids]); this.message.set(''); }
  async confirmDelete(): Promise<void> {
    const ids = this.pendingDelete();
    if (!ids.length || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.store.delete(ids);
      this.pendingDelete.set([]);
      await this.refresh();
      this.message.set(`${ids.length} saved design${ids.length === 1 ? '' : 's'} deleted.`);
    } catch (error: any) { this.error.set('The designs could not be deleted. ' + (error?.message || 'Please try again.')); }
    finally { this.busy.set(false); }
  }
  allIds(): string[] { return this.designs().map(design => design.id); }
  async open(id: string): Promise<void> {
    this.busy.set(true); this.error.set('');
    const revision = this.revision;
    try { const design = await this.store.get(id); if (revision === this.revision) this.openDesign.emit(design); }
    catch (error: any) { this.error.set(error?.message || 'The design could not be opened.'); }
    finally { this.busy.set(false); }
  }
  async importLocal(): Promise<void> {
    this.busy.set(true); this.error.set(''); this.message.set('');
    try { const count = await this.store.importLocal(); await this.refresh(); this.message.set(`${count} browser saves are now available in this account. Browser copies are kept; retrying does not create duplicates.`); }
    catch (error: any) { await this.refresh(); this.error.set((error?.message || 'Import could not finish.') + ' Your browser copies are unchanged. You can retry safely.'); }
    finally { this.busy.set(false); }
  }
  private releaseUrls(): void {
    for (const design of this.designs()) { if (design.previewUrl.startsWith('blob:')) URL.revokeObjectURL(design.previewUrl); if (design.photoUrl.startsWith('blob:')) URL.revokeObjectURL(design.photoUrl); }
  }
  ngOnDestroy(): void { this.destroyed = true; this.releaseUrls(); }
}
