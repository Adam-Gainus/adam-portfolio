import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export interface Testimonial {
  id: string;
  name: string;
  title: string;
  quote: string;
  photoFilename?: string;
}

export interface PendingTestimonial extends Testimonial {
  submittedAt: string;
}

export interface ApprovedTestimonial extends Testimonial {
  approvedAt: string;
}

interface Store {
  pending: PendingTestimonial[];
  approved: ApprovedTestimonial[];
}

const dataDir = join(import.meta.dirname, 'data');
const dataFile = join(dataDir, 'testimonials.json');
export const photosDir = join(dataDir, 'photos');

function readStore(): Store {
  if (!existsSync(dataFile)) {
    return { pending: [], approved: [] };
  }
  const raw = readFileSync(dataFile, 'utf-8');
  return JSON.parse(raw) as Store;
}

function writeStore(store: Store): void {
  mkdirSync(dirname(dataFile), { recursive: true });
  writeFileSync(dataFile, JSON.stringify(store, null, 2), 'utf-8');
}

function deletePhoto(photoFilename: string | undefined): void {
  if (!photoFilename) {
    return;
  }
  const photoPath = join(photosDir, photoFilename);
  if (existsSync(photoPath)) {
    unlinkSync(photoPath);
  }
}

function normalizeQuote(quote: string): string {
  return quote.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function isDuplicateQuote(quote: string): boolean {
  const normalized = normalizeQuote(quote);
  const store = readStore();
  return [...store.pending, ...store.approved].some((entry) => normalizeQuote(entry.quote) === normalized);
}

export function getApproved(): ApprovedTestimonial[] {
  return [...readStore().approved].sort((a, b) => b.approvedAt.localeCompare(a.approvedAt));
}

export function getPending(): PendingTestimonial[] {
  return [...readStore().pending].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
}

export function addPending(entry: {
  name: string;
  title: string;
  quote: string;
  photoFilename?: string;
}): PendingTestimonial {
  const store = readStore();
  const pendingEntry: PendingTestimonial = {
    id: randomUUID(),
    name: entry.name,
    title: entry.title,
    quote: entry.quote,
    photoFilename: entry.photoFilename,
    submittedAt: new Date().toISOString(),
  };
  store.pending.push(pendingEntry);
  writeStore(store);
  return pendingEntry;
}

export function approve(id: string): ApprovedTestimonial | null {
  const store = readStore();
  const index = store.pending.findIndex((entry) => entry.id === id);
  if (index === -1) {
    return null;
  }
  const [pendingEntry] = store.pending.splice(index, 1);
  const approvedEntry: ApprovedTestimonial = {
    id: pendingEntry.id,
    name: pendingEntry.name,
    title: pendingEntry.title,
    quote: pendingEntry.quote,
    photoFilename: pendingEntry.photoFilename,
    approvedAt: new Date().toISOString(),
  };
  store.approved.push(approvedEntry);
  writeStore(store);
  return approvedEntry;
}

export function reject(id: string): boolean {
  const store = readStore();
  const index = store.pending.findIndex((entry) => entry.id === id);
  if (index === -1) {
    return false;
  }
  const [pendingEntry] = store.pending.splice(index, 1);
  deletePhoto(pendingEntry.photoFilename);
  writeStore(store);
  return true;
}

export function removeApproved(id: string): boolean {
  const store = readStore();
  const index = store.approved.findIndex((entry) => entry.id === id);
  if (index === -1) {
    return false;
  }
  const [approvedEntry] = store.approved.splice(index, 1);
  deletePhoto(approvedEntry.photoFilename);
  writeStore(store);
  return true;
}
