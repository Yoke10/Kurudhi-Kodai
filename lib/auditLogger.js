/**
 * KURUDHI KODAI — Immutable Audit Logging Service
 */

import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase.js';

export const AUDIT_ACTIONS = {
  REQUEST_CREATED: 'REQUEST_CREATED',
  REQUEST_VERIFIED: 'REQUEST_VERIFIED',
  REQUEST_REJECTED: 'REQUEST_REJECTED',
  REQUEST_CANCELLED: 'REQUEST_CANCELLED',
  DONOR_ACCEPTED: 'DONOR_ACCEPTED',
  DONOR_REJECTED: 'DONOR_REJECTED',
  DONATION_STARTED: 'DONATION_STARTED',
  OTP_VERIFIED: 'OTP_VERIFIED',
  DONATION_COMPLETED: 'DONATION_COMPLETED',
  DONATION_CANCELLED: 'DONATION_CANCELLED',
  ADMIN_ACTION: 'ADMIN_ACTION',
  ROLE_CHANGED: 'ROLE_CHANGED',
};

/**
 * Appends an immutable audit log entry.
 *
 * @param {object} params
 * @param {string} params.action - One of AUDIT_ACTIONS
 * @param {string} params.actorUid - Authenticated user UID performing the action
 * @param {string} [params.actorRole] - Role of the actor
 * @param {string} params.entityType - 'request' | 'donation' | 'user' | 'camp' | 'support'
 * @param {string} params.entityId - Document ID affected
 * @param {object} [params.metadata] - Extra context (e.g. reason, city, oldRole, newRole)
 */
export async function logAuditEvent({
  action,
  actorUid,
  actorRole = 'user',
  entityType,
  entityId,
  metadata = {},
}) {
  try {
    const logData = {
      action: action || AUDIT_ACTIONS.ADMIN_ACTION,
      actorUid: actorUid || 'system',
      actorRole: actorRole || 'user',
      entityType: entityType || 'general',
      entityId: entityId || '',
      metadata: metadata || {},
      timestamp: serverTimestamp(),
    };

    await addDoc(collection(db, 'auditLogs'), logData);
  } catch (error) {
    // Audit log write failure should be reported but not break the primary user flow
    console.warn('Failed to record audit log:', error);
  }
}
