import nodemailer from 'nodemailer';
import type { PendingTestimonial } from './testimonials-store';

export async function sendPendingTestimonialNotification(entry: PendingTestimonial): Promise<void> {
  const { EMAIL_USER, EMAIL_APP_PASSWORD, NOTIFY_EMAIL } = process.env;

  if (!EMAIL_USER || !EMAIL_APP_PASSWORD) {
    console.warn('Email not configured (EMAIL_USER/EMAIL_APP_PASSWORD missing) — skipping testimonial notification.');
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: EMAIL_USER, pass: EMAIL_APP_PASSWORD },
    });

    await transporter.sendMail({
      from: EMAIL_USER,
      to: NOTIFY_EMAIL || 'adam.gainus@gmail.com',
      subject: 'New testimonial pending approval',
      text: [
        `Name: ${entry.name}`,
        `Title: ${entry.title}`,
        `Quote: ${entry.quote}`,
        '',
        'Review it at /admin/testimonials.',
      ].join('\n'),
    });
  } catch (error) {
    console.error('Failed to send testimonial notification email:', error);
  }
}
