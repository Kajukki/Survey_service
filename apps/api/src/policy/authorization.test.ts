/**
 * Tests for authorization policy enforcement.
 */
import { describe, it, expect } from 'vitest'
import type { Principal } from '../server/types'
import {
  AccessLevel,
  isOwner,
  canRead,
  canEdit,
  canShare,
  enforceAccess,
  visibilityPredicate,
} from './authorization'
import { ForbiddenError } from '../server/errors'

const mockPrincipal: Principal = {
  userId: 'user-123',
  orgId: 'org-456',
}

const ownerId = 'user-123'
const otherId = 'user-999'

describe('Authorization Policy', () => {
  describe('isOwner', () => {
    it('should return true if principal is owner', () => {
      expect(isOwner(mockPrincipal, ownerId)).toBe(true)
    })

    it('should return false if principal is not owner', () => {
      expect(isOwner(mockPrincipal, otherId)).toBe(false)
    })
  })

  describe('canRead', () => {
    it('should allow read for owner', () => {
      expect(canRead(mockPrincipal, ownerId)).toBe(true)
    })

    it('should deny read for non-owner', () => {
      expect(canRead(mockPrincipal, otherId)).toBe(false)
    })
  })

  describe('canEdit', () => {
    it('should allow edit for owner', () => {
      expect(canEdit(mockPrincipal, ownerId)).toBe(true)
    })

    it('should deny edit for non-owner', () => {
      expect(canEdit(mockPrincipal, otherId)).toBe(false)
    })
  })

  describe('canShare', () => {
    it('should allow share for owner', () => {
      expect(canShare(mockPrincipal, ownerId)).toBe(true)
    })

    it('should deny share for non-owner', () => {
      expect(canShare(mockPrincipal, otherId)).toBe(false)
    })
  })

  describe('enforceAccess', () => {
    it('should allow read access for owner', () => {
      expect(() => {
        enforceAccess(mockPrincipal, ownerId, AccessLevel.READ, 'Form')
      }).not.toThrow()
    })

    it('should throw ForbiddenError for read on non-owner resource', () => {
      expect(() => {
        enforceAccess(mockPrincipal, otherId, AccessLevel.READ, 'Form')
      }).toThrow(ForbiddenError)
    })

    it('should throw ForbiddenError for write on non-owner resource', () => {
      expect(() => {
        enforceAccess(mockPrincipal, otherId, AccessLevel.WRITE, 'Form')
      }).toThrow(ForbiddenError)
    })

    it('should throw ForbiddenError for admin on non-owner resource', () => {
      expect(() => {
        enforceAccess(mockPrincipal, otherId, AccessLevel.ADMIN, 'Form')
      }).toThrow(ForbiddenError)
    })

    it('should throw ForbiddenError for NONE access level', () => {
      expect(() => {
        enforceAccess(mockPrincipal, ownerId, AccessLevel.NONE, 'Form')
      }).toThrow(ForbiddenError)
    })

    it('should include resource type in error message', () => {
      expect(() => {
        enforceAccess(mockPrincipal, otherId, AccessLevel.READ, 'Connection')
      }).toThrow('Connection')
    })
  })

  describe('visibilityPredicate', () => {
    it('should return predicate with user ID', () => {
      const predicate = visibilityPredicate(mockPrincipal)

      expect(predicate.ownerId).toBe(mockPrincipal.userId)
    })
  })
})
