'use client';

import React, { useState } from 'react';
import DataTable from '@/components/ui/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import exportToExcel from '@/utils/exportToExcel';
import { Plus, Download, Calendar, MapPin, Building, Users } from 'lucide-react';

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

export default function AdminCampsTab({
  camps = [],
  isLoading = false,
  onCreateCamp,
  assignedCity = '',
}) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    organizer: '',
    venue: '',
    city: assignedCity || '',
    date: '',
    contactPerson: '',
    contactNumber: '',
    expectedDonors: '',
  });

  const handleExport = () => {
    if (!camps.length) return;
    const exportData = camps.map((c) => ({
      CampName: c.name || c.CampName,
      Organizer: c.organizer || c.Organizer,
      Venue: c.venue || c.Venue,
      City: c.city || c.City,
      Date: c.date || c.Date,
      Contact: c.contactNumber || c.ContactNumber,
    }));
    exportToExcel(exportData, 'Kurudhi_Blood_Camps.xlsx');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.venue.trim() || !formData.date) return;
    setIsSubmitting(true);
    try {
      await onCreateCamp(formData);
      setShowCreateModal(false);
      setFormData({
        name: '',
        organizer: '',
        venue: '',
        city: assignedCity || '',
        date: '',
        contactPerson: '',
        contactNumber: '',
        expectedDonors: '',
      });
    } catch (err) {
      console.error('Error creating camp:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const columns = [
    {
      key: 'name',
      header: 'Camp Name',
      sortable: true,
      render: (row) => (
        <div>
          <span className="font-bold text-gray-900 block">{row.name || row.CampName}</span>
          <span className="text-[11px] text-gray-500">{row.organizer || row.Organizer || 'Community Drive'}</span>
        </div>
      ),
    },
    {
      key: 'venue',
      header: 'Venue & Location',
      render: (row) => (
        <div>
          <span className="font-medium text-gray-800 block">{row.venue || row.Venue}</span>
          <span className="text-[11px] text-gray-400">{row.city || row.City}</span>
        </div>
      ),
    },
    {
      key: 'date',
      header: 'Event Date',
      sortable: true,
      render: (row) => (
        <span className="font-semibold text-gray-700">
          {row.date ? String(row.date) : formatDate(row.createdAt)}
        </span>
      ),
    },
    {
      key: 'contact',
      header: 'Contact Person',
      render: (row) => (
        <div>
          <span className="text-gray-800 block font-medium">{row.contactPerson || row.ContactPerson || 'Coordinator'}</span>
          <span className="text-[11px] text-gray-500">{row.contactNumber || row.ContactNumber || '—'}</span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => {
        const campDate = new Date(row.date);
        const isPast = !isNaN(campDate.getTime()) && campDate < new Date();
        return (
          <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold ${
            isPast ? 'bg-gray-100 text-gray-600' : 'bg-green-50 text-green-700 border border-green-200'
          }`}>
            {isPast ? 'Completed' : 'Upcoming'}
          </span>
        );
      },
    },
  ];

  return (
    <div className="space-y-4">
      {/* Top Controls */}
      <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex items-center justify-between gap-3">
        <h3 className="font-bold text-gray-900 text-sm">Blood Donation Camps</h3>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            className="text-xs rounded-xl h-9 flex items-center gap-1.5 text-gray-700"
          >
            <Download className="w-3.5 h-3.5" />
            Export
          </Button>
          <Button
            size="sm"
            onClick={() => setShowCreateModal(true)}
            className="bg-red-600 hover:bg-red-700 text-white text-xs rounded-xl h-9 flex items-center gap-1.5 font-bold shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Schedule Camp
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <DataTable
        columns={columns}
        data={camps}
        searchPlaceholder="Search camps by name, organizer, venue, or city..."
        pageSize={10}
        isLoading={isLoading}
        emptyMessage="No blood donation camps scheduled."
      />

      {/* Create Camp Modal */}
      {showCreateModal && (
        <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
          <DialogContent className="max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <DialogHeader>
              <DialogTitle className="text-base font-bold text-gray-900 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-red-600" />
                Schedule New Blood Camp
              </DialogTitle>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-3.5 py-2 text-xs">
              <div>
                <Label className="text-xs font-semibold text-gray-700">Camp Name *</Label>
                <Input
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. City Lions Blood Donation Drive"
                  className="text-xs h-9 mt-1"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold text-gray-700">Organizer</Label>
                  <Input
                    value={formData.organizer}
                    onChange={(e) => setFormData({ ...formData, organizer: e.target.value })}
                    placeholder="e.g. Rotary Club"
                    className="text-xs h-9 mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-gray-700">City *</Label>
                  <Input
                    required
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    placeholder="City"
                    className="text-xs h-9 mt-1"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs font-semibold text-gray-700">Venue *</Label>
                <Input
                  required
                  value={formData.venue}
                  onChange={(e) => setFormData({ ...formData, venue: e.target.value })}
                  placeholder="e.g. Community Hall, Gandhi Road"
                  className="text-xs h-9 mt-1"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold text-gray-700">Event Date *</Label>
                  <Input
                    required
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="text-xs h-9 mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-gray-700">Expected Donors</Label>
                  <Input
                    type="number"
                    value={formData.expectedDonors}
                    onChange={(e) => setFormData({ ...formData, expectedDonors: e.target.value })}
                    placeholder="50"
                    className="text-xs h-9 mt-1"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold text-gray-700">Contact Person</Label>
                  <Input
                    value={formData.contactPerson}
                    onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
                    placeholder="Coordinator Name"
                    className="text-xs h-9 mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-gray-700">Contact Mobile</Label>
                  <Input
                    value={formData.contactNumber}
                    onChange={(e) => setFormData({ ...formData, contactNumber: e.target.value })}
                    placeholder="10-digit mobile"
                    className="text-xs h-9 mt-1"
                  />
                </div>
              </div>

              <DialogFooter className="pt-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isSubmitting}
                  className="bg-red-600 hover:bg-red-700 text-white font-bold"
                >
                  {isSubmitting ? 'Scheduling...' : 'Confirm Schedule'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
