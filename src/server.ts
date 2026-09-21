import 'dotenv/config';
import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express, { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { sendPendingTestimonialNotification } from './server/mailer';
import { containsProfanity } from './server/profanity-filter';
import {
  addPending,
  approve,
  getApproved,
  getPending,
  isDuplicateQuote,
  photosDir,
  reject,
  removeApproved,
} from './server/testimonials-store';

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine();

// Render (and most PaaS hosts) put every request through exactly one reverse
// proxy hop before it reaches this app. Trusting that hop lets Express read
// the real visitor IP from X-Forwarded-For instead of the proxy's own IP —
// without this, the rate limiters below would see every visitor as the same
// "client" and either block everyone together or block no one effectively.
app.set('trust proxy', 1);

// CSP is disabled here because it would need custom directives to allow the
// Google Fonts / Font Awesome assets the site already loads; the other
// headers helmet sets (nosniff, frame protection, etc.) are safe defaults.
app.use(helmet({ contentSecurityPolicy: false }));

app.use(express.json());

if (!existsSync(photosDir)) {
  mkdirSync(photosDir, { recursive: true });
}

app.use('/testimonial-photos', express.static(photosDir));

// SVG is deliberately excluded: it can embed <script> and cause stored XSS
// when the uploaded file is opened directly via its static URL.
const ALLOWED_PHOTO_TYPES: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

const upload = multer({
  storage: multer.diskStorage({
    destination: photosDir,
    // The saved extension is derived only from the validated mimetype, never
    // from the client-supplied `originalname` — otherwise a request can
    // declare Content-Type: image/png while naming the file "x.html" and get
    // an attacker-controlled file saved (and served) as text/html.
    filename: (_req, file, cb) => cb(null, `${randomUUID()}${ALLOWED_PHOTO_TYPES[file.mimetype] ?? ''}`),
  }),
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!(file.mimetype in ALLOWED_PHOTO_TYPES)) {
      cb(new Error('Please upload a JPEG, PNG, WebP, or GIF image.'));
      return;
    }
    cb(null, true);
  },
});

function uploadPhoto(req: Request, res: Response, next: NextFunction): void {
  upload.single('photo')(req, res, (err: unknown) => {
    if (err) {
      const message = err instanceof Error ? err.message : 'Invalid photo upload.';
      res.status(400).json({ error: message });
      return;
    }
    next();
  });
}

const submissionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many submissions from this device. Please try again later.' },
});

// Only wrong-password attempts (status >= 400) count against this limit, so
// a legitimate admin clicking through several approvals never gets locked out.
const adminAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many failed attempts. Please try again later.' },
});

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const adminPassword = process.env['ADMIN_PASSWORD'];
  const providedPassword = req.header('x-admin-password');

  if (!adminPassword || providedPassword !== adminPassword) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  next();
}

const MAX_LENGTHS = { name: 80, title: 100, quote: 500 };

app.post('/api/testimonials', submissionLimiter, uploadPhoto, (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
  const quote = typeof req.body?.quote === 'string' ? req.body.quote.trim() : '';

  const rejectWith = (message: string) => {
    if (req.file) {
      unlinkSync(req.file.path);
    }
    res.status(400).json({ error: message });
  };

  if (!name || !quote) {
    rejectWith('Name and quote are required.');
    return;
  }

  if (name.length > MAX_LENGTHS.name || title.length > MAX_LENGTHS.title || quote.length > MAX_LENGTHS.quote) {
    rejectWith('One or more fields exceed the maximum length.');
    return;
  }

  if (containsProfanity(name, title, quote)) {
    rejectWith('Please remove any profanity or harmful language and try again.');
    return;
  }

  if (isDuplicateQuote(quote)) {
    rejectWith('This testimonial has already been submitted.');
    return;
  }

  const entry = addPending({ name, title, quote, photoFilename: req.file?.filename });
  void sendPendingTestimonialNotification(entry);
  res.status(201).json({ ok: true });
});

app.get('/api/testimonials', (_req, res) => {
  res.json(getApproved());
});

app.get('/api/testimonials/pending', adminAuthLimiter, requireAdmin, (_req, res) => {
  res.json(getPending());
});

app.post('/api/testimonials/:id/approve', adminAuthLimiter, requireAdmin, (req, res) => {
  const result = approve(String(req.params['id']));
  if (!result) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json(result);
});

app.post('/api/testimonials/:id/reject', adminAuthLimiter, requireAdmin, (req, res) => {
  const result = reject(String(req.params['id']));
  if (!result) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json({ ok: true });
});

app.delete('/api/testimonials/approved/:id', adminAuthLimiter, requireAdmin, (req, res) => {
  const result = removeApproved(String(req.params['id']));
  if (!result) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json({ ok: true });
});

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
