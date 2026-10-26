import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type { PendingTestimonial } from './testimonials-store';

function getTransporter(): Transporter | null {
  const { EMAIL_USER, EMAIL_APP_PASSWORD } = process.env;

  if (!EMAIL_USER || !EMAIL_APP_PASSWORD) {
    return null;
  }

  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user: EMAIL_USER, pass: EMAIL_APP_PASSWORD },
  });
}

export async function sendPendingTestimonialNotification(entry: PendingTestimonial): Promise<void> {
  const transporter = getTransporter();

  if (!transporter) {
    console.warn('Email not configured (EMAIL_USER/EMAIL_APP_PASSWORD missing) — skipping testimonial notification.');
    return;
  }

  try {
    await transporter.sendMail({
      from: process.env['EMAIL_USER'],
      to: process.env['NOTIFY_EMAIL'] || 'adam.gainus@gmail.com',
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

export async function sendTestimonialInvite(options: { email: string; name?: string }): Promise<void> {
  const transporter = getTransporter();

  if (!transporter) {
    throw new Error('Email is not configured on this server (EMAIL_USER/EMAIL_APP_PASSWORD missing).');
  }

  const siteUrl = (process.env['SITE_URL'] || 'http://localhost:4200').replace(/\/$/, '');
  const link = options.name
    ? `${siteUrl}/testimonials?name=${encodeURIComponent(options.name)}`
    : `${siteUrl}/testimonials`;

  const greeting = options.name ? `Hi ${options.name},` : 'Hi,';

  await transporter.sendMail({
    from: process.env['EMAIL_USER'],
    to: options.email,
    subject: 'Got a minute to share your feedback?',
    text: [
      greeting,
      '',
      "Thanks again for the chance to work on your site! If you have a minute, I'd really appreciate a short testimonial about your experience — it helps a lot with future work.",
      '',
      `You can leave one here: ${link}`,
      '',
      "It only takes a minute, and I read and approve every one personally before it goes up. Thanks so much!",
      '',
      '— Adam',
    ].join('\n'),
  });
}
