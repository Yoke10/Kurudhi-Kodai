"use client";

import React, { useState, useEffect } from 'react';
import { Eye, Mail, Phone, User, Calendar, Shield, MessageCircle, CheckCircle, AlertCircle } from 'lucide-react';
import { doc, updateDoc, onSnapshot, collection, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { isAdminRole } from '@/lib/roles';
import Navbar from '@/components/Navbar';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { toast } from 'react-hot-toast';

export default function SupportPage() {
  const { user, userRole, loading: authLoading } = useAuth();
  const [supportRequests, setSupportRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [updating, setUpdating] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const isAdmin = isAdminRole(userRole);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      // If admin, load all tickets; if normal user, only load their own tickets
      let q;
      if (isAdmin) {
        q = collection(db, 'support');
      } else {
        q = query(collection(db, 'support'), where('createdByUid', '==', user.uid));
      }

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const requests = snapshot.docs.map(d => ({
          id: d.id,
          ...d.data(),
        }));

        // Sort by creation date descending
        requests.sort((a, b) => {
          const tA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : (a.CreatedAt ? new Date(a.CreatedAt).getTime() : 0);
          const tB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : (b.CreatedAt ? new Date(b.CreatedAt).getTime() : 0);
          return tB - tA;
        });

        setSupportRequests(requests);
        setLoading(false);
      }, (err) => {
        console.error('Error in support tickets listener:', err);
        setError(err.message);
        setLoading(false);
      });

      return () => unsubscribe();
    } catch (err) {
      console.error('Error setting up listener:', err);
      setError(err.message);
      setLoading(false);
    }
  }, [user, userRole, authLoading, isAdmin]);

  const handleMarkAsResolved = async (requestId) => {
    if (!isAdmin) return;
    setUpdating(true);
    try {
      const requestRef = doc(db, 'support', requestId);
      await updateDoc(requestRef, {
        Status: 'resolved',
        status: 'resolved',
        UpdatedAt: new Date().toISOString(),
      });

      if (selectedRequest && selectedRequest.id === requestId) {
        setSelectedRequest(prev => ({
          ...prev,
          Status: 'resolved',
          status: 'resolved',
        }));
      }
      toast.success('Support ticket marked as resolved.');
    } catch (err) {
      console.error('Error updating support request:', err);
      toast.error('Failed to update status. Please try again.');
    } finally {
      setUpdating(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-red-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="bg-white p-8 rounded-2xl shadow-md border border-gray-200 max-w-md w-full text-center">
            <Shield className="w-12 h-12 text-red-600 mx-auto mb-3" />
            <h2 className="text-xl font-bold text-gray-800">Support Portal</h2>
            <p className="text-sm text-gray-500 mt-2 mb-6">
              Please sign in to view and track your support tickets.
            </p>
            <Link href="/signin">
              <Button className="w-full bg-red-600 hover:bg-red-700 text-white font-bold">
                Sign In
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-6xl mx-auto px-4 py-8 w-full">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-black text-gray-900">
              {isAdmin ? 'Support Ticket Management' : 'My Support Inquiries'}
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">
              {isAdmin ? 'Review and resolve reported platform inquiries' : 'Track responses to questions and assistance requests'}
            </p>
          </div>

          <Link href="/contact">
            <Button className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow-sm">
              Contact Support
            </Button>
          </Link>
        </div>

        {supportRequests.length > 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden divide-y divide-gray-100">
            {supportRequests.map(ticket => {
              const status = (ticket.status || ticket.Status || 'pending').toLowerCase();
              const isResolved = status === 'resolved';

              return (
                <div key={ticket.id} className="p-4 hover:bg-gray-50 transition-colors flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-gray-900 text-sm">
                        {ticket.Subject || ticket.subject || 'General Inquiry'}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                        isResolved ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {status}
                      </span>
                    </div>

                    <p className="text-xs text-gray-600 leading-relaxed max-w-2xl">
                      {ticket.Message || ticket.message}
                    </p>

                    <div className="flex items-center gap-4 text-[11px] text-gray-400 pt-1">
                      <span>Sender: <strong>{ticket.Name || ticket.name}</strong> ({ticket.Email || ticket.email})</span>
                      {ticket.Phone && <span>Phone: {ticket.Phone}</span>}
                    </div>
                  </div>

                  {isAdmin && !isResolved && (
                    <Button
                      size="sm"
                      onClick={() => handleMarkAsResolved(ticket.id)}
                      disabled={updating}
                      className="bg-green-600 hover:bg-green-700 text-white text-xs font-bold"
                    >
                      Mark Resolved
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center text-gray-500">
            <MessageCircle className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <h3 className="font-bold text-gray-800 text-base">No support tickets found</h3>
            <p className="text-xs text-gray-500 mt-1">If you need help, feel free to contact our support team.</p>
          </div>
        )}
      </main>
    </div>
  );
}