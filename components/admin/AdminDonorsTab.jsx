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
import exportToExcel from '@/utils/exportToExcel';
import { calculateDonorCooldown } from '@/lib/matchingEngine';
import { Download, Phone, MapPin, Droplet, User, ShieldCheck } from 'lucide-react';

function formatDate(val) {
  if (!val) return 'Never recorded';
  try {
    const d = val?.toDate ? val.toDate() : (val instanceof Date ? val : new Date(val));
    if (isNaN(d.getTime())) return 'Never recorded';
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch (_) {
    return 'Never recorded';
  }
}

export default function AdminDonorsTab({
  donors = [],
  isLoading = false,
  assignedCity = '',
}) {
  const [bloodGroupFilter, setBloodGroupFilter] = useState('all');
  const [availabilityFilter, setAvailabilityFilter] = useState('all');

  const filteredDonors = useMemo(() => {
    return donors.filter((d) => {
      const bg = (d.bloodGroup || d.BloodGroup || '').trim();
      const isAvailable = d.availabilityStatus !== 'COOLDOWN' && d.availability !== false && d.status !== 'inactive';

      if (bloodGroupFilter !== 'all' && bg !== bloodGroupFilter) return false;
      if (availabilityFilter === 'AVAILABLE' && !isAvailable) return false;
      if (availabilityFilter === 'COOLDOWN' && isAvailable) return false;

      return true;
    });
  }, [donors, bloodGroupFilter, availabilityFilter]);

  const handleExport = () => {
    if (!filteredDonors.length) return;
    const exportData = filteredDonors.map((d) => ({
      Name: d.name || d.Name || 'Anonymous',
      BloodGroup: d.bloodGroup || d.BloodGroup,
      Mobile: d.mobile || d.phone || d.Mobile,
      City: d.city || d.City,
      Area: d.area || d.Area || '—',
      Status: d.availabilityStatus || 'Active',
      LastDonation: formatDate(d.lastDonationAt || d.lastDonationDate),
    }));
    exportToExcel(exportData, `Kurudhi_Donors_${assignedCity || 'Directory'}.xlsx`);
  };

  const columns = [
    {
      key: 'name',
      header: 'Donor Name',
      sortable: true,
      render: (row) => (
        <div>
          <span className="font-bold text-gray-900 block">{row.name || row.Name || 'Donor'}</span>
          <span className="text-[11px] text-gray-400">{row.gender || '—'}</span>
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
      key: 'location',
      header: 'Location',
      render: (row) => (
        <div>
          <span className="font-medium text-gray-800 block">{row.city || row.City}</span>
          {row.area && <span className="text-[11px] text-gray-400">{row.area}</span>}
        </div>
      ),
    },
    {
      key: 'contact',
      header: 'Contact Info',
      render: (row) => {
        const phone = row.mobile || row.phone || row.Mobile;
        return phone ? (
          <a href={`tel:${phone}`} className="text-blue-600 hover:underline font-semibold flex items-center gap-1 text-xs">
            <Phone className="w-3 h-3 text-gray-400" />
            {phone}
          </a>
        ) : (
          <span className="text-gray-400">—</span>
        );
      },
    },
    {
      key: 'availability',
      header: 'Status & Cooldown',
      render: (row) => {
        const { isEligible, remainingDays } = calculateDonorCooldown(row.lastDonationAt || row.lastDonationDate);
        if (!isEligible) {
          return (
            <span className="inline-flex items-center text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full font-medium text-[11px] border border-amber-200">
              Cooldown ({remainingDays}d)
            </span>
          );
        }
        return (
          <span className="inline-flex items-center text-green-700 bg-green-50 px-2 py-0.5 rounded-full font-medium text-[11px] border border-green-200">
            Available to Donate
          </span>
        );
      },
    },
    {
      key: 'lastDonation',
      header: 'Last Donation Date',
      render: (row) => (
        <span className="text-gray-500 text-xs">
          {formatDate(row.lastDonationAt || row.lastDonationDate)}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
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

          <Select value={availabilityFilter} onValueChange={setAvailabilityFilter}>
            <SelectTrigger className="h-9 w-[160px] text-xs rounded-xl bg-white">
              <SelectValue placeholder="Availability" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="AVAILABLE">Available Now</SelectItem>
              <SelectItem value="COOLDOWN">In Cooldown</SelectItem>
            </SelectContent>
          </Select>
        </div>

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
        data={filteredDonors}
        searchPlaceholder="Search donors by name, city, locality, or mobile..."
        pageSize={10}
        isLoading={isLoading}
        emptyMessage="No donors match your search or filter criteria."
      />
    </div>
  );
}
