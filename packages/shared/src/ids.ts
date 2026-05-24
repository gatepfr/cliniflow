import { createId as cuid2CreateId } from '@paralleldrive/cuid2';

/**
 * Generates a collision-resistant, URL-safe, monotonically sortable ID.
 * Uses @paralleldrive/cuid2 — NOT the deprecated `cuid` package.
 *
 * Use this for ALL entity IDs before Prisma insert operations.
 * The Prisma schema does NOT use @default() for IDs — IDs are app-generated.
 */
export function createId(): string {
  return cuid2CreateId();
}
