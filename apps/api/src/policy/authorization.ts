/**
 * Authorization policy for resource ownership and sharing.
 */
import type { Principal } from '../server/types'
import { ForbiddenError } from '../server/errors'

/**
 * Resource access level.
 */
export enum AccessLevel {
  NONE = 'none',
  READ = 'read',
  WRITE = 'write',
  ADMIN = 'admin',
}

/**
 * Check if principal owns a resource.
 */
export function isOwner(principal: Principal, ownerId: string): boolean {
  return principal.userId === ownerId
}

/**
 * Check if principal has read access (owner or shared).
 * Actual share permission checking happens in repository via DB query.
 */
export function canRead(principal: Principal, ownerId: string): boolean {
  return isOwner(principal, ownerId)
}

/**
 * Check if principal can write/edit (owner only for now).
 */
export function canEdit(principal: Principal, ownerId: string): boolean {
  return isOwner(principal, ownerId)
}

/**
 * Check if principal can manage sharing (owner only).
 */
export function canShare(principal: Principal, ownerId: string): boolean {
  return isOwner(principal, ownerId)
}

/**
 * Enforce authorization check and throw if denied.
 */
export function enforceAccess(
  principal: Principal,
  ownerId: string,
  accessLevel: AccessLevel,
  resourceType: string = 'Resource'
): void {
  switch (accessLevel) {
    case AccessLevel.READ:
      if (!canRead(principal, ownerId)) {
        throw new ForbiddenError(`You do not have read access to this ${resourceType}`)
      }
      break

    case AccessLevel.WRITE:
      if (!canEdit(principal, ownerId)) {
        throw new ForbiddenError(`You do not have write access to this ${resourceType}`)
      }
      break

    case AccessLevel.ADMIN:
      if (!canShare(principal, ownerId)) {
        throw new ForbiddenError(
          `You do not have admin access to this ${resourceType}`
        )
      }
      break

    case AccessLevel.NONE:
      throw new ForbiddenError(`Access denied to ${resourceType}`)
  }
}

/**
 * Build a visibility predicate for list queries.
 * Returns SQL-friendly identifier for where clause.
 * Actual share checking must happen in the query builder.
 */
export function visibilityPredicate(principal: Principal): {
  ownerId: string
} {
  return {
    ownerId: principal.userId,
  }
}
