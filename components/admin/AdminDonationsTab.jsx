'use client';

import React, { useState, useMemo } from 'react';
import DataTable from '@/components/ui/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getPartyOtpStatus } from '@/lib/otpService';
import DonationDetailsModal from '@/components/admin/DonationDetailsModal';
import {
  isDonationActive,
  isDonationCompleted,
  isDonationCancelled,
} from '@/lib/donationStateMachine';
import { Eye, Shield, CheckCircle2, Clock, Droplet } from 'lucide-react';

function formatDate(val) {
  if (!val) return 'Date unavailable';
  try {
    const d = val?.toDate ? val.toDate() : (val instanceof Date ? val : new Date(val));
    if (isNaN(d.getTime())) return 'Date unavailable';
    return d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch (_) {
    return 'Date unavailable';
  }
}

export default function AdminDonationsTab({
  donations = [],
  requestsMap = {},
  isLoading = false,
}) {
  const [statusFilter, setStatusFilter] = useState('all');
  const [verificationStageFilter, setVerificationStageFilter] = useState('all');
  const [selectedDonation, setSelectedDonation] = useState(null);

  const filteredDonations = useMemo(() => {
    return donations.filter((d) => {
      const status = (d.status || 'OTP_PENDING').toUpperCase();
      const donorVer = d.donorOtpVerified === true;
      const reqVer = d.requesterOtpVerified === true;

      if (statusFilter !== 'all') {
        if (statusFilter === 'COMPLETED' && !isDonationCompleted(d)) return false;
        if (statusFilter === 'PENDING' && !isDonationActive(d)) return false;
        if (statusFilter === 'CANCELLED' && !isDonationCancelled(d)) return false;
      }

      if (verificationStageFilter !== 'all') {
        if (verificationStageFilter === 'BOTH_VERIFIED' && (!donorVer || !reqVer)) return false;
        if (verificationStageFilter === 'PARTIAL' && ((donorVer && reqVer) || (!donorVer && !reqVer))) return false;
        if (verificationStageFilter === 'NONE' && (donorVer || reqVer)) return false;
      }

      return true;
    });
  }, [donations, statusFilter, verificationStageFilter]);

  const columns = [
    {
      key: 'id',
      header: 'Donation ID',
      sortable: true,
      render: (row) => (
        <div>
          <span className="font-mono text-gray-800 font-bold block">{row.id?.slice(0, 8)}...</span>
          <span className="text-[10px] text-gray-400 font-mono">Req: {row.requestId?.slice(0, 8)}...</span>
        </div>
      ),
    },
    {
      key: 'donorName',
      header: 'Donor',
      sortable: true,
      render: (row) => (
        <div>
          <span className="font-bold text-gray-900 block">{row.donorName || 'Donor'}</span>
          <span className="text-[11px] text-gray-400">{row.donorEmail || '—'}</span>
        </div>
      ),
    },
    {
      key: 'patient',
      header: 'Patient / Hospital',
      render: (row) => {
        const req = requestsMap[row.requestId];
        return (
          <div className="max-w-[180px]">
            <span className="font-semibold text-gray-800 block truncate">
              {req?.patientName || req?.PatientName || 'Patient'}
            </span>
            <span className="text-[11px] text-gray-400 truncate block">
              {req?.hospital || req?.Hospital || '—'}
            </span>
          </div>
        );
      },
    },
    {
      key: 'donorOtpStatus',
      header: 'Donor Code Status',
      render: (row) => {
        const st = getPartyOtpStatus(row, 'DONOR');
        return <StatusBadge status={st.state} />;
      },
    },
    {
      key: 'requesterOtpStatus',
      header: 'Requester Code Status',
      render: (row) => {
        const st = getPartyOtpStatus(row, 'REQUESTER');
        return <StatusBadge status={st.state} />;
      },
    },
    {
      key: 'status',
      header: 'Lifecycle Status',
      sortable: true,
      render: (row) => <StatusBadge status={row.status || 'OTP_PENDING'} />,
    },
    {
      key: 'completionDate',
      header: 'Completed At',
      render: (row) => (
        <span className={`text-xs ${row.completedAt ? 'font-semibold text-green-700' : 'text-gray-400'}`}>
          {formatDate(row.completedAt)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Action',
      render: (row) => (
        <Button
          size="sm"
          variant="ghost"
          onClick={(e) => {
            e.stopPropagation();
            setSelectedDonation(row);
          }}
          className="h-8 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 flex items-center gap-1 font-semibold"
        >
          <Eye className="w-3.5 h-3.5" />
          Inspect
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-[160px] text-xs rounded-xl bg-white">
              <SelectValue placeholder="Lifecycle Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Lifecycles</SelectItem>
              <SelectItem value="PENDING">In Progress (OTP Pending)</SelectItem>
              <SelectItem value="COMPLETED">Completed</SelectItem>
              <SelectItem value="CANCELLED">Cancelled</SelectItem>
            </SelectContent>
          </Select>

          <Select value={verificationStageFilter} onValueChange={setVerificationStageFilter}>
            <SelectTrigger className="h-9 w-[180px] text-xs rounded-xl bg-white">
              <SelectValue placeholder="Verification Stage" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Stages</SelectItem>
              <SelectItem value="BOTH_VERIFIED">Both Codes Verified</SelectItem>
              <SelectItem value="PARTIAL">1 of 2 Verified</SelectItem>
              <SelectItem value="NONE">0 of 2 Verified</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="text-xs text-gray-500 font-medium">
          Total Donations Tracked: <span className="font-bold text-gray-800">{filteredDonations.length}</span>
        </div>
      </div>

      {/* Main Table */}
      <DataTable
        columns={columns}
        data={filteredDonations}
        searchPlaceholder="Search by donor, donation ID, or request ID..."
        pageSize={10}
        isLoading={isLoading}
        emptyMessage="No donation records found matching criteria."
        onRowClick={(row) => setSelectedDonation(row)}
      />

      {/* Inspection Modal */}
      {selectedDonation && (
        <DonationDetailsModal
          isOpen={Boolean(selectedDonation)}
          onClose={() => setSelectedDonation(null)}
          donation={selectedDonation}
          request={requestsMap[selectedDonation.requestId]}
        />
      )}
    </div>
  );
}
