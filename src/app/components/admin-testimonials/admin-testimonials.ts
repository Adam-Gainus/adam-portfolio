import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { forkJoin } from 'rxjs';

interface PendingTestimonial {
  id: string;
  name: string;
  title: string;
  quote: string;
  photoFilename?: string;
  submittedAt: string;
}

interface ApprovedTestimonial {
  id: string;
  name: string;
  title: string;
  quote: string;
  photoFilename?: string;
  approvedAt: string;
}

@Component({
  selector: 'app-admin-testimonials',
  imports: [FormsModule],
  templateUrl: './admin-testimonials.html',
  styleUrl: './admin-testimonials.scss',
})
export class AdminTestimonials {
  password = '';
  showPassword = signal(false);
  unlocked = signal(false);
  error = signal('');
  loading = signal(false);

  pending = signal<PendingTestimonial[]>([]);
  approved = signal<ApprovedTestimonial[]>([]);

  inviteName = '';
  inviteEmail = '';
  inviteSending = signal(false);
  inviteError = signal('');
  inviteSent = signal(false);

  constructor(private http: HttpClient) {}

  unlock(): void {
    this.error.set('');
    this.loading.set(true);

    forkJoin({
      pending: this.http.get<PendingTestimonial[]>('/api/testimonials/pending', { headers: this.authHeaders() }),
      approved: this.http.get<ApprovedTestimonial[]>('/api/testimonials'),
    }).subscribe({
      next: ({ pending, approved }) => {
        this.loading.set(false);
        this.unlocked.set(true);
        this.pending.set(pending);
        this.approved.set(approved);
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.error.set(err.status === 401 ? 'Incorrect password.' : 'Something went wrong. Please try again.');
      },
    });
  }

  approve(id: string): void {
    this.http.post<ApprovedTestimonial>(`/api/testimonials/${id}/approve`, {}, { headers: this.authHeaders() }).subscribe({
      next: (approved) => {
        this.pending.update((items) => items.filter((item) => item.id !== id));
        this.approved.update((items) => [approved, ...items]);
      },
    });
  }

  reject(id: string): void {
    this.http.post(`/api/testimonials/${id}/reject`, {}, { headers: this.authHeaders() }).subscribe({
      next: () => this.pending.update((items) => items.filter((item) => item.id !== id)),
    });
  }

  deleteApproved(id: string): void {
    this.http.delete(`/api/testimonials/approved/${id}`, { headers: this.authHeaders() }).subscribe({
      next: () => this.approved.update((items) => items.filter((item) => item.id !== id)),
    });
  }

  sendInvite(): void {
    this.inviteError.set('');
    this.inviteSent.set(false);

    if (!this.inviteEmail.trim()) {
      this.inviteError.set('Please enter the client\'s email.');
      return;
    }

    this.inviteSending.set(true);

    this.http
      .post(
        '/api/testimonials/invite',
        { email: this.inviteEmail.trim(), name: this.inviteName.trim() },
        { headers: this.authHeaders() },
      )
      .subscribe({
        next: () => {
          this.inviteSending.set(false);
          this.inviteSent.set(true);
          this.inviteName = '';
          this.inviteEmail = '';
        },
        error: (err: HttpErrorResponse) => {
          this.inviteSending.set(false);
          const serverMessage = typeof err.error?.error === 'string' ? err.error.error : '';
          this.inviteError.set(serverMessage || 'Something went wrong sending the invite.');
        },
      });
  }

  private authHeaders(): HttpHeaders {
    return new HttpHeaders({ 'x-admin-password': this.password });
  }
}
