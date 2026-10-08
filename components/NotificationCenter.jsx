'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  limit
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { markAllNotificationsAsRead, requestBrowserNotificationPermission } from '@/lib/notifications';
import { Bell, CheckCheck, Clock, ExternalLink, X, AlertCircle } from 'lucide-react';
import Link from 'next/link';

export default function NotificationCenter() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'unread'
  const [browserPerm, setBrowserPerm] = useState('default');

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setBrowserPerm(Notification.permission);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    const notifsRef = collection(db, 'notifications');
    const q = query(
      notifsRef,
      where('recipientUid', '==', user.uid),
      limit(30)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data(),
      }));

      // Sort client-side by createdAt descending to avoid composite index requirements
      list.sort((a, b) => {
        const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return timeB - timeA;
      });

      setNotifications(list);
      setUnreadCount(list.filter(n => !n.read).length);
    }, (err) => {
      console.warn('Notification listener note:', err.message);
    });

    return () => unsubscribe();
  }, [user]);

  const handleMarkAsRead = async (notifId) => {
    try {
      await updateDoc(doc(db, 'notifications', notifId), { read: true });
    } catch (err) {
      console.error('Error marking notification as read:', err);
    }
  };

  const handleMarkAll = async () => {
    if (!user) return;
    await markAllNotificationsAsRead(user.uid);
  };

  const handleEnablePush = async () => {
    const res = await requestBrowserNotificationPermission();
    setBrowserPerm(res);
  };

  const filteredNotifs = notifications.filter(n => {
    if (activeTab === 'unread') return !n.read;
    return true;
  });

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(prev => !prev)}
        className="relative p-2 text-white hover:bg-red-700/80 rounded-full transition-colors focus:outline-none"
        title="Notifications"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-amber-500 rounded-full shadow-md animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-3 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-gray-200 z-50 overflow-hidden text-gray-800 animate-in fade-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="p-4 bg-gradient-to-r from-red-600 to-red-700 text-white flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="w-5 h-5" />
              <h3 className="font-bold text-base">Notifications</h3>
              {unreadCount > 0 && (
                <span className="bg-white/20 text-white text-xs px-2 py-0.5 rounded-full font-semibold">
                  {unreadCount} new
                </span>
              )}
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 hover:bg-white/20 rounded-full transition-colors text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Browser Permission Banner (if not granted) */}
          {browserPerm === 'default' && (
            <div className="bg-amber-50 border-b border-amber-200 p-2.5 px-3 flex items-center justify-between text-xs text-amber-900">
              <span className="truncate pr-2">Enable desktop alerts for instant matches</span>
              <button
                onClick={handleEnablePush}
                className="bg-amber-600 hover:bg-amber-700 text-white px-2 py-1 rounded font-medium text-[11px] whitespace-nowrap shadow-sm"
              >
                Enable
              </button>
            </div>
          )}

          {/* Tab selector and Actions */}
          <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-2 text-xs">
            <div className="flex gap-2">
              <button
                onClick={() => setActiveTab('all')}
                className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                  activeTab === 'all' ? 'bg-red-600 text-white' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                All ({notifications.length})
              </button>
              <button
                onClick={() => setActiveTab('unread')}
                className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                  activeTab === 'unread' ? 'bg-red-600 text-white' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Unread ({unreadCount})
              </button>
            </div>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAll}
                className="text-red-600 hover:text-red-700 font-semibold flex items-center gap-1"
              >
                <CheckCheck className="w-3.5 h-3.5" /> Mark all read
              </button>
            )}
          </div>

          {/* Notifications List */}
          <div className="max-h-80 overflow-y-auto divide-y divide-gray-100">
            {filteredNotifs.length > 0 ? (
              filteredNotifs.map(notif => (
                <div
                  key={notif.id}
                  onClick={() => !notif.read && handleMarkAsRead(notif.id)}
                  className={`p-3.5 transition-colors cursor-pointer text-xs ${
                    notif.read ? 'bg-white hover:bg-gray-50' : 'bg-red-50/60 hover:bg-red-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-gray-900 text-sm">
                      {notif.title}
                    </p>
                    {!notif.read && (
                      <span className="w-2 h-2 rounded-full bg-red-600 flex-shrink-0 mt-1" />
                    )}
                  </div>
                  <p className="text-gray-600 mt-1 leading-relaxed">
                    {notif.message}
                  </p>
                  <div className="flex items-center justify-between mt-2 pt-1 text-[11px] text-gray-400">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {notif.createdAt?.toDate
                        ? notif.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        : 'Just now'}
                    </span>
                    {notif.requestId && (
                      <Link
                        href={`/dashboard#${notif.requestId}`}
                        onClick={() => setIsOpen(false)}
                        className="text-red-600 hover:underline flex items-center gap-1 font-semibold"
                      >
                        View Request <ExternalLink className="w-3 h-3" />
                      </Link>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-gray-400 text-xs">
                <AlertCircle className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p>No {activeTab === 'unread' ? 'unread ' : ''}notifications.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
