"use client";

import React from 'react';
import { CheckCircle2, Clock, AlertTriangle, XCircle, Shield, User, HeartHandshake } from 'lucide-react';

/**
 * Reusable Status Badge Component
 * Formats canonical states for requests, donations, OTPs, urgencies, and roles.
 */
export default function StatusBadge({ status, type = 'default', size = 'sm', className = '' }) {
  if (!status) return null;

  const s = String(status).toUpperCase();

  let bg = 'bg-slate-100 text-slate-700 border-slate-200';
  let Icon = Clock;
  let label = status;

  // 1. Roles
  if (type === 'role') {
    if (s === 'SUPERADMIN') {
      bg = 'bg-purple-100 text-purple-800 border-purple-200';
      Icon = Shield;
      label = 'Super Admin';
    } else if (s === 'ADMIN') {
      bg = 'bg-rose-100 text-rose-800 border-rose-200';
      Icon = Shield;
      label = 'City Admin';
    } else {
      bg = 'bg-slate-100 text-slate-700 border-slate-200';
      Icon = User;
      label = 'User';
    }
  }
  // 2. Dual-OTP Verification States
  else if (type === 'otp') {
    if (s === 'VERIFIED') {
      bg = 'bg-emerald-100 text-emerald-800 border-emerald-200';
      Icon = CheckCircle2;
      label = 'Verified';
    } else if (s === 'ACTIVE') {
      bg = 'bg-blue-100 text-blue-800 border-blue-200';
      Icon = Clock;
      label = 'Code Active';
    } else if (s === 'EXPIRED') {
      bg = 'bg-amber-100 text-amber-800 border-amber-200';
      Icon = Clock;
      label = 'Expired';
    } else if (s === 'LOCKED') {
      bg = 'bg-rose-100 text-rose-800 border-rose-200';
      Icon = AlertTriangle;
      label = 'Locked';
    } else {
      bg = 'bg-slate-100 text-slate-600 border-slate-200';
      Icon = Clock;
      label = 'Pending';
    }
  }
  // 3. Request Statuses
  else if (type === 'request') {
    if (s === 'FULFILLED' || s === 'COMPLETED') {
      bg = 'bg-emerald-100 text-emerald-800 border-emerald-200';
      Icon = CheckCircle2;
      label = 'Fulfilled';
    } else if (s === 'PARTIALLY_FULFILLED') {
      bg = 'bg-teal-100 text-teal-800 border-teal-200';
      Icon = HeartHandshake;
      label = 'Partially Fulfilled';
    } else if (s === 'ACTIVE' || s === 'ACCEPTED') {
      bg = 'bg-blue-100 text-blue-800 border-blue-200';
      Icon = Clock;
      label = 'Active Matching';
    } else if (s === 'SUBMITTED' || s === 'RECEIVED' || s === 'PENDING') {
      bg = 'bg-amber-100 text-amber-800 border-amber-200';
      Icon = Clock;
      label = 'Submitted';
    } else if (s === 'REJECTED') {
      bg = 'bg-rose-100 text-rose-800 border-rose-200';
      Icon = XCircle;
      label = 'Rejected';
    } else if (s === 'CANCELLED' || s === 'CANCELED') {
      bg = 'bg-slate-100 text-slate-600 border-slate-200';
      Icon = XCircle;
      label = 'Cancelled';
    } else if (s === 'EXPIRED') {
      bg = 'bg-amber-100 text-amber-800 border-amber-200';
      Icon = Clock;
      label = 'Expired';
    }
  }
  // 4. Donation Statuses
  else if (type === 'donation') {
    if (s === 'DONATION_COMPLETED' || s === 'COMPLETED') {
      bg = 'bg-emerald-100 text-emerald-800 border-emerald-200';
      Icon = CheckCircle2;
      label = 'Donation Completed';
    } else if (s === 'OTP_PENDING' || s === 'PENDING') {
      bg = 'bg-blue-100 text-blue-800 border-blue-200';
      Icon = Clock;
      label = 'Dual-OTP Verification';
    } else if (s === 'DONOR_ACCEPTED' || s === 'ACCEPTED') {
      bg = 'bg-teal-100 text-teal-800 border-teal-200';
      Icon = HeartHandshake;
      label = 'Pledge Accepted';
    } else if (s === 'CANCELLED') {
      bg = 'bg-slate-100 text-slate-600 border-slate-200';
      Icon = XCircle;
      label = 'Cancelled';
    }
  }
  // 5. Urgency
  else if (type === 'urgency') {
    if (s === 'CRITICAL' || s === 'HIGH' || s === 'EMERGENCY') {
      bg = 'bg-red-100 text-red-800 border-red-300 font-extrabold animate-pulse';
      Icon = AlertTriangle;
      label = 'Critical Emergency';
    } else if (s === 'URGENT') {
      bg = 'bg-amber-100 text-amber-800 border-amber-200 font-bold';
      Icon = Clock;
      label = 'Urgent (24h)';
    } else {
      bg = 'bg-slate-100 text-slate-700 border-slate-200';
      Icon = Clock;
      label = 'Routine';
    }
  }

  const sizeClasses = size === 'xs'
    ? 'px-2 py-0.5 text-[10px]'
    : size === 'md'
    ? 'px-3.5 py-1.5 text-sm'
    : 'px-2.5 py-1 text-xs';

  return (
    <span className={`inline-flex items-center gap-1.5 font-bold tracking-wide rounded-full border ${sizeClasses} ${bg} ${className}`}>
      <Icon className={size === 'xs' ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
      <span>{label}</span>
    </span>
  );
}
