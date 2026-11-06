import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpInterceptorFn } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export interface Account { id: string; name: string; email: string; emailVerified?: boolean; role?: 'user' | 'admin'; }
export const apiHeaders: HttpInterceptorFn = (request, next) => next(request.url.startsWith('/api/') ? request.clone({ setHeaders: { 'X-SmartWall-Request': '1', 'Content-Type': 'application/json' } }) : request);

@Injectable({ providedIn: 'root' })
export class Auth {
  private readonly http = inject(HttpClient);
  readonly user = signal<Account | null>(null);
  readonly ready = signal(false);
  readonly emailEnabled = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  constructor() {
    this.http.get<{ user: Account | null; emailEnabled?: boolean }>('/api/auth/me').subscribe({
      next: result => { this.emailEnabled.set(result.emailEnabled === true); this.user.set(result.user); this.ready.set(true); },
      error: () => { this.ready.set(true); this.error.set('The server is unavailable. Please try again.'); },
    });
  }
  async authenticate(kind: 'login' | 'signup', details: { email: string; password: string; name?: string }): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true); this.error.set('');
    try {
      const result = await firstValueFrom(this.http.post<{ user: Account; message?: string }>(`/api/auth/${kind}`, details));
      this.user.set(result.user);
      this.notice.set(result.message || '');
    } catch (error: any) { this.error.set(error?.error?.error || 'The server is unavailable. Please try again.'); throw error; }
    finally { this.busy.set(false); }
  }
  async logout(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true); this.error.set('');
    try { await firstValueFrom(this.http.post('/api/auth/logout', {})); this.user.set(null); }
    catch (error: any) { this.error.set('Logout could not be completed. Please retry.'); throw error; }
    finally { this.busy.set(false); }
  }
  expired(): void { this.user.set(null); this.error.set('Your session expired. Please log in again.'); }
  async accountAction(action: 'forgot-password' | 'resend-verification' | 'verify-email' | 'reset-password', details: object): Promise<{ message: string; userId?: string; role?: 'user' | 'admin' }> {
    if (this.busy()) throw new Error('Please wait for the current request.');
    this.busy.set(true); this.error.set(''); this.notice.set('');
    try {
      const result = await firstValueFrom(this.http.post<{ message: string; userId?: string; role?: 'user' | 'admin' }>(`/api/auth/${action}`, details));
      if (action === 'verify-email' && this.user() && result.userId !== this.user()?.id) {
        result.message = 'The email link is verified for a different account. Your signed-in account is unchanged. Log in to that account to continue.';
      }
      if (action === 'verify-email' && result.userId === this.user()?.id) this.user.update(user => user ? { ...user, emailVerified: true, role: result.role || user.role } : null);
      if (action === 'reset-password') this.user.set(null);
      this.notice.set(result.message);
      return result;
    } catch (error: any) { this.error.set(error?.error?.error || 'The request could not be completed. Please retry.'); throw error; }
    finally { this.busy.set(false); }
  }
}
