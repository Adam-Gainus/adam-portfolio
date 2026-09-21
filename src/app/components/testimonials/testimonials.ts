import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';

interface Testimonial {
  id: string;
  name: string;
  title: string;
  quote: string;
  photoFilename?: string;
}

const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
const ALLOWED_PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

@Component({
  selector: 'app-testimonials',
  imports: [FormsModule],
  templateUrl: './testimonials.html',
  styleUrl: './testimonials.scss',
})
export class Testimonials implements OnInit {
  testimonials = signal<Testimonial[]>([]);

  name = '';
  title = '';
  quote = '';

  selectedPhoto: File | null = null;
  photoPreview = signal<string | null>(null);

  submitting = signal(false);
  submitError = signal('');
  submitted = signal(false);

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.http.get<Testimonial[]>('/api/testimonials').subscribe({
      next: (testimonials) => this.testimonials.set(testimonials),
      error: () => this.testimonials.set([]),
    });
  }

  onPhotoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) {
      return;
    }

    if (!ALLOWED_PHOTO_TYPES.has(file.type)) {
      this.submitError.set('Please choose a JPEG, PNG, WebP, or GIF image.');
      input.value = '';
      return;
    }

    if (file.size > MAX_PHOTO_BYTES) {
      this.submitError.set('Photo must be smaller than 3MB.');
      input.value = '';
      return;
    }

    this.submitError.set('');
    this.selectedPhoto = file;

    const previousPreview = this.photoPreview();
    if (previousPreview) {
      URL.revokeObjectURL(previousPreview);
    }
    this.photoPreview.set(URL.createObjectURL(file));
  }

  removePhoto(): void {
    const preview = this.photoPreview();
    if (preview) {
      URL.revokeObjectURL(preview);
    }
    this.selectedPhoto = null;
    this.photoPreview.set(null);
  }

  submit(): void {
    this.submitError.set('');

    if (!this.name.trim() || !this.quote.trim()) {
      this.submitError.set('Please fill in your name and a testimonial.');
      return;
    }

    this.submitting.set(true);

    const formData = new FormData();
    formData.set('name', this.name.trim());
    formData.set('title', this.title.trim());
    formData.set('quote', this.quote.trim());
    if (this.selectedPhoto) {
      formData.set('photo', this.selectedPhoto);
    }

    this.http.post('/api/testimonials', formData).subscribe({
      next: () => {
        this.submitting.set(false);
        this.submitted.set(true);
        this.name = '';
        this.title = '';
        this.quote = '';
        this.removePhoto();
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        const serverMessage = typeof err.error?.error === 'string' ? err.error.error : '';
        this.submitError.set(serverMessage || 'Something went wrong submitting your testimonial. Please try again.');
      },
    });
  }
}
