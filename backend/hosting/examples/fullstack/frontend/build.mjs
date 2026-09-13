// The example needs Node for its build, but has no npm dependencies.
import { cp, mkdir } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
await cp('src', 'dist', { recursive: true });
console.log('Full-stack frontend build completed.');
