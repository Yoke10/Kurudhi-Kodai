import { NextResponse } from 'next/server';
import { collection, getDocs, addDoc, serverTimestamp, query, orderBy, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export const dynamic = 'force-dynamic';

/**
 * GET /api/support
 * Protected support tickets retrieval
 */
export async function GET(request) {
  try {
    const authHeader = request.headers.get('authorization');

    // Reject unauthenticated requests
    if (!authHeader) {
      return NextResponse.json(
        { error: 'Unauthorized: Authentication required to inspect support inquiries.' },
        { status: 401 }
      );
    }

    // Limit returned documents for performance
    const supportCollection = collection(db, 'support');
    const q = query(supportCollection, limit(100));
    const supportSnapshot = await getDocs(q);
    const supportList = supportSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    return NextResponse.json(supportList);
  } catch (error) {
    console.error('Error fetching support requests:', error);
    return NextResponse.json({ message: 'Failed to fetch support requests' }, { status: 500 });
  }
}

/**
 * POST /api/support
 * Ticket submission
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { name, email, phone, subject, message, priority, userType, createdByUid } = body;

    if (!name || !email || !message) {
      return NextResponse.json(
        { error: 'Missing required support ticket fields (name, email, message).' },
        { status: 400 }
      );
    }

    const ticket = {
      name: name.trim(),
      email: email.trim(),
      phone: phone ? phone.trim() : '',
      subject: subject ? subject.trim() : 'General Inquiry',
      message: message.trim(),
      priority: priority || 'normal',
      userType: userType || 'user',
      createdByUid: createdByUid || null,
      status: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const docRef = await addDoc(collection(db, 'support'), ticket);
    return NextResponse.json({ success: true, ticketId: docRef.id });
  } catch (error) {
    console.error('Error submitting support ticket:', error);
    return NextResponse.json({ message: 'Failed to create support ticket' }, { status: 500 });
  }
}
