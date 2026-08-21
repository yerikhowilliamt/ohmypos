import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merges conditional class names, letting later Tailwind utilities win over
 * conflicting earlier ones. This is the helper every shadcn/ui component
 * expects to import, so it lives here rather than in `apps/web`.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
