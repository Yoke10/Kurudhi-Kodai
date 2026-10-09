'use client';

import React, { useState } from 'react';
import DataTable from '@/components/ui/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { ROLES, normalizeRole } from '@/lib/roles';
import { ShieldCheck, UserCheck, ShieldAlert, Edit, MapPin } from 'lucide-react';

const TAMIL_NADU_CITIES = [
  'Chennai', 'Coimbatore', 'Madurai', 'Tiruchirappalli', 'Salem', 'Tirunelveli',
  'Erode', 'Vellore', 'Thoothukudi', 'Dindigul', 'Thanjavur', 'Ranipet',
  'Sivakasi', 'Karur', 'Udhagamandalam', 'Hosur', 'Nagercoil', 'Kanchipuram',
  'Kumarapalayam', 'Karaikudi', 'Neyveli', 'Cuddalore', 'Kumbakonam', 'Tiruvannamalai'
];

export default function AdminUsersTab({
  users = [],
  currentUser = null,
  isLoading = false,
  onUpdateUserRole,
}) {
  const [editingUser, setEditingUser] = useState(null);
  const [targetRole, setTargetRole] = useState(ROLES.USER);
  const [assignedCity, setAssignedCity] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleOpenEdit = (userItem) => {
    setEditingUser(userItem);
    setTargetRole(normalizeRole(userItem.role));
    setAssignedCity(userItem.assignedCity || '');
    setErrorMsg('');
  };

  const handleSaveRole = async () => {
    if (!editingUser) return;
    setErrorMsg('');

    // Guard: Prevent demoting own current superadmin account
    if (editingUser.id === currentUser?.uid && targetRole !== ROLES.SUPERADMIN) {
      setErrorMsg('You cannot demote your own active SUPERADMIN account.');
      return;
    }

    // If role is ADMIN, assignedCity is required
    if (targetRole === ROLES.ADMIN && !assignedCity.trim()) {
      setErrorMsg('Please specify an assigned city for regional ADMINs.');
      return;
    }

    setIsSaving(true);
    try {
      await onUpdateUserRole(editingUser.id, targetRole, targetRole === ROLES.ADMIN ? assignedCity.trim() : '');
      setEditingUser(null);
    } catch (err) {
      console.error('Error updating role:', err);
      setErrorMsg(err.message || 'Failed to update user role.');
    } finally {
      setIsSaving(false);
    }
  };

  const columns = [
    {
      key: 'email',
      header: 'User Email / UID',
      sortable: true,
      render: (row) => (
        <div>
          <span className="font-bold text-gray-900 block">{row.email || 'No email registered'}</span>
          <span className="text-[10px] text-gray-400 font-mono">UID: {row.id}</span>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'System Role',
      sortable: true,
      render: (row) => <StatusBadge status={normalizeRole(row.role)} />,
    },
    {
      key: 'assignedCity',
      header: 'Assigned City',
      render: (row) => (
        row.assignedCity ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-700 bg-gray-100 px-2.5 py-0.5 rounded-full">
            <MapPin className="w-3 h-3 text-red-500" />
            {row.assignedCity}
          </span>
        ) : (
          <span className="text-gray-400 text-xs">—</span>
        )
      ),
    },
    {
      key: 'capability',
      header: 'Capabilities',
      render: (row) => (
        <div className="flex items-center gap-1.5 flex-wrap">
          {row.isDonor && (
            <span className="bg-red-50 text-red-700 border border-red-200 text-[10px] font-bold px-2 py-0.5 rounded-full">
              Registered Donor
            </span>
          )}
          {row.emailVerified && (
            <span className="bg-green-50 text-green-700 border border-green-200 text-[10px] font-bold px-2 py-0.5 rounded-full">
              Email Verified
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (row) => (
        <Button
          size="sm"
          variant="outline"
          onClick={() => handleOpenEdit(row)}
          className="h-8 text-xs flex items-center gap-1"
        >
          <Edit className="w-3.5 h-3.5" />
          Edit Role
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {/* Informational Guidance */}
      <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
        <div className="text-xs text-gray-600 space-y-1">
          <span className="font-bold text-gray-900 block">
            Role & Capability Decoupling Invariant
          </span>
          <p>
            System roles (<code className="font-mono text-gray-800">USER</code>,{' '}
            <code className="font-mono text-gray-800">ADMIN</code>,{' '}
            <code className="font-mono text-gray-800">SUPERADMIN</code>) represent administrative authority.
            Donor registration creates a separate capability in <code className="font-mono text-gray-800">donors/{'{uid}'}</code> and never replaces an administrator's privileged role.
          </p>
        </div>
      </div>

      {/* Main Users Table */}
      <DataTable
        columns={columns}
        data={users}
        searchPlaceholder="Search users by email or UID..."
        pageSize={10}
        isLoading={isLoading}
        emptyMessage="No users found."
      />

      {/* Edit Role Dialog */}
      {editingUser && (
        <Dialog open={Boolean(editingUser)} onOpenChange={() => setEditingUser(null)}>
          <DialogContent className="max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <DialogHeader>
              <DialogTitle className="text-base font-bold text-gray-900 flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-red-600" />
                Modify User Privileges
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-2 text-xs">
              <div>
                <Label className="text-gray-500 block mb-1">Target Account:</Label>
                <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                  <span className="font-bold text-gray-800 block">{editingUser.email || 'No Email'}</span>
                  <span className="font-mono text-[10px] text-gray-400">UID: {editingUser.id}</span>
                </div>
              </div>

              <div>
                <Label className="font-semibold text-gray-700 block mb-1">Assign System Role *</Label>
                <Select value={targetRole} onValueChange={setTargetRole}>
                  <SelectTrigger className="h-9 text-xs rounded-xl bg-white">
                    <SelectValue placeholder="Select Role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ROLES.USER}>USER (Standard Requester/Donor)</SelectItem>
                    <SelectItem value={ROLES.ADMIN}>ADMIN (City Regional Operator)</SelectItem>
                    <SelectItem value={ROLES.SUPERADMIN}>SUPERADMIN (Full Platform Authority)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {targetRole === ROLES.ADMIN && (
                <div>
                  <Label className="font-semibold text-gray-700 block mb-1">Assigned City *</Label>
                  <Select value={assignedCity} onValueChange={setAssignedCity}>
                    <SelectTrigger className="h-9 text-xs rounded-xl bg-white">
                      <SelectValue placeholder="Select Tamil Nadu City" />
                    </SelectTrigger>
                    <SelectContent className="max-h-56">
                      {TAMIL_NADU_CITIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-gray-400 mt-1">
                    Admins are scoped to verify blood requests and manage donors in their assigned city.
                  </p>
                </div>
              )}

              {errorMsg && (
                <div className="bg-red-50 text-red-700 p-2.5 rounded-lg border border-red-200 text-xs font-semibold">
                  {errorMsg}
                </div>
              )}
            </div>

            <DialogFooter className="pt-3">
              <Button size="sm" variant="outline" onClick={() => setEditingUser(null)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSaveRole}
                disabled={isSaving}
                className="bg-red-600 hover:bg-red-700 text-white font-bold"
              >
                {isSaving ? 'Updating...' : 'Save Privileges'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
