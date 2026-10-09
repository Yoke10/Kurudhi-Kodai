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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import exportToExcel from '@/utils/exportToExcel';
import { Download, Eye, AlertTriangle, ShieldCheck, UserCheck, XCircle } from 'lucide-react';
import RequestDetailsModal from '@/components/admin/RequestDetailsModal';
import {
  isRequestActive,
  isRequestFullyCompleted,
  isRequestCancelled,
} from '@/lib/requestStateMachine';

function formatDate(val) {
  if (!val) return 'Date unavailable';
  try {
    const d = val?.toDate ? val.toDate() : (val instanceof Date ? val : new Date(val));
    if (isNaN(d.getTime())) return 'Date unavailable';
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch (_) {
    return 'Date unavailable';
  }
}

export default function AdminRequestsTab({
  requests = [],
  isLoading = false,
  onVerifyRequest,
  onRejectRequest,
  onToggleEmergency,
  onFetchDonorsForRequest,
  onFetchCancellationsForRequest,
}) {
  const [statusFilter, setStatusFilter] = useState('all');
  const [bloodGroupFilter, setBloodGroupFilter] = useState('all');
  const [urgencyFilter, setUrgencyFilter] = useState('all');
  const [selectedRequest, setSelectedRequest] = useState(null);

  // Modals for donors and cancellations
  const [donorsModalData, setDonorsModalData] = useState(null);
  const [cancellationsModalData, setCancellationsModalData] = useState(null);
  const [subLoading, setSubLoading] = useState(false);

  // Filter requests
  const filteredRequests = useMemo(() => {
    return requests.filter((req) => {
      const status = (req.status || 'PENDING').toUpperCase();
      const blood = (req.bloodGroup || req.BloodGroup || '').trim();
      const isEmerg = req.isEmergency || req.urgencyLevel === 'CRITICAL' || req.EmergencyLevel === 'high';

      if (statusFilter !== 'all') {
        if (statusFilter === 'PENDING' && status !== 'PENDING') return false;
        if (statusFilter === 'ONGOING' && !isRequestActive(req)) return false;
        if (statusFilter === 'FULFILLED' && !isRequestFullyCompleted(req)) return false;
        if (statusFilter === 'REJECTED' && !isRequestCancelled(req) && status !== 'REJECTED') return false;
      }

      if (bloodGroupFilter !== 'all' && blood !== bloodGroupFilter) return false;
      if (urgencyFilter === 'EMERGENCY' && !isEmerg) return false;
      if (urgencyFilter === 'STANDARD' && isEmerg) return false;

      return true;
    });
  }, [requests, statusFilter, bloodGroupFilter, urgencyFilter]);

  const handleExport = () => {
    if (!filteredRequests.length) return;
    const exportData = filteredRequests.map((r) => ({
      ID: r.id,
      Patient: r.patientName || r.PatientName,
      BloodGroup: r.bloodGroup || r.BloodGroup,
      UnitsNeeded: r.unitsNeeded || r.UnitsNeeded,
      UnitsDonated: r.unitsDonated || r.UnitsDonated || 0,
      Hospital: r.hospital || r.Hospital,
      City: r.city || r.City,
      AttenderName: r.attenderName || r.AttenderName,
      AttenderMobile: r.attenderMobile || r.AttenderMobile,
      Status: r.status,
      CreatedDate: formatDate(r.createdAt),
    }));
    exportToExcel(exportData, 'Kurudhi_Blood_Requests.xlsx');
  };

  const handleOpenDonors = async (req) => {
    if (!onFetchDonorsForRequest) return;
    setSubLoading(true);
    setDonorsModalData({ request: req, donors: [] });
    try {
      const donors = await onFetchDonorsForRequest(req.id);
      setDonorsModalData({ request: req, donors });
    } catch (err) {
      console.error('Error fetching donors:', err);
    } finally {
      setSubLoading(false);
    }
  };

  const handleOpenCancellations = async (req) => {
    if (!onFetchCancellationsForRequest) return;
    setSubLoading(true);
    setCancellationsModalData({ request: req, cancellations: [] });
    try {
      const cancellations = await onFetchCancellationsForRequest(req.id);
      setCancellationsModalData({ request: req, cancellations });
    } catch (err) {
      console.error('Error fetching cancellations:', err);
    } finally {
      setSubLoading(false);
    }
  };

  const columns = [
    {
      key: 'patientName',
      header: 'Patient / Ref',
      sortable: true,
      render: (row) => (
        <div>
          <span className="font-bold text-gray-900 block">{row.patientName || row.PatientName}</span>
          <span className="text-[10px] text-gray-400 font-mono">ID: {row.id?.slice(0, 8)}...</span>
        </div>
      ),
    },
    {
      key: 'bloodGroup',
      header: 'Blood Group',
      sortable: true,
      render: (row) => (
        <span className="inline-block bg-red-50 text-red-700 font-extrabold px-2.5 py-0.5 rounded-lg border border-red-200 text-xs">
          {row.bloodGroup || row.BloodGroup}
        </span>
      ),
    },
    {
      key: 'unitsNeeded',
      header: 'Units',
      render: (row) => (
        <span className="font-semibold text-gray-700">
          {row.unitsDonated || row.UnitsDonated || 0} / {row.unitsNeeded || row.UnitsNeeded || 1}
        </span>
      ),
    },
    {
      key: 'hospital',
      header: 'Hospital & City',
      render: (row) => (
        <div className="max-w-[200px]">
          <span className="font-medium text-gray-800 block truncate">{row.hospital || row.Hospital}</span>
          <span className="text-[11px] text-gray-400">{row.city || row.City}</span>
        </div>
      ),
    },
    {
      key: 'urgency',
      header: 'Urgency',
      render: (row) => {
        const isEmerg = row.isEmergency || row.urgencyLevel === 'CRITICAL' || row.EmergencyLevel === 'high';
        return isEmerg ? <StatusBadge status="EMERGENCY" /> : <span className="text-gray-400 text-xs">Standard</span>;
      },
    },
    {
      key: 'status',
      header: 'Lifecycle Status',
      sortable: true,
      render: (row) => <StatusBadge status={row.status || 'PENDING'} />,
    },
    {
      key: 'createdAt',
      header: 'Created Date',
      sortable: true,
      render: (row) => <span className="text-gray-500 text-xs">{formatDate(row.createdAt)}</span>,
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (row) => (
        <Button
          size="sm"
          variant="ghost"
          onClick={(e) => {
            e.stopPropagation();
            setSelectedRequest(row);
          }}
          className="h-8 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 flex items-center gap-1 font-semibold"
        >
          <Eye className="w-3.5 h-3.5" />
          Manage
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Status Filter */}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-[150px] text-xs rounded-xl bg-white">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="PENDING">Pending Check</SelectItem>
              <SelectItem value="ONGOING">Ongoing / Matched</SelectItem>
              <SelectItem value="FULFILLED">Fulfilled</SelectItem>
              <SelectItem value="REJECTED">Rejected / Cancelled</SelectItem>
            </SelectContent>
          </Select>

          {/* Blood Group Filter */}
          <Select value={bloodGroupFilter} onValueChange={setBloodGroupFilter}>
            <SelectTrigger className="h-9 w-[130px] text-xs rounded-xl bg-white">
              <SelectValue placeholder="Blood Group" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Groups</SelectItem>
              {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((bg) => (
                <SelectItem key={bg} value={bg}>
                  {bg}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Urgency Filter */}
          <Select value={urgencyFilter} onValueChange={setUrgencyFilter}>
            <SelectTrigger className="h-9 w-[130px] text-xs rounded-xl bg-white">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priorities</SelectItem>
              <SelectItem value="EMERGENCY">Emergency Only</SelectItem>
              <SelectItem value="STANDARD">Standard</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Export Button */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          className="text-xs rounded-xl h-9 flex items-center gap-1.5 text-gray-700"
        >
          <Download className="w-3.5 h-3.5" />
          Export to Excel
        </Button>
      </div>

      {/* Main Table */}
      <DataTable
        columns={columns}
        data={filteredRequests}
        searchPlaceholder="Search by patient, hospital, city or ID..."
        pageSize={10}
        isLoading={isLoading}
        emptyMessage="No blood requests match your selected filters."
        onRowClick={(row) => setSelectedRequest(row)}
      />

      {/* Request Details & Action Modal */}
      {selectedRequest && (
        <RequestDetailsModal
          isOpen={Boolean(selectedRequest)}
          onClose={() => setSelectedRequest(null)}
          request={selectedRequest}
          onVerify={(id) => {
            onVerifyRequest && onVerifyRequest(id);
            setSelectedRequest(null);
          }}
          onReject={(id, reason) => {
            onRejectRequest && onRejectRequest(id, reason);
            setSelectedRequest(null);
          }}
          onToggleEmergency={(id, val) => {
            onToggleEmergency && onToggleEmergency(id, val);
            setSelectedRequest(null);
          }}
          onViewDonors={() => handleOpenDonors(selectedRequest)}
          onViewCancellations={() => handleOpenCancellations(selectedRequest)}
        />
      )}

      {/* Matched Donors Modal */}
      {donorsModalData && (
        <Dialog open={Boolean(donorsModalData)} onOpenChange={() => setDonorsModalData(null)}>
          <DialogContent className="max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <DialogHeader>
              <DialogTitle className="text-base font-bold text-gray-900 flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-green-600" />
                Matched Donors for {donorsModalData.request.patientName || 'Request'}
              </DialogTitle>
            </DialogHeader>
            <div className="py-3 text-xs space-y-2 max-h-[60vh] overflow-y-auto">
              {subLoading ? (
                <p className="text-center text-gray-400 py-6">Loading matched donors...</p>
              ) : donorsModalData.donors.length === 0 ? (
                <p className="text-center text-gray-500 py-6">No donors have pledged or matched yet.</p>
              ) : (
                donorsModalData.donors.map((d, i) => (
                  <div key={i} className="p-3 rounded-xl border border-gray-100 bg-gray-50 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-gray-800 block">{d.name || d.donorName || 'Donor'}</span>
                      <span className="text-[11px] text-gray-500">{d.mobile || d.phone || 'Contact restricted'}</span>
                    </div>
                    <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded border border-red-200">
                      {d.bloodGroup || d.donorBloodGroup || '—'}
                    </span>
                  </div>
                ))
              )}
            </div>
            <DialogFooter>
              <Button size="sm" variant="outline" onClick={() => setDonorsModalData(null)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Cancellations Modal */}
      {cancellationsModalData && (
        <Dialog open={Boolean(cancellationsModalData)} onOpenChange={() => setCancellationsModalData(null)}>
          <DialogContent className="max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <DialogHeader>
              <DialogTitle className="text-base font-bold text-gray-900 flex items-center gap-2">
                <XCircle className="w-5 h-5 text-red-600" />
                Cancellation History
              </DialogTitle>
            </DialogHeader>
            <div className="py-3 text-xs space-y-2 max-h-[60vh] overflow-y-auto">
              {subLoading ? (
                <p className="text-center text-gray-400 py-6">Loading cancellation history...</p>
              ) : cancellationsModalData.cancellations.length === 0 ? (
                <p className="text-center text-gray-500 py-6">No cancellations recorded for this request.</p>
              ) : (
                cancellationsModalData.cancellations.map((c, i) => (
                  <div key={i} className="p-3 rounded-xl border border-red-100 bg-red-50/50 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-red-900">{c.donorName || 'Donor Cancellation'}</span>
                      <span className="text-[10px] text-gray-400">{formatDate(c.cancelledAt || c.timestamp)}</span>
                    </div>
                    <p className="text-xs text-gray-700">Reason: {c.reason || 'None provided'}</p>
                  </div>
                ))
              )}
            </div>
            <DialogFooter>
              <Button size="sm" variant="outline" onClick={() => setCancellationsModalData(null)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
