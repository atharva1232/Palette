import { Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule, NgForm } from '@angular/forms';

@Component({
  selector: 'app-trial-feedback', imports: [FormsModule], templateUrl: './trial-feedback.html', styleUrl: './trial-feedback.css',
})
export class TrialFeedback {
  private readonly http = inject(HttpClient);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  ease = ''; accuracy = ''; device = ''; comment = '';
  tasks = { upload: false, select: false, save: false, reopen: false, delete: false };
  readonly steps = [
    { key: 'upload' as const, name: 'Upload a room photo' }, { key: 'select' as const, name: 'Select the wall and try a colour' },
    { key: 'save' as const, name: 'Save a design' }, { key: 'reopen' as const, name: 'Refresh and reopen the saved design' }, { key: 'delete' as const, name: 'Delete a disposable test design' },
  ];
  send(form: NgForm): void {
    if (this.busy()) return;
    if (form.invalid) { form.control.markAllAsTouched(); return; }
    this.busy.set(true); this.error.set('');
    this.http.post<{ message: string }>('/api/trial/feedback', { ease: Number(this.ease), accuracy: Number(this.accuracy), device: this.device, tasks: this.tasks, comment: this.comment }).subscribe({
      next: result => { this.message.set(result.message); this.busy.set(false); },
      error: error => { this.error.set(error?.error?.error || 'Feedback could not be saved. Your answers are still here; please retry.'); this.busy.set(false); },
    });
  }
}
