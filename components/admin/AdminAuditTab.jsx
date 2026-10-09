'use client';

import React from 'react';
import DataTable from '@/components/ui/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';
import { FileText, Clock, User, ShieldCheck } from 'lucide-react';

function formatDate(val) {
  if (!val) return 'Date unavailable';
  try {
    const d = val?.toDate ? val.toDate() : (val instanceof Date ? val : new Date(val));
    if (isNaN(d.getTime())) return 'Date unavailable';
    return d.toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch (_) {
    return 'Date unavailable';
  }
}

export default function AdminAuditTab({
  auditLogs = [],
  isLoading = false,
}) {
  const columns = [
    {
      key: 'action',
      header: 'Audit Action',
      sortable: true,
      render: (row) => (
        <span className="font-mono text-xs font-bold text-gray-900 bg-gray-100 px-2 py-0.5 rounded border border-gray-200">
          {row.action}
        </span>
      ),
    },
    {
      key: 'entityType',
      header: 'Entity / ID',
      render: (row) => (
        <div>
          <span className="font-semibold text-gray-800 uppercase text-[11px] block">{row.entityType || '—'}</span>
          <span className="text-[10px] text-gray-400 font-mono">ID: {row.entityId?.slice(0, 12)}...</span>
        </div>
      ),
    },
    {
      key: 'actorUid',
      header: 'Actor UID',
      render: (row) => (
        <span className="font-mono text-xs text-gray-600">
          {row.actorUid ? `${row.actorUid.slice(0, 10)}...` : 'System / Anonymous'}
        </span>
      ),
    },
    {
      key: 'timestamp',
      header: 'Timestamp',
      sortable: true,
      render: (row) => (
        <span className="text-gray-500 text-xs">
          {formatDate(row.timestamp || row.createdAt)}
        </span>
      ),
    },
    {
      key: 'metadata',
      header: 'Audit Context',
      render: (row) => {
        if (!row.metadata || Object.keys(row.metadata).length === 0) {
          return <span className="text-gray-400 text-xs">—</span>;
        }
        return (
          <span className="text-[11px] text-gray-600 truncate max-w-xs block font-mono">
            {JSON.stringify(row.metadata)}
          </span>
        );
      },
    },
  ];

  return (
    <div className="space-y-4">
      {/* Information Header */}
      <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <FileText className="w-5 h-5 text-red-600" />
          <div>
            <h3 className="font-bold text-gray-900 text-sm">System Audit Trail</h3>
            <p className="text-xs text-gray-500">
              Append-only, immutable logs recording privileged lifecycle events.
            </p>
          </div>
        </div>
        <span className="text-xs text-gray-500 font-semibold">
          Total Recorded Events: {auditLogs.length}
        </span>
      </div>

      {/* Main Table */}
      <DataTable
        columns={columns}
        data={auditLogs}
        searchPlaceholder="Search audit events by action, entity ID, or actor..."
        pageSize={15}
        isLoading={isLoading}
        emptyMessage="No audit log events recorded."
      />
    </div>
  );
}
