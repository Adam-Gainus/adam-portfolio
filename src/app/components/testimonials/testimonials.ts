import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
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
const TITLE_OPTIONS = ['Client', 'Employer', 'Coworker', 'Manager', 'Classmate', 'Instructor', 'Friend', 'Other'];

@Component({
  selector: 'app-testimonials',
  imports: [FormsModule],
  templateUrl: './testimonials.html',
  styleUrl: './testimonials.scss',
})
export class Testimonials implements OnInit {
  testimonials = signal<Testimonial[]>([]);

  titleOptions = TITLE_OPTIONS;

  name = '';
  titleOption = '';
  customTitle = '';
  quote = '';

  selectedPhoto: File | null = null;
  photoPreview = signal<string | null>(null);

  submitting = signal(false);
  submitError = signal('');
  submitted = signal(false);

  constructor(private http: HttpClient, private route: ActivatedRoute) {}

  ngOnInit(): void {
    const nameFromLink = this.route.snapshot.queryParamMap.get('name');
    if (nameFromLink) {
      this.name = nameFromLink;
    }

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

    const title = this.titleOption === 'Other' ? this.customTitle.trim() : this.titleOption;

    if (!this.name.trim() || !title || !this.quote.trim()) {
      this.submitError.set('Please fill in your name, relationship, and a testimonial.');
      return;
    }

    this.submitting.set(true);

    const formData = new FormData();
    formData.set('name', this.name.trim());
    formData.set('title', title);
    formData.set('quote', this.quote.trim());
    if (this.selectedPhoto) {
      formData.set('photo', this.selectedPhoto);
    }

    this.http.post('/api/testimonials', formData).subscribe({
      next: () => {
        this.submitting.set(false);
        this.submitted.set(true);
        this.name = '';
        this.titleOption = '';
        this.customTitle = '';
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
