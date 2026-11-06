import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AccountAccess } from './account-access';
import { Auth } from './auth';

describe('Account recovery screens', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [AccountAccess], providers: [provideHttpClient(), provideHttpClientTesting()] }).compileComponents();
    TestBed.inject(Auth); TestBed.inject(HttpTestingController).expectOne('/api/auth/me').flush({ user: null });
  });
  afterEach(() => TestBed.inject(HttpTestingController).verify());
  it('requests reset links and uses a neutral response for the email address', async () => {
    const fixture = TestBed.createComponent(AccountAccess); fixture.componentRef.setInput('mode', 'forgot');
    await fixture.whenStable(); const element = fixture.nativeElement as HTMLElement;
    const input = element.querySelector<HTMLInputElement>('#recovery-email')!;
    input.value = 'someone@example.test'; input.dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable(); element.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    const request = TestBed.inject(HttpTestingController).expectOne('/api/auth/forgot-password');
    expect(request.request.body).toEqual({ email: 'someone@example.test' });
    request.flush({ message: 'If an account exists, check your email.' });
    await fixture.whenStable(); expect(element.textContent).toContain('If an account exists');
  });
  it('rejects mismatched reset passwords without consuming the token', async () => {
    const fixture = TestBed.createComponent(AccountAccess); fixture.componentRef.setInput('mode', 'reset'); fixture.componentRef.setInput('token', 't'.repeat(43));
    await fixture.whenStable(); const element = fixture.nativeElement as HTMLElement;
    for (const [id, value] of [['reset-password', 'new-password-123'], ['reset-confirmation', 'wrong-password']]) {
      const input = element.querySelector<HTMLInputElement>('#' + id)!; input.value = value; input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    await fixture.whenStable(); element.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await fixture.whenStable(); expect(element.textContent).toContain('Passwords must match.');
    TestBed.inject(HttpTestingController).expectNone('/api/auth/reset-password');
  });
  it('requires an explicit confirmation before verifying an email', async () => {
    const fixture = TestBed.createComponent(AccountAccess); fixture.componentRef.setInput('mode', 'verify'); fixture.componentRef.setInput('token', 't'.repeat(43));
    await fixture.whenStable(); TestBed.inject(HttpTestingController).expectNone('/api/auth/verify-email');
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('button.primary')!.click();
    const request = TestBed.inject(HttpTestingController).expectOne('/api/auth/verify-email');
    request.flush({ message: 'Your email is verified.', userId: 'one' });
    await fixture.whenStable(); expect(fixture.componentInstance.complete()).toBe(true);
  });
});
