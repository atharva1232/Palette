import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { By } from '@angular/platform-browser';
import { Visualizer } from './visualizer';
import { Auth } from './auth';

const reqDefault=(url:string):any => url === '/api/catalog' ? { colours: [], patterns: [] } : url === '/api/account/favourites' ? [] : {siteName:'SmartWall',maintenance:false,allowPublishing:true};

describe('SmartWall', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [App], providers: [provideHttpClient(), provideHttpClientTesting()] }).compileComponents();
    TestBed.inject(Auth);
    TestBed.inject(HttpTestingController).expectOne('/api/auth/me').flush({ user: null });
  });
  afterEach(() => { const http=TestBed.inject(HttpTestingController); for(const r of http.match(req=>['/api/catalog','/api/settings','/api/account/favourites'].includes(req.url))) { r.flush(reqDefault(r.request.url)); } http.verify(); });
  it('opens verification links without sending their token to an API or leaving it in the address bar', async () => {
    const token = 't'.repeat(43);
    window.history.replaceState(null, '', '/#verify=' + token);
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    expect(fixture.componentInstance.page).toBe('verify');
    expect(fixture.componentInstance.accountLinkToken).toBe(token);
    expect(window.location.hash).toBe('');
    TestBed.inject(HttpTestingController).expectNone('/api/auth/verify-email');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Verify my email');
  });
  it('opens Visualize from the header and homepage showcase without recreating the editor', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const nav = Array.from(element.querySelectorAll('nav button')).find(button => button.textContent?.trim() === 'Visualize') as HTMLButtonElement;
    nav.click();
    await fixture.whenStable();
    const editor = fixture.debugElement.query(By.directive(Visualizer)).componentInstance as Visualizer;
    expect(fixture.componentInstance.page).toBe('visualize');
    expect(element.querySelector('app-visualizer')!.hasAttribute('hidden')).toBe(false);
    (Array.from(element.querySelectorAll('nav button')).find(button => button.textContent?.trim() === 'Home') as HTMLButtonElement).click();
    await fixture.whenStable();
    element.querySelector<HTMLButtonElement>('.feature-copy button.primary')!.click();
    await fixture.whenStable();
    expect(fixture.debugElement.query(By.directive(Visualizer)).componentInstance).toBe(editor);
    expect(fixture.componentInstance.page).toBe('visualize');
  });
  it('choosing a ready-made pattern activates the painted view, and rejects non-image textures', async () => {
    const fixture=TestBed.createComponent(App);fixture.componentInstance.navigate('visualize');await fixture.whenStable();
    const editor=fixture.debugElement.query(By.directive(Visualizer)).componentInstance as Visualizer;
    editor.original=true;editor.choosePattern('pinstripe');expect(editor.appearance.mode).toBe('pattern');expect(editor.original).toBe(false);expect(editor.appearance.patternSource).toBe('built-in');
    await editor.loadPattern(new File(['bad'],'pattern.txt',{type:'text/plain'}));expect(editor.patternError()).toContain('JPG, PNG or WebP');expect(editor.appearance.texture).toBeUndefined();
  });
  it('transfers a Patterns-page choice into the existing editor and updates its controls', async () => {
    const fixture=TestBed.createComponent(App);const app=fixture.componentInstance;app.navigate('visualize');await fixture.whenStable();
    const editor=fixture.debugElement.query(By.directive(Visualizer)).componentInstance as Visualizer;
    editor.appearance.mode='pattern';editor.appearance.patternSource='upload';fixture.detectChanges();
    app.tryPatternOnPhoto();await fixture.whenStable();
    expect(editor.appearance.patternSource).toBe('built-in');
    expect((fixture.nativeElement as HTMLElement).querySelector<HTMLSelectElement>('#wall-pattern')?.value).toBe(app.selectedPattern.id);
  });
  it('reports an unsupported upload without opening an empty editor', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.componentInstance.navigate('visualize');
    await fixture.whenStable();
    const editor = fixture.debugElement.query(By.directive(Visualizer)).componentInstance as Visualizer;
    await editor.loadPhoto(new File(['not an image'], 'test.txt', { type: 'text/plain' }));
    await fixture.whenStable();
    expect(editor.hasImage()).toBe(false);
    expect((fixture.nativeElement as HTMLElement).querySelector('.visualizer-error')!.textContent).toContain('JPG, PNG, or WebP');
  });
  it('filters shades and previews the selected shade', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.componentInstance.navigate('shades');
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const input = element.querySelector<HTMLInputElement>('#shade-search')!;
    input.value = 'midnight';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();
    expect(element.querySelectorAll('.shade-card').length).toBe(1);
    element.querySelector<HTMLButtonElement>('.shade-card')!.click();
    await fixture.whenStable();
    expect(element.querySelector('.studio-preview h2')!.textContent).toBe('Midnight');
    expect(element.querySelector<HTMLElement>('.wall-paint')!.style.backgroundColor).toBe('rgb(52, 75, 103)');
    input.value = 'no-match';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();
    expect(element.textContent).toContain('No shades found.');
  });
  it('loads shared patterns, keeps a failed draft, and publishes it on retry', async () => {
    TestBed.inject(Auth).user.set({ id: 'test-user', name: 'Demo User', email: 'demo@example.com' });
    const fixture = TestBed.createComponent(App);
    const http = TestBed.inject(HttpTestingController);
    const app = fixture.componentInstance;
    app.navigate('patterns');
    http.expectOne('/api/patterns').flush([]);
    app.editPattern();
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const name = element.querySelector<HTMLInputElement>('#pattern-name')!;
    name.value = 'My wall';
    name.dispatchEvent(new Event('input', { bubbles: true }));
    const style = element.querySelector<HTMLSelectElement>('#pattern-style')!;
    style.value = 'Petals';
    style.dispatchEvent(new Event('change', { bubbles: true }));
    await fixture.whenStable();
    const submit = () => element.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    submit();
    const failed = http.expectOne('/api/patterns');
    expect(failed.request.method).toBe('POST');
    expect(failed.request.body.style).toBe('Petals');
    failed.flush({}, { status: 500, statusText: 'Server error' });
    await fixture.whenStable();
    expect(app.showPatternBuilder).toBe(true);
    expect(app.draft.name).toBe('My wall');
    expect(element.textContent).toContain('could not be saved');
    submit();
    const retry = http.expectOne('/api/patterns');
    retry.flush({ ...retry.request.body, id: 'new-pattern' });
    await fixture.whenStable();
    expect(app.showPatternBuilder).toBe(false);
    expect(app.communityPatterns()[0].name).toBe('My wall');
    expect(app.selectedPattern.id).toBe('new-pattern');
    expect(element.textContent).toContain('Your pattern is now in the shared collection');
  });
  it('changes the preview when a colour is selected', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const swatch = element.querySelector<HTMLButtonElement>('[aria-label="Ocean Blue"]')!;
    swatch.click();
    await fixture.whenStable();
    expect(swatch.getAttribute('aria-pressed')).toBe('true');
    expect(element.querySelector<HTMLElement>('.wall-paint')!.style.backgroundColor).toBe('rgb(158, 187, 208)');
    expect(element.querySelector<HTMLImageElement>('.room-photo')!.getAttribute('src')).toBe('images/lounge.jpg');
    element.querySelector<HTMLButtonElement>('.compare-button')!.click();
    await fixture.whenStable();
    expect(element.querySelector('.wall-overlay')!.classList.contains('original')).toBe(true);
    expect(element.querySelector('.compare-button')!.getAttribute('aria-pressed')).toBe('true');
  });
  it('validates signup, creates a real session and logs out through the API', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.componentInstance.navigate('signup');
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const submit = () => element.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    submit();
    await fixture.whenStable();
    expect(element.textContent).toContain('Enter your name.');
    for (const [id, value] of Object.entries({
      'signup-name': 'Demo User', 'signup-email': 'demo@example.com',
      'signup-password': 'sample123', 'confirm-password': 'wrong123',
    })) {
      const input = element.querySelector<HTMLInputElement>('#' + id)!;
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    await fixture.whenStable();
    submit();
    await fixture.whenStable();
    expect(element.textContent).toContain('Passwords must match.');
    const confirmation = element.querySelector<HTMLInputElement>('#confirm-password')!;
    confirmation.value = 'sample123';
    confirmation.dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();
    submit();
    TestBed.inject(HttpTestingController).expectOne('/api/auth/signup').flush({ user: { id: 'test-user', name: 'Demo User', email: 'demo@example.com' } });
    await new Promise(resolve => setTimeout(resolve, 0));
    TestBed.inject(HttpTestingController).expectOne('/api/account/stats').flush({ designs: 2, patterns: 0 });
    await fixture.whenStable();
    expect(element.querySelector('h1')!.textContent).toBe('Hello, Demo User.');
    expect(fixture.componentInstance.signup.password).toBe('');
    const exit = Array.from(element.querySelectorAll('button')).find(button => button.textContent?.trim() === 'Log out')!;
    exit.click();
    TestBed.inject(HttpTestingController).expectOne('/api/auth/logout').flush({ ok: true });
    await fixture.whenStable();
    expect(fixture.componentInstance.page).toBe('home');
    expect(fixture.componentInstance.displayName).toBe('');
  });
});

