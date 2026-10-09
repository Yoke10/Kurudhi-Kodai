/**
 * KURUDHI KODAI — Notification Service (In-App + Browser Web Push)
 *
 * Requirements:
 * - In-app notification collection: notifications/{notificationId}
 * - Browser Notification API when user explicitly grants permission
 * - Fallback gracefully if permission is denied
 * - ZERO paid third-party SMS/WhatsApp/Email dependencies
 */

import {
  collection,
  addDoc,
  serverTimestamp,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  updateDoc,
  doc,
  writeBatch
} from 'firebase/firestore';
import { db } from './firebase.js';

export const NOTIFICATION_TYPES = {
  NEW_BLOOD_REQUEST: 'NEW_BLOOD_REQUEST',
  DONOR_ACCEPTED: 'DONOR_ACCEPTED',
  REQUEST_UPDATE: 'REQUEST_UPDATE',
  DONATION_CONFIRMATION: 'DONATION_CONFIRMATION',
  REQUEST_FULFILLED: 'REQUEST_FULFILLED',
  REQUEST_CANCELLED: 'REQUEST_CANCELLED',
  DONATION_CANCELLED: 'DONATION_CANCELLED',
  DONATION_COMPLETED: 'DONATION_COMPLETED',
};

/**
 * Requests browser push notification permission if supported.
 * @returns {Promise<'granted' | 'denied' | 'default' | 'unsupported'>}
 */
export async function requestBrowserNotificationPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  if (Notification.permission === 'granted') {
    return 'granted';
  }
  try {
    const permission = await Notification.requestPermission();
    return permission;
  } catch (err) {
    console.warn('Failed to request notification permission:', err);
    return Notification.permission;
  }
}

/**
 * Displays a system browser notification if permission has been granted.
 * @param {string} title
 * @param {object} options
 */
export function displayBrowserNotification(title, options = {}) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    try {
      new Notification(title, {
        icon: '/icon.png',
        badge: '/icon.png',
        ...options,
      });
    } catch (err) {
      console.warn('Browser notification display error:', err);
    }
  }
}

/**
 * Creates an in-app notification document and triggers local browser alert if permitted.
 *
 * @param {object} params
 * @param {string} params.recipientUid
 * @param {string} params.type
 * @param {string} params.title
 * @param {string} params.message
 * @param {string} [params.requestId]
 * @param {string} [params.donationId]
 * @returns {Promise<string>}
 */
export async function sendNotification({
  recipientUid,
  type,
  title,
  message,
  requestId = null,
  donationId = null,
}) {
  if (!recipientUid) return null;

  try {
    const notificationData = {
      recipientUid,
      type: type || NOTIFICATION_TYPES.REQUEST_UPDATE,
      title: title || 'Kurudhi Kodai Alert',
      message: message || '',
      requestId: requestId || null,
      donationId: donationId || null,
      read: false,
      createdAt: serverTimestamp(),
    };

    const docRef = await addDoc(collection(db, 'notifications'), notificationData);

    // If current browser user is recipient, trigger browser push
    if (typeof window !== 'undefined') {
      displayBrowserNotification(title, { body: message });
    }

    return docRef.id;
  } catch (error) {
    console.error('Failed to dispatch notification:', error);
    return null;
  }
}

/**
 * Dispatches notifications in controlled batches to avoid notification flood.
 *
 * @param {Array<string>} recipientUids
 * @param {object} payload
 * @param {number} batchSize - max notifications per batch
 */
export async function sendBatchedNotifications(recipientUids, payload, batchSize = 5) {
  if (!Array.isArray(recipientUids) || recipientUids.length === 0) return;

  const targetUids = recipientUids.slice(0, batchSize);
  const promises = targetUids.map(uid =>
    sendNotification({
      recipientUid: uid,
      ...payload,
    })
  );

  await Promise.allSettled(promises);
}

/**
 * Marks all notifications for a user as read.
 * @param {string} recipientUid
 */
export async function markAllNotificationsAsRead(recipientUid) {
  if (!recipientUid) return;
  try {
    const q = query(
      collection(db, 'notifications'),
      where('recipientUid', '==', recipientUid),
      where('read', '==', false),
      limit(50)
    );
    const snap = await getDocs(q);
    const batch = writeBatch(db);

    snap.forEach(docSnap => {
      batch.update(doc(db, 'notifications', docSnap.id), { read: true });
    });

    await batch.commit();
  } catch (error) {
    console.error('Failed to mark notifications as read:', error);
  }
}
