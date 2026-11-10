import { Component, DOCUMENT, HostListener, Injector, afterNextRender, inject, signal, effect } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { shades, starterPatterns, patternStyles, patternBackground, WallPattern } from './catalog';
import { Visualizer } from './visualizer';
import { Auth } from './auth';
import { AccountAccess } from './account-access';
import { TrialFeedback } from './trial-feedback';
import { AdminPanel } from './admin-panel';
import { UserGuide } from './user-guide';
import { Catalogue } from './catalogue';
import { Activity } from './activity';
type Page = 'home' | 'visualize' | 'shades' | 'patterns' | 'login' | 'signup' | 'dashboard' | 'forgot' | 'verify' | 'reset' | 'feedback' | 'admin' | 'help';
const themePreference = 'smartwall-theme';

@Component({
  imports: [FormsModule, NgTemplateOutlet, Visualizer, AccountAccess, TrialFeedback, AdminPanel, UserGuide],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  private readonly http = inject(HttpClient);
  private readonly injector = inject(Injector);
  private readonly document = inject(DOCUMENT);
  readonly darkMode = signal(this.readDarkMode());
  page: Page = 'home';
  visualizerOpened = false;
  readonly auth = inject(Auth);
  get favouriteShades() { return this.catalogue.colours().filter(c=>this.catalogue.favourites().includes('colour:'+c.id)); }
  get favouritePatterns() { return [...this.catalogue.patterns(),...this.catalogue.publishedPatterns()].filter(p=>this.catalogue.favourites().includes('pattern:'+p.id)); }
  get displayName(): string { return this.auth.user()?.name || ''; }
  accountStats = signal({ designs: 0, patterns: 0 });
  statsError = signal('');
  patternToDelete = '';
  accountLinkToken = '';
  readonly catalogue = inject(Catalogue);
  private activity = inject(Activity);
  settings = signal({siteName:'Palettè',maintenance:false,allowPublishing:true});
  constructor() { this.applyTheme(); this.consumeAccountLink(); this.loadSettings(); effect(()=>{ if(this.auth.user()) this.catalogue.loadFavourites(); else this.catalogue.favourites.set([]); }); }
  loadSettings():void { this.http.get<any>('/api/settings').subscribe({next:s=>this.settings.set(s),error:()=>{}}); }

  private readDarkMode(): boolean {
    try { return this.document.defaultView?.localStorage.getItem(themePreference) === 'dark'; }
    catch { return false; }
  }

  private applyTheme(): void {
    this.document.documentElement.dataset['theme'] = this.darkMode() ? 'dark' : 'light';
  }

  toggleTheme(): void {
    this.darkMode.update(enabled => !enabled);
    this.applyTheme();
    try { this.document.defaultView?.localStorage.setItem(themePreference, this.darkMode() ? 'dark' : 'light'); }
    catch { /* The switch still works when browser storage is unavailable. */ }
  }

  @HostListener('window:hashchange')
  consumeAccountLink(): void {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const mode = params.has('verify') ? 'verify' : params.has('reset') ? 'reset' : null;
    if (mode) {
      const token = params.get(mode) || '';
      this.accountLinkToken = /^[A-Za-z0-9_-]{43}$/.test(token) ? token : '';
      this.page = mode;
      this.auth.error.set('');
      // Keep sensitive tokens out of subsequent URLs and referrers.
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    } else if (new URLSearchParams(window.location.search).get('trial') === '1') this.page = 'feedback';
    else if (new URLSearchParams(window.location.search).get('account') === 'forgot') this.page = 'forgot';
  }
  login = { email: '', password: '' };
  signup = { name: '', email: '', password: '', confirmPassword: '' };
  selectedColor = '#713343';
  selectedShadeId = '';
  showOriginal = false;
  previewShade(colour: string, shadeId = ''): void {
    this.selectedColor = colour;
    this.selectedShadeId = shadeId;
    this.showOriginal = false;
  }

  featureColor = '#713343';
  featureReveal = 48;
  readonly featureShades = shades.filter(shade => ['Velvet Maroon', 'Sage Green', 'Warm Beige'].includes(shade.name));
  readonly featuredPatterns = starterPatterns.slice(6, 10);
  readonly moods = [
    { name: 'The warm embrace', note: 'Earthy, sunlit, effortlessly welcoming.', family: 'Earth tones', shade: '#b9674d', colours: ['#b9674d', '#d6bea0', '#f0e8db'], image: 'images/lounge.jpg', alt: 'Furnished lounge with a grey sofa and a glass coffee table', position: '75% 65%', label: '01 / The Mood Changer', tinted: true },
    { name: 'A softer kind of bold', note: 'Romantic rose meets a little maroon drama.', family: 'Reds & pinks', shade: '#713343', colours: ['#713343', '#c58e96', '#ebcbd0'], image: 'images/classic-patterned-living-room.jpg', alt: 'Cream sofas in a living room with a geometric striped accent wall', position: '50% 50%', label: '02 / Classic', tinted: true },
    { name: 'A calmer shade of blue', note: 'Slate blue panelling, soft linens, and warm wood.', family: 'Blues', shade: '#72869c', colours: ['#344b67', '#72869c', '#ede6dc'], image: 'images/sky-effect-bedroom.jpg', alt: 'Bedroom with a blue panelled accent wall, cream bedding and tall windows', position: '32% 50%', label: '03 / Sky Effect', tinted: false },
  ];
  openMood(mood: typeof this.moods[number]): void {
    this.family = mood.family;
    this.shadeSearch = '';
    this.selectedColor = mood.shade;
    this.navigate('shades');
  }
  tryPatternOnPhoto(): void { this.navigate('visualize'); this.catalogue.requestedPattern.set({...this.selectedPattern}); }
  openPattern(pattern: WallPattern): void {
    this.selectedPattern = pattern;
    this.showPatternBuilder = false;
    this.navigate('patterns');
  }
  get shades() { return this.catalogue.colours(); }
  get families() { return ['All shades', ...new Set(this.shades.map(shade => shade.family))]; }
  family = 'All shades';
  shadeSearch = '';
  favouritesOnly = false;
  readonly patternStyles = patternStyles;
  readonly patternBackground = patternBackground;
  get starterPatterns() { return this.catalogue.patterns(); }
  communityPatterns = signal<WallPattern[]>([]);
  patternsLoading = signal(false);
  patternsError = signal('');
  savingPattern = signal(false);
  patternMessage = signal('');
  showPatternBuilder = false;
  selectedPattern = starterPatterns[0];
  draft: Omit<WallPattern, 'id'> = { name: '', author: '', style: 'Stripes', base: '#f1e1d7', ink: '#713343', scale: 40 };
  get filteredShades() {
    const query = this.shadeSearch.trim().toLowerCase();
    return this.shades.filter(shade => (!this.favouritesOnly || this.catalogue.favourites().includes('colour:'+shade.id)) && (this.family === 'All shades' || shade.family === this.family)
      && `${shade.name} ${shade.hex} ${shade.family}`.toLowerCase().includes(query));
  }
  get selectedShade() { return this.shades.find(shade => shade.id === this.selectedShadeId && shade.hex === this.selectedColor) || this.shades.find(shade => shade.hex === this.selectedColor) || { name: 'Custom shade', family: 'Custom', id: '', brand: '', finishes: [] }; }
  colors = shades.filter(shade => ['Velvet Maroon', 'Sage Green', 'Ocean Blue', 'Warm Beige', 'Lavender'].includes(shade.name));
  navigate(page: Page): void {
    if (page === 'dashboard' && !this.auth.user()) page = 'login';
    if (page === 'admin' && this.auth.user()?.role !== 'admin') page = 'login';
    this.page = page;
    this.loadSettings();
    if (page === 'shades' || page === 'patterns') this.catalogue.refresh();
    if (page === 'visualize') this.visualizerOpened = true;
    this.showOriginal = false;
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    if (page === 'patterns') this.loadPatterns();
    if (page === 'dashboard') this.loadAccountStats();
    this.auth.error.set('');
    if (page !== 'dashboard') this.auth.notice.set('');
    this.login.password = '';
    this.signup.password = '';
    this.signup.confirmPassword = '';
  }
  loadPatterns(): void {
    this.patternsLoading.set(true);
    this.patternsError.set('');
    this.http.get<WallPattern[]>('/api/patterns').subscribe({
      next: patterns => { this.communityPatterns.set(patterns); this.patternsLoading.set(false); },
      error: () => { this.patternsError.set('The shared collection is unavailable. Try again in a moment.'); this.patternsLoading.set(false); },
    });
  }
  editPattern(): void {
    const { id, ...pattern } = this.selectedPattern;
    this.draft = { ...pattern, name: '', author: '' };
    this.showPatternBuilder = true;
    this.patternMessage.set('');
  }
  addPattern(form: NgForm): void {
    if (this.savingPattern()) return;
    if (form.invalid || !this.draft.name.trim()) { form.control.markAllAsTouched(); return; }
    if (!this.auth.user()) { this.patternMessage.set('Log in to publish your pattern. Your draft will stay here.'); return; }
    this.savingPattern.set(true);
    this.patternMessage.set('');
    this.http.post<WallPattern>('/api/patterns', { ...this.draft, name: this.draft.name.trim(), author: this.draft.author.trim() || 'Guest creator' }).subscribe({
      next: pattern => {
        this.communityPatterns.update(patterns => [pattern, ...patterns]);
        this.catalogue.refresh();
        this.selectedPattern = pattern;
        this.showPatternBuilder = false;
        this.savingPattern.set(false);
        this.patternMessage.set('Your pattern is now in the shared collection, ready for others to try.');
      },
      error: error => {
        this.savingPattern.set(false);
        if (error.status === 401) this.auth.expired();
        this.patternMessage.set((error?.error?.error || 'Your pattern could not be saved.') + ' Your design is still here; please try again.');
      },
    });
  }
  async submitLogin(form: NgForm): Promise<void> {
    if (this.auth.busy() || !this.auth.ready()) return;
    if (form.invalid) { form.control.markAllAsTouched(); return; }
    try { await this.auth.authenticate('login', { ...this.login }); this.navigate('dashboard'); }
    catch { /* Auth displays the server error; keep the form available. */ }
  }
  async submitSignup(form: NgForm): Promise<void> {
    if (this.auth.busy() || !this.auth.ready()) return;
    if (form.invalid || !this.signup.name.trim() || this.signup.password !== this.signup.confirmPassword) {
      form.control.markAllAsTouched(); return;
    }
    try { await this.auth.authenticate('signup', { name: this.signup.name.trim(), email: this.signup.email, password: this.signup.password }); this.navigate('dashboard'); }
    catch { /* Auth displays the server error. */ }
  }
  async logout(): Promise<void> {
    if (this.auth.busy()) return;
    try {
      await this.auth.logout();
      this.login = { email: '', password: '' };
      this.signup = { name: '', email: '', password: '', confirmPassword: '' };
      this.accountStats.set({ designs: 0, patterns: 0 });
      this.navigate('home');
    } catch { /* Keep the account visible until logout succeeds. */ }
  }
  loadAccountStats(): void {
    const owner = this.auth.user()?.id;
    this.statsError.set('');
    this.accountStats.set({ designs: 0, patterns: 0 });
    this.http.get<{ designs: number; patterns: number }>('/api/account/stats').subscribe({
      next: value => { if (this.auth.user()?.id === owner) this.accountStats.set(value); },
      error: error => { if (this.auth.user()?.id !== owner) return; if (error.status === 401) { this.auth.expired(); this.page = 'login'; } this.statsError.set('Your saved totals could not be loaded.'); },
    });
  }
  openSavedGallery(): void {
    this.navigate('visualize');
    afterNextRender(() => document.getElementById('saved-designs-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), { injector: this.injector });
  }
  async resendVerification(): Promise<void> {
    try { await this.auth.accountAction('resend-verification', {}); } catch { /* The account banner displays the error. */ }
  }
  deletePattern(id: string): void {
    this.patternMessage.set('');
    this.http.delete(`/api/patterns/${id}`).subscribe({
      next: () => { this.patternToDelete = ''; this.communityPatterns.update(patterns => patterns.filter(pattern => pattern.id !== id)); this.selectedPattern = this.starterPatterns[0]; this.patternMessage.set('Your pattern was deleted.'); },
      error: error => { if (error.status === 401) this.auth.expired(); this.patternMessage.set('The pattern could not be deleted. Please retry.'); },
    });
  }
}

