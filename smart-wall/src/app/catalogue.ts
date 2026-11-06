import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { shades, starterPatterns, WallPattern } from './catalog';
export interface Colour { id: string; name: string; hex: string; family: string; brand: string; finishes: string[]; }
@Injectable({ providedIn: 'root' })
export class Catalogue {
  private http = inject(HttpClient);
  readonly colours = signal<Colour[]>(shades.map((s,i) => ({ ...s, id: 'shade-'+(i+1), brand: 'SmartWall concept palette', finishes: ['Matte','Satin','Gloss'] })));
  readonly patterns = signal<WallPattern[]>(starterPatterns);
  readonly publishedPatterns = signal<WallPattern[]>([]);
  readonly requestedPattern = signal<WallPattern|null>(null);
  readonly favourites = signal<string[]>([]);
  readonly error = signal('');
  constructor() { this.refresh(); }
  refresh(): void { this.http.get<{ colours: Colour[]; patterns: WallPattern[]; publishedPatterns?: WallPattern[] }>('/api/catalog').subscribe({ next: c => { this.error.set(''); this.colours.set(c.colours); this.patterns.set(c.patterns); this.publishedPatterns.set(c.publishedPatterns || []); }, error: () => this.error.set('Showing the starter catalogue. Server catalogue is unavailable.') }); }
  loadFavourites(): void { this.http.get<string[]>('/api/account/favourites').subscribe({ next: f => this.favourites.set(f), error: () => this.favourites.set([]) }); }
  toggle(kind: 'colour'|'pattern', id: string): void {
    const key = kind+':'+id, selected = !this.favourites().includes(key);
    this.http.post('/api/account/favourites', { kind,id,selected }).subscribe({ next: () => this.favourites.update(f => selected ? [...f,key] : f.filter(x=>x!==key)), error: () => this.error.set('Log in to save favourites. Please retry if your session expired.') });
  }
}
