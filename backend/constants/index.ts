import { fileURLToPath } from 'node:url';
import path from 'path';

// This file centralizes constants related to paths and environment variables for the Electron main process.

// __dirname is not available in ES modules, so we derive it from the current file's URL.
export const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Environment variables injected by Vite at build time
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];

// __dirname resolves to dist/backend/ at runtime (both dev and production)
export const RENDERER_DIST = path.join(__dirname, '..', 'frontend');

// Public folder path: project root's /public in dev, dist/frontend in production
export const VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(__dirname, '..', '..', 'public') : RENDERER_DIST;
