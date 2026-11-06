import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Auth, apiHeaders } from './auth';

describe('Account sessions', () => {
  const account = { id: 'one', name: 'Alice', email: 'alice@example.test' };
  let auth: Auth;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(withInterceptors([apiHeaders])), provideHttpClientTesting()] });
    auth = TestBed.inject(Auth); http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  it('restores the server session on reload', () => {
    expect(auth.ready()).toBe(false);
    http.expectOne('/api/auth/me').flush({ user: account });
    expect(auth.user()).toEqual(account); expect(auth.ready()).toBe(true);
  });
  it('sends the same-origin write header and keeps failed login out of the account', async () => {
    http.expectOne('/api/auth/me').flush({ user: null });
    const pending = auth.authenticate('login', { email: account.email, password: 'incorrect-password' });
    const request = http.expectOne('/api/auth/login');
    expect(request.request.headers.get('X-SmartWall-Request')).toBe('1');
    request.flush({ error: 'Email or password is incorrect.' }, { status: 401, statusText: 'Unauthorized' });
    await expect(pending).rejects.toBeDefined();
    expect(auth.user()).toBeNull(); expect(auth.error()).toContain('incorrect'); expect(auth.busy()).toBe(false);
  });
  it('does not pretend logout succeeded when the server cannot revoke the session', async () => {
    http.expectOne('/api/auth/me').flush({ user: account });
    const pending = auth.logout();
    http.expectOne('/api/auth/logout').flush({}, { status: 503, statusText: 'Unavailable' });
    await expect(pending).rejects.toBeDefined();
    expect(auth.user()).toEqual(account); expect(auth.error()).toContain('retry');
  });
  it('does not mark the signed-in account verified when the link belongs to a different account', async () => {
    http.expectOne('/api/auth/me').flush({ user: { ...account, emailVerified: false } });
    const pending = auth.accountAction('verify-email', { token: 't'.repeat(43) });
    http.expectOne('/api/auth/verify-email').flush({ message: 'Email verified.', userId: 'another-account' });
    await pending;
    expect(auth.user()?.id).toBe(account.id);
    expect(auth.user()?.emailVerified).toBe(false);
    expect(auth.notice()).toContain('different account');
  });
});
