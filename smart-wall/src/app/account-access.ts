import { Component, inject, input, output, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { Auth } from './auth';

@Component({
  selector: 'app-account-access', imports: [FormsModule], templateUrl: './account-access.html', styleUrl: './account-access.css',
})
export class AccountAccess {
  readonly mode = input.required<'forgot' | 'verify' | 'reset'>();
  readonly token = input('');
  readonly returnToLogin = output<void>();
  readonly auth = inject(Auth);
  readonly complete = signal(false);
  readonly message = signal('');
  email = '';
  password = '';
  confirmation = '';
  async submit(form?: NgForm): Promise<void> {
    if (this.auth.busy()) return;
    if (form?.invalid || this.mode() === 'reset' && this.password !== this.confirmation) { form?.control.markAllAsTouched(); return; }
    try {
      const mode = this.mode();
      const result = await this.auth.accountAction(mode === 'forgot' ? 'forgot-password' : mode === 'verify' ? 'verify-email' : 'reset-password', mode === 'forgot' ? { email: this.email } : mode === 'verify' ? { token: this.token() } : { token: this.token(), password: this.password });
      this.message.set(result.message); this.complete.set(true);
      this.password = ''; this.confirmation = '';
    } catch { /* The API error is displayed and a valid link can be retried. */ }
  }
}
