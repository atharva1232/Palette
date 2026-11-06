import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TrialFeedback } from './trial-feedback';

describe('Private trial feedback', () => {
  beforeEach(async () => { await TestBed.configureTestingModule({ imports: [TrialFeedback], providers: [provideHttpClient(), provideHttpClientTesting()] }).compileComponents(); });
  afterEach(() => TestBed.inject(HttpTestingController).verify());
  it('keeps answers after a failed request and retries without attaching photos or credentials', async () => {
    const fixture = TestBed.createComponent(TrialFeedback);
    await fixture.whenStable(); const element = fixture.nativeElement as HTMLElement;
    for (const [id, value] of [['trial-ease', '4'], ['trial-accuracy', '3'], ['trial-device', 'desktop']]) {
      const select = element.querySelector<HTMLSelectElement>('#' + id)!; select.value = value; select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const note = element.querySelector<HTMLTextAreaElement>('#trial-comment')!; note.value = 'Synthetic test feedback'; note.dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();
    const submit = () => element.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    submit(); const request = TestBed.inject(HttpTestingController).expectOne('/api/trial/feedback');
    expect(request.request.body.ease).toBe(4); expect(request.request.body.photo).toBeUndefined(); expect(request.request.body.password).toBeUndefined();
    request.flush({}, { status: 503, statusText: 'Unavailable' });
    await fixture.whenStable(); expect(note.value).toBe('Synthetic test feedback'); expect(element.textContent).toContain('answers are still here');
    submit(); TestBed.inject(HttpTestingController).expectOne('/api/trial/feedback').flush({ message: 'Feedback saved privately.' });
    await fixture.whenStable(); expect(element.textContent).toContain('Feedback saved privately.');
  });
});
