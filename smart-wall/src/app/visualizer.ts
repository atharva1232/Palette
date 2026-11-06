import { Component, ChangeDetectorRef, ElementRef, OnDestroy, ViewChild, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { patternBackground, starterPatterns } from './catalog';
import { Catalogue } from './catalogue';
import { Activity } from './activity';
import { PaintStyle, styledPaint, textureBytes } from './paint-style';
import { Point, imagePoint, paintPixels, validatePhoto, selectWallRegion, constrainWallMask } from './paint-engine';
import { Auth } from './auth';
import { DesignGallery } from './design-gallery';
import { DesignStore, SavedDesign } from './design-store';

type ControlTab = 'colours' | 'patterns' | 'adjust' | 'save';
type Tool = 'outline' | 'smart' | 'brush' | 'erase';
interface SelectionState {
  boundary: Uint8Array | null;
  safety: Uint8Array | null;
  protectedAreas: Uint8Array;
  seeds: Point[];
  polygons: Point[][];
  tolerance: number;
}

@Component({
  selector: 'app-visualizer',
  imports: [FormsModule, DesignGallery],
  templateUrl: './visualizer.html',
  styleUrl: './visualizer.css',
})
export class Visualizer implements OnDestroy {
  @ViewChild('preview', { static: true }) preview!: ElementRef<HTMLCanvasElement>;
  @ViewChild('controls', { static: true }) controls!: ElementRef<HTMLElement>;
  @ViewChild(DesignGallery) gallery!: DesignGallery;
  private readonly designStore = inject(DesignStore);
  readonly auth = inject(Auth);
  private readonly changeDetector = inject(ChangeDetectorRef);
  originalPhotoUrl = signal('');
  controlTab: ControlTab = 'colours';
  readonly controlTabs: {id:ControlTab;label:string}[] = [{id:'colours',label:'Colours & dual tone'},{id:'patterns',label:'Patterns'},{id:'adjust',label:'Fine tune'},{id:'save',label:'Save & download'}];
  openControls(tab:ControlTab,scroll=false):void { this.controlTab=tab; if(tab==='patterns'){this.appearance.mode='pattern';this.updatePaint();} if(tab==='colours' && this.appearance.mode==='pattern'){this.appearance.mode='solid';this.updatePaint();} if(scroll)this.controls.nativeElement.scrollIntoView({behavior:'smooth',block:'start'}); }
  changeMode():void { this.controlTab=this.appearance.mode==='pattern'?'patterns':'colours'; this.updatePaint(); }
  private clearOriginalUrl():void { const url=this.originalPhotoUrl(); if(url)URL.revokeObjectURL(url); this.originalPhotoUrl.set(''); }
  private activeScope: string | null = null;
  constructor() {
    effect(() => {
      const pending = this.catalogue.requestedPattern();
      if (pending) untracked(() => { this.controlTab='patterns'; this.appearance.pattern = {...pending}; this.appearance.patternSource='built-in'; this.appearance.mode='pattern'; this.catalogue.requestedPattern.set(null); this.updatePaint(); this.changeDetector.markForCheck(); });
    });
    effect(() => {
      const scope = this.designStore.scope();
      if (this.activeScope !== null && this.activeScope !== scope) {
        this.loadVersion++; this.textureVersion++; this.appearance.texture=undefined; this.appearance.patternSource='built-in'; this.texturePreview.set(''); this.patternError.set(''); this.patternLoading.set(false);
        this.clearOriginalUrl(); this.source = null; this.uploadedPhoto = null;
        this.boundary = null; this.safety = null; this.seeds = []; this.polygons = []; this.history = []; this.points = [];
        this.painting = false; this.activePointer = null; this.canUndo.set(false); this.original = false;
        for (const canvas of [this.boundaryCanvas, this.protectionCanvas, this.outputCanvas]) { canvas.width = 1; canvas.height = 1; }
        this.hasImage.set(false); this.hasSelection.set(false); this.boundaryReady.set(false); this.wallDetected.set(false);
        this.loading.set(false); this.saveMessage.set(''); this.saveError.set('');
        this.preview?.nativeElement.getContext('2d')?.clearRect(0, 0, this.imageWidth(), this.imageHeight());
      }
      this.activeScope = scope;
    });
  }
  saving = signal(false);
  saveMessage = signal('');
  saveError = signal('');
  designName = '';
  readonly catalogue = inject(Catalogue);
  private activity = inject(Activity);
  get shades() { return this.catalogue.colours(); }
  appearance: PaintStyle = { mode: 'solid', secondary: '#f0e8db', split: 50, direction: 'horizontal', finish: 'Matte', pattern: { ...starterPatterns[0] } };
  get patterns() { return [...this.catalogue.patterns(), ...this.catalogue.publishedPatterns()]; }
  readonly patternBackground = patternBackground;
  texturePreview = signal('');
  patternError = signal('');
  patternLoading = signal(false);
  private textureVersion = 0;
  updatePaint(): void { this.original=false; this.render(); }
  choosePattern(id: string): void {
    const pattern=this.patterns.find(p=>p.id===id);
    if(pattern) { this.controlTab='patterns'; this.appearance.pattern={...pattern}; this.appearance.mode='pattern'; this.appearance.patternSource='built-in'; }
    this.updatePaint();
  }
  useOutlinedWall(): void {
    if(!this.boundary || this.loading()) return;
    this.remember(); this.safety=this.boundary.slice(); this.seeds=[]; this.wallDetected.set(true);
    this.tool='erase'; this.status.set('Your outlined wall is selected. Use Erase to protect objects inside it.'); this.updatePaint();
  }
  choosePatternFile(event: Event): void {
    const input=event.target as HTMLInputElement, file=input.files?.[0]; input.value='';
    if(file) void this.loadPattern(file);
  }
  async loadPattern(file: File): Promise<void> {
    this.patternError.set('');
    if(!['image/png','image/jpeg','image/webp'].includes(file.type) || !file.size || file.size>5*1024*1024) { this.patternError.set('Choose a JPG, PNG or WebP pattern image up to 5 MB.'); return; }
    const version=++this.textureVersion; this.patternLoading.set(true); let bitmap:ImageBitmap|null=null;
    try {
      bitmap=await createImageBitmap(file);
      if(version!==this.textureVersion) return;
      if(!bitmap.width || !bitmap.height || bitmap.width*bitmap.height>40000000) throw new Error();
      const ratio=Math.min(1,256/Math.max(bitmap.width,bitmap.height));
      const canvas=document.createElement('canvas'); canvas.width=Math.max(1,Math.round(bitmap.width*ratio)); canvas.height=Math.max(1,Math.round(bitmap.height*ratio));
      const context=canvas.getContext('2d')!; context.drawImage(bitmap,0,0,canvas.width,canvas.height);
      const rgba=context.getImageData(0,0,canvas.width,canvas.height).data;
      if(!rgba.some((value,index)=>index%4===3 && value>0)) { this.patternError.set('This pattern is completely transparent. Choose a visible pattern image.'); return; }
      let pixels=''; for(let i=0;i<rgba.length;i+=32768) pixels+=String.fromCharCode(...rgba.subarray(i,i+32768));
      this.appearance.texture={ name:file.name.slice(0,80),width:canvas.width,height:canvas.height,pixels:btoa(pixels),scale:160 };
      this.appearance.patternSource='upload'; this.appearance.mode='pattern'; this.texturePreview.set(canvas.toDataURL('image/png')); this.updatePaint();
    } catch { if(version===this.textureVersion) this.patternError.set('This pattern image could not be opened. Try another image.'); }
    finally { bitmap?.close(); if(version===this.textureVersion) this.patternLoading.set(false); }
  }
  private restoreTexturePreview(): void {
    const t=this.appearance.texture; this.texturePreview.set(''); if(!t) return;
    const canvas=document.createElement('canvas'); canvas.width=t.width; canvas.height=t.height;
    canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(textureBytes(t)),t.width,t.height),0,0);
    this.texturePreview.set(canvas.toDataURL('image/png'));
  }
  get families() { return ['All shades', ...new Set(this.shades.map(shade => shade.family))]; }
  hasImage = signal(false);
  loading = signal(false);
  error = signal('');
  status = signal('');
  hasSelection = signal(false);
  boundaryReady = signal(false);
  wallDetected = signal(false);
  canUndo = signal(false);
  fileName = signal('');
  imageWidth = signal(0);
  imageHeight = signal(0);
  points: Point[] = [];
  tool: Tool = 'outline';
  brushSize = 40;
  strength = 90;
  edgeTolerance = 32;
  showBoundary = true;
  color = '#713343';
  family = 'All shades';
  search = '';
  original = false;
  draggingFile = false;
  keyboardPoint: Point | null = null;
  private source: ImageData | null = null;
  private uploadedPhoto: Blob | null = null;
  private boundaryCanvas = document.createElement('canvas');
  private protectionCanvas = document.createElement('canvas');
  private outputCanvas = document.createElement('canvas');
  private boundary: Uint8Array | null = null;
  private safety: Uint8Array | null = null;
  private seeds: Point[] = [];
  private polygons: Point[][] = [];
  private appliedTolerance = 32;
  private history: SelectionState[] = [];
  private painting = false;
  private lastPoint: Point | null = null;
  private activePointer: number | null = null;
  private frame = 0;
  private loadVersion = 0;

  get selectedName(): string { return this.shades.find(shade => shade.hex.toLowerCase() === this.color.toLowerCase())?.name || 'Your custom colour'; }
  get filteredShades() {
    const query = this.search.trim().toLowerCase();
    return this.shades.filter(shade => (this.family === 'All shades' || shade.family === this.family)
      && `${shade.name} ${shade.hex}`.toLowerCase().includes(query));
  }

  chooseFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) void this.loadPhoto(file);
    input.value = '';
  }
  dropFile(event: DragEvent): void {
    event.preventDefault();
    this.draggingFile = false;
    const file = event.dataTransfer?.files[0];
    if (file) void this.loadPhoto(file);
  }
  async sample(): Promise<void> {
    if (this.loading()) return;
    this.error.set('');
    try {
      const response = await fetch('images/lounge.jpg');
      if (!response.ok) throw new Error();
      await this.loadPhoto(new File([await response.blob()], 'Sample living room.jpg', { type: 'image/jpeg' }));
      if (this.source && this.fileName() === 'Sample living room.jpg') {
        this.points = [{ x: 686, y: 185 }, { x: 1598, y: 8 }, { x: 1598, y: 790 }, { x: 1320, y: 850 }, { x: 1280, y: 665 }, { x: 890, y: 628 }, { x: 850, y: 650 }, { x: 795, y: 704 }, { x: 686, y: 700 }];
        this.finishWall();
        this.smartSelect({ x: 1280, y: 290 });
        this.status.set('Guided sample ready. The wall is selected inside a locked boundary; the picture frame is protected by its edges.');
      }
    } catch { this.error.set('The sample room could not be loaded. Please upload a photo instead.'); }
  }
  async loadPhoto(file: File): Promise<void> {
    const validation = validatePhoto(file);
    if (validation) { this.error.set(validation); return; }
    const version = ++this.loadVersion;
    this.loading.set(true);
    this.error.set('');
    let bitmap: ImageBitmap | null = null;
    try {
      bitmap = await createImageBitmap(file);
      if (version !== this.loadVersion) return;
      if (!bitmap.width || !bitmap.height) throw new Error();
      const ratio = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * ratio));
      const height = Math.max(1, Math.round(bitmap.height * ratio));
      // Prepare off-screen first so a bad replacement never destroys an existing edit.
      const fresh = document.createElement('canvas');
      fresh.width = width;
      fresh.height = height;
      const context = fresh.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error();
      context.drawImage(bitmap, 0, 0, width, height);
      const source = context.getImageData(0, 0, width, height);
      this.source = source;
      this.uploadedPhoto = file; this.clearOriginalUrl(); this.originalPhotoUrl.set(URL.createObjectURL(file));
      for (const canvas of [this.preview.nativeElement, this.boundaryCanvas, this.protectionCanvas, this.outputCanvas]) {
        canvas.width = width;
        canvas.height = height;
      }
      this.history = [];
      this.boundary = null;
      this.safety = null;
      this.seeds = [];
      this.polygons = [];
      this.edgeTolerance = this.appliedTolerance = 32;
      this.points = [];
      this.keyboardPoint = null;
      this.painting = false;
      this.activePointer = null;
      this.tool = 'outline';
      this.original = false;
      this.hasSelection.set(false);
      this.boundaryReady.set(false);
      this.wallDetected.set(false);
      this.canUndo.set(false);
      this.imageWidth.set(width);
      this.imageHeight.set(height);
      this.fileName.set(file.name);
      this.designName = file.name.replace(/\.[^.]+$/, '').slice(0, 80);
      this.saveMessage.set('');
      this.saveError.set('');
      this.hasImage.set(true);
      this.activity.record('upload');
      this.status.set('Photo ready. Outline only the wall and set its boundary. Then click bare wall with Smart select.');
      this.render();
    } catch {
      if (version === this.loadVersion) this.error.set('This photo could not be opened. Try a different JPG, PNG, or WebP image.');
    } finally {
      bitmap?.close();
      if (version === this.loadVersion) this.loading.set(false);
    }
  }
  selectTool(tool: Tool): void {
    if (this.loading()) return;
    this.tool = tool;
    this.original = false;
    this.points = [];
    this.keyboardPoint = null;
    this.status.set(tool === 'outline' ? 'Outline the wall only, keeping the ceiling, floor, and furniture outside the boundary.' : tool === 'smart' ? 'Click bare wall inside the boundary. Similar connected pixels are selected; strong edges help protect objects.' : tool === 'brush' ? 'Restore paint only inside the detected wall. The brush cannot cross the locked boundary or detected object edges.' : 'Erase paint from furniture, frames, or edges. Protected areas stay erased when you adjust tolerance.');
    this.render();
  }
  private point(event: PointerEvent): Point {
    return imagePoint(event.clientX, event.clientY, this.preview.nativeElement.getBoundingClientRect(), this.imageWidth(), this.imageHeight());
  }
  pointerDown(event: PointerEvent): void {
    if (!this.source || this.loading() || event.button !== 0 || this.activePointer !== null) return;
    event.preventDefault();
    this.preview.nativeElement.focus({ preventScroll: true });
    this.keyboardPoint = null;
    if (this.original) { this.original = false; this.status.set('Design view restored.'); }
    const point = this.point(event);
    if (this.tool === 'outline') {
      const first = this.points[0];
      const hitRadius = 12 * this.imageWidth() / this.preview.nativeElement.getBoundingClientRect().width;
      if (this.points.length >= 3 && Math.hypot(point.x - first.x, point.y - first.y) < hitRadius) { this.finishWall(); return; }
      this.addPoint(point);
    } else if (this.tool === 'smart') {
      this.smartSelect(point);
    } else {
      if (!this.safety) { this.status.set('Set the wall boundary and use Smart select before refining paint.'); return; }
      this.remember();
      this.painting = true;
      this.activePointer = event.pointerId;
      this.lastPoint = point;
      this.preview.nativeElement.setPointerCapture(event.pointerId);
      this.stroke(point, point);
    }
  }
  pointerMove(event: PointerEvent): void {
    if (!this.painting || event.pointerId !== this.activePointer || !this.lastPoint) return;
    const point = this.point(event);
    this.stroke(this.lastPoint, point);
    this.lastPoint = point;
  }
  pointerUp(event: PointerEvent): void {
    if (event.pointerId !== this.activePointer) return;
    this.painting = false;
    this.activePointer = null;
    this.lastPoint = null;
    if (this.preview.nativeElement.hasPointerCapture(event.pointerId)) this.preview.nativeElement.releasePointerCapture(event.pointerId);
    this.render();
  }
  private addPoint(point: Point): void {
    this.points = [...this.points, point];
    this.status.set(`${this.points.length} corner${this.points.length === 1 ? '' : 's'} marked. ${this.points.length >= 3 ? 'Choose Set wall boundary, then click the bare wall.' : 'Mark at least 3 corners.'}`);
    this.render();
  }
  private stroke(from: Point, to: Point): void {
    // Erasing adds protected pixels; brushing restores them only inside the safety mask.
    const context = this.protectionCanvas.getContext('2d')!;
    context.globalCompositeOperation = this.tool === 'erase' ? 'source-over' : 'destination-out';
    context.strokeStyle = '#fff';
    context.fillStyle = '#fff';
    context.lineWidth = this.brushSize;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
    context.beginPath();
    context.arc(to.x, to.y, this.brushSize / 2, 0, Math.PI * 2);
    context.fill();
    context.globalCompositeOperation = 'source-over';
    this.scheduleRender();
  }
  finishWall(): void {
    if (this.points.length < 3 || !this.source) return;
    this.remember();
    const context = this.boundaryCanvas.getContext('2d')!;
    context.fillStyle = '#fff';
    context.beginPath();
    this.points.forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y));
    context.closePath();
    context.fill();
    this.boundary = this.alpha(this.boundaryCanvas);
    this.polygons = [...this.polygons, this.points.map(point => ({ ...point }))];
    this.boundaryReady.set(true);
    this.points = [];
    this.tool = 'smart';
    this.original = false;
    if (this.seeds.length) this.rebuildSafety();
    this.status.set('Boundary locked. Now click a bare part of the wall with Smart select. Paint cannot go outside this boundary.');
    this.render();
  }
  private smartSelect(point: Point): void {
    if (!this.source || !this.boundary || !this.boundary[Math.floor(point.y) * this.imageWidth() + Math.floor(point.x)]) {
      this.status.set('Click inside the wall boundary. Use Outline boundary first if you have not set one.');
      return;
    }
    const region = selectWallRegion(this.source.data, this.imageWidth(), this.imageHeight(), this.boundary, point, this.edgeTolerance);
    if (!region.some(value => value > 0)) return;
    this.remember();
    // Repeated clicks inside the same selected region do not add duplicate seeds.
    if (!this.safety?.[Math.floor(point.y) * this.imageWidth() + Math.floor(point.x)]) this.seeds = [...this.seeds.slice(-11), point];
    this.rebuildSafety();
    this.tool = 'smart';
    this.original = false;
    this.status.set('Wall selected with edge protection. Lower tolerance if paint reaches an object; increase it gently to include shadows.');
    this.render();
  }
  private rebuildSafety(): void {
    if (!this.source || !this.boundary) return;
    const combined = new Uint8Array(this.boundary.length);
    for (const seed of this.seeds) {
      const region = selectWallRegion(this.source.data, this.imageWidth(), this.imageHeight(), this.boundary, seed, this.edgeTolerance);
      for (let p = 0; p < combined.length; p++) combined[p] = Math.max(combined[p], region[p]);
    }
    this.safety = combined;
    this.wallDetected.set(combined.some(value => value > 0));
    this.appliedTolerance = this.edgeTolerance;
  }
  updateTolerance(): void {
    if (!this.source || !this.seeds.length || this.edgeTolerance === this.appliedTolerance) return;
    this.remember();
    this.rebuildSafety();
    this.original = false;
    this.status.set('Edge tolerance updated. The wall boundary and erased areas remain protected.');
    this.render();
  }
  cancelOutline(): void { this.points = []; this.render(); this.status.set('Outline cancelled. Your completed selections are unchanged.'); }
  private alpha(canvas: HTMLCanvasElement): Uint8Array {
    const data = canvas.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, this.imageWidth(), this.imageHeight()).data;
    const alpha = new Uint8Array(data.length / 4);
    for (let p = 0; p < alpha.length; p++) alpha[p] = data[p * 4 + 3];
    return alpha;
  }
  private remember(): void {
    this.history.push({ boundary: this.boundary, safety: this.safety, protectedAreas: this.alpha(this.protectionCanvas), seeds: this.seeds.map(seed => ({ ...seed })), polygons: this.polygons.map(polygon => polygon.map(point => ({ ...point }))), tolerance: this.appliedTolerance });
    if (this.history.length > 10) this.history.shift();
    this.canUndo.set(true);
  }
  undo(): void {
    if (this.points.length) { this.points = this.points.slice(0, -1); this.render(); return; }
    const state = this.history.pop();
    if (!state) return;
    this.boundary = state.boundary;
    this.safety = state.safety;
    this.seeds = state.seeds;
    this.polygons = state.polygons;
    this.edgeTolerance = this.appliedTolerance = state.tolerance;
    this.restoreAlpha(this.boundaryCanvas, state.boundary || new Uint8Array(this.imageWidth() * this.imageHeight()));
    this.restoreAlpha(this.protectionCanvas, state.protectedAreas);
    this.boundaryReady.set(!!state.boundary);
    this.wallDetected.set(!!state.safety?.some(value => value > 0));
    this.tool = state.boundary ? 'smart' : 'outline';
    this.canUndo.set(this.history.length > 0);
    this.original = false;
    this.status.set('Last selection change undone.');
    this.render();
  }
  clearSelection(): void {
    if (!this.source) return;
    this.remember();
    this.boundaryCanvas.getContext('2d')!.clearRect(0, 0, this.imageWidth(), this.imageHeight());
    this.protectionCanvas.getContext('2d')!.clearRect(0, 0, this.imageWidth(), this.imageHeight());
    this.boundary = null;
    this.safety = null;
    this.seeds = [];
    this.polygons = [];
    this.boundaryReady.set(false);
    this.wallDetected.set(false);
    this.tool = 'outline';
    this.points = [];
    this.original = false;
    this.status.set('Walls reset. Outline a wall boundary to start again.');
    this.render();
  }
  private restoreAlpha(canvas: HTMLCanvasElement, mask: Uint8Array): void {
    const context = canvas.getContext('2d')!;
    const image = context.createImageData(this.imageWidth(), this.imageHeight());
    for (let p = 0; p < mask.length; p++) { image.data[p * 4] = 255; image.data[p * 4 + 1] = 255; image.data[p * 4 + 2] = 255; image.data[p * 4 + 3] = mask[p]; }
    context.putImageData(image, 0, 0);
  }
  chooseColor(color: string): void { this.color = color; if(this.appearance.mode === 'pattern') this.appearance.pattern = { ...this.appearance.pattern, base: color }; this.original = false; this.render(); }
  compare(): void { this.original = !this.original; this.render(); }
  private scheduleRender(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => { this.frame = 0; this.render(); });
  }
  render(): void {
    if (!this.source) return;
    const empty = new Uint8Array(this.imageWidth() * this.imageHeight());
    const mask = constrainWallMask(this.safety || empty, this.boundary || empty, this.alpha(this.protectionCanvas));
    this.hasSelection.set(mask.some(value => value > 0));
    const output = this.outputCanvas.getContext('2d')!;
    const painted = new ImageData(styledPaint(this.source.data, mask, this.imageWidth(), this.color, this.strength, this.appearance), this.imageWidth(), this.imageHeight());
    output.putImageData(painted, 0, 0);
    const context = this.preview.nativeElement.getContext('2d')!;
    context.putImageData(this.original ? this.source : painted, 0, 0);
    const scale = this.imageWidth() / (this.preview.nativeElement.getBoundingClientRect().width || this.imageWidth());
    if (this.showBoundary && !this.original) {
      context.lineWidth = 2 * scale;
      context.strokeStyle = '#ffffff';
      context.setLineDash([7 * scale, 5 * scale]);
      for (const polygon of this.polygons) {
        context.beginPath();
        polygon.forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y));
        context.closePath(); context.stroke();
      }
      context.setLineDash([]);
    }
    if (this.points.length) {
      context.lineWidth = 2 * scale;
      context.strokeStyle = '#fff';
      context.fillStyle = '#71334344';
      context.setLineDash([6 * scale, 4 * scale]);
      context.beginPath();
      this.points.forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y));
      if (this.points.length >= 3) { context.closePath(); context.fill(); }
      context.stroke();
      context.setLineDash([]);
      this.points.forEach((point, index) => {
        context.beginPath(); context.arc(point.x, point.y, 5 * scale, 0, Math.PI * 2);
        context.fillStyle = index === 0 ? '#713343' : '#fff'; context.fill(); context.stroke();
      });
    }
    if (this.keyboardPoint) {
      const { x, y } = this.keyboardPoint;
      context.strokeStyle = '#fff'; context.lineWidth = 2 * scale;
      context.beginPath(); context.moveTo(x - 9 * scale, y); context.lineTo(x + 9 * scale, y);
      context.moveTo(x, y - 9 * scale); context.lineTo(x, y + 9 * scale); context.stroke();
    }
  }
  keyboard(event: KeyboardEvent): void {
    if (!this.source || !['outline', 'smart'].includes(this.tool) || this.loading()) return;
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Enter', 'Escape', 'Backspace'].includes(event.key)) return;
    event.preventDefault();
    const point = this.keyboardPoint || { x: this.imageWidth() / 2, y: this.imageHeight() / 2 };
    const step = event.shiftKey ? 1 : 10;
    if (event.key === 'ArrowLeft') point.x -= step;
    if (event.key === 'ArrowRight') point.x += step;
    if (event.key === 'ArrowUp') point.y -= step;
    if (event.key === 'ArrowDown') point.y += step;
    point.x = Math.max(0, Math.min(this.imageWidth() - 1, point.x));
    point.y = Math.max(0, Math.min(this.imageHeight() - 1, point.y));
    this.keyboardPoint = point;
    if (event.key === ' ') this.tool === 'smart' ? this.smartSelect({ ...point }) : this.addPoint({ ...point });
    if (event.key === 'Enter') this.tool === 'smart' ? this.smartSelect({ ...point }) : this.finishWall();
    if (event.key === 'Escape') this.cancelOutline();
    if (event.key === 'Backspace') this.undo();
    this.render();
  }
  download(): void {
    if (!this.source || !this.hasSelection()) return;
    this.render();
    this.outputCanvas.toBlob(blob => {
      if (!blob) { this.error.set('The preview could not be downloaded. Please try again.'); return; }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `smartwall-${this.color.slice(1)}.png`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      this.status.set('Your painted room preview is ready to download.');
    }, 'image/png');
  }
  private blob(canvas: HTMLCanvasElement): Promise<Blob> {
    return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Image could not be saved')), 'image/png'));
  }
  async saveDesign(): Promise<void> {
    if (!this.source || !this.uploadedPhoto || this.loading() || this.saving()) return;
    this.saving.set(true);
    this.saveError.set('');
    this.saveMessage.set('');
    const scope = this.designStore.scope();
    try {
      // Snapshot before awaiting: changing the editor cannot mix two designs in one save.
      this.render();
      const photo = this.uploadedPhoto;
      const snapshot = {
        id: crypto.randomUUID(), name: this.designName.trim().slice(0, 80) || this.fileName(),
        appearance: structuredClone(this.appearance), savedAt: Date.now(), fileName: this.fileName(), color: this.appearance.mode === 'pattern' ? this.appearance.pattern.base : this.color, strength: this.strength,
        tolerance: this.appliedTolerance, boundary: this.boundary?.slice() || null,
        safety: this.safety?.slice() || null, protectedAreas: this.alpha(this.protectionCanvas),
        seeds: this.seeds.map(point => ({ ...point })),
        polygons: this.polygons.map(polygon => polygon.map(point => ({ ...point }))),
      };
      const preview = await this.blob(this.outputCanvas);
      if (scope !== this.designStore.scope()) throw new Error('The account changed while saving. Please reopen the design and retry.');
      await this.designStore.save({ ...snapshot, photo, preview });
      if (scope !== this.designStore.scope()) return;
      await this.gallery.refresh();
      this.saveMessage.set(this.auth.user() ? 'Design and original photo saved privately to your account.' : 'Design and original photo saved in this browser. Log in to import your saves.');
    } catch (error: any) { this.saveError.set((error?.message || 'This design could not be saved.') + ' Your current edit is still here. Please retry or download a preview.'); }
    finally { this.saving.set(false); }
  }
  async openSavedDesign(design: SavedDesign): Promise<void> {
    if (this.loading() || this.saving()) return;
    await this.loadPhoto(new File([design.photo], design.fileName, { type: design.photo.type }));
    if (this.error() || !this.source || this.fileName() !== design.fileName) return;
    this.designName = design.name;
    this.color = design.color;
    this.strength = design.strength;
    this.appearance = structuredClone(design.appearance || { mode: 'solid', secondary: '#f0e8db', split: 50, direction: 'horizontal', finish: 'Matte', pattern: starterPatterns[0] });
    this.controlTab=this.appearance.mode==='pattern'?'patterns':'colours';
    this.restoreTexturePreview();
    this.boundary = design.boundary?.slice() || null;
    this.safety = design.safety?.slice() || null;
    this.seeds = design.seeds.map(point => ({ ...point }));
    this.polygons = design.polygons.map(polygon => polygon.map(point => ({ ...point })));
    this.edgeTolerance = this.appliedTolerance = design.tolerance;
    this.restoreAlpha(this.boundaryCanvas, this.boundary || new Uint8Array(this.imageWidth() * this.imageHeight()));
    this.restoreAlpha(this.protectionCanvas, design.protectedAreas);
    this.boundaryReady.set(!!this.boundary);
    this.wallDetected.set(!!this.safety?.some(value => value > 0));
    this.tool = this.boundary ? 'smart' : 'outline';
    this.status.set('Saved design reopened with its original photo and wall selection. Save again to keep a new version.');
    this.render();
    this.preview.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  ngOnDestroy(): void { this.clearOriginalUrl(); this.textureVersion++; this.loadVersion++; if (this.frame) cancelAnimationFrame(this.frame); }
}
