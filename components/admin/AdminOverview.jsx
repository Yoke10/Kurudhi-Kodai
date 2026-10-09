'use client';

import React from 'react';
import {
  Droplets,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Users,
  HeartHandshake,
  Calendar,
  XCircle,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';

export default function AdminOverview({
  stats = {},
  assignedCity = '',
  onNavigateTab,
}) {
  const kpis = [
    {
      title: 'Active Requests',
      value: stats.activeRequests ?? stats.currentRequests ?? 0,
      description: 'Requests currently seeking donors',
      icon: Droplets,
      color: 'text-red-600',
      bgColor: 'bg-red-50',
      tab: 'requests',
    },
    {
      title: 'Critical Emergency',
      value: stats.emergencyRequests ?? 0,
      description: 'Marked high or critical priority',
      icon: AlertTriangle,
      color: 'text-rose-700',
      bgColor: 'bg-rose-50',
      tab: 'requests',
    },
    {
      title: 'Awaiting Verification',
      value: stats.pendingVerification ?? 0,
      description: 'Newly received, needs admin check',
      icon: Clock,
      color: 'text-amber-600',
      bgColor: 'bg-amber-50',
      tab: 'requests',
    },
    {
      title: 'Completed Donations',
      value: stats.completedDonations ?? 0,
      description: 'Dual-OTP confirmed donations',
      icon: CheckCircle2,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-50',
      tab: 'donations',
    },
    {
      title: 'Awaiting Dual OTP',
      value: stats.pendingDualOtp ?? 0,
      description: 'Pledged, verification in progress',
      icon: HeartHandshake,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      tab: 'donations',
    },
    {
      title: 'Registered Donors',
      value: stats.totalDonors ?? 0,
      description: assignedCity ? `Donors in ${assignedCity}` : 'Active community donors',
      icon: Users,
      color: 'text-indigo-600',
      bgColor: 'bg-indigo-50',
      tab: 'donors',
    },
    {
      title: 'Upcoming Camps',
      value: stats.upcomingCamps ?? 0,
      description: 'Scheduled blood donation camps',
      icon: Calendar,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
      tab: 'camps',
    },
    {
      title: 'Rejected / Cancelled',
      value: stats.rejectedRequests ?? 0,
      description: 'Non-fulfilled historical requests',
      icon: XCircle,
      color: 'text-gray-500',
      bgColor: 'bg-gray-100',
      tab: 'requests',
    },
  ];

  return (
    <div className="space-y-6">
      {/* City Banner if Regional Admin */}
      {assignedCity && (
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-extrabold text-gray-900">
              Regional Operations Dashboard — {assignedCity}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Metrics and actions scoped strictly to blood requests and registered donors in {assignedCity}.
            </p>
          </div>
          <span className="bg-red-50 text-red-700 text-xs font-bold px-3 py-1 rounded-full border border-red-200">
            Regional Scope Active
          </span>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div
              key={kpi.title}
              onClick={() => onNavigateTab && onNavigateTab(kpi.tab)}
              className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-500">{kpi.title}</span>
                <div className={`w-9 h-9 rounded-xl ${kpi.bgColor} flex items-center justify-center transition-transform group-hover:scale-105`}>
                  <Icon className={`w-5 h-5 ${kpi.color}`} />
                </div>
              </div>
              <div className="mt-3">
                <span className="text-2xl font-black text-gray-900 tracking-tight">
                  {kpi.value}
                </span>
                <p className="text-[11px] text-gray-400 mt-0.5 font-medium">
                  {kpi.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick Workflow Guidance */}
      <div className="bg-gradient-to-r from-red-50 via-white to-amber-50 border border-red-100 rounded-2xl p-5 shadow-sm">
        <h3 className="text-xs font-extrabold text-gray-900 uppercase tracking-wider flex items-center gap-2 mb-2">
          <ShieldCheck className="w-4 h-4 text-red-600" />
          Coordination & Safety Invariants
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-gray-600">
          <div className="bg-white/80 p-3 rounded-xl border border-gray-100">
            <strong className="text-gray-900 block mb-1">Dual-OTP Verification:</strong>
            Donations complete ONLY when both parties verify on-site codes. Administrators cannot manually force completion.
          </div>
          <div className="bg-white/80 p-3 rounded-xl border border-gray-100">
            <strong className="text-gray-900 block mb-1">Donor PII Privacy:</strong>
            Donor phone numbers and emails are protected and only shown to authorized admins and matched attenders.
          </div>
          <div className="bg-white/80 p-3 rounded-xl border border-gray-100">
            <strong className="text-gray-900 block mb-1">Audit Trail:</strong>
            All verification, cancellation, and role-change events are automatically recorded in an immutable audit log.
          </div>
        </div>
      </div>
    </div>
  );
}
