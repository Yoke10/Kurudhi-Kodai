'use client';

import React, { useState, useMemo } from 'react';
import { Search, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Inbox } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

/**
 * Reusable, responsive DataTable component with client-side search,
 * sorting, pagination, and a clean mobile-friendly card layout.
 *
 * @param {Array} columns - Array of { key, header, render?: (row) => node, sortable?: boolean }
 * @param {Array} data - Array of record objects
 * @param {string} searchKey - Optional field key to filter on with the search input
 * @param {string} searchPlaceholder - Placeholder text for search input
 * @param {number} pageSize - Number of rows per page (default 10)
 * @param {node} actions - Optional actions node (e.g. export buttons, filters) to place next to search
 * @param {boolean} isLoading - Loading state
 * @param {string} emptyMessage - Message when data is empty
 * @param {function} onRowClick - Optional click handler for row
 */
export default function DataTable({
  columns = [],
  data = [],
  searchKey = '',
  searchPlaceholder = 'Search records...',
  pageSize = 10,
  actions = null,
  isLoading = false,
  emptyMessage = 'No records found.',
  onRowClick = null,
  className = '',
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

  // Filter data based on search term
  const filteredData = useMemo(() => {
    if (!searchTerm.trim()) return data;
    const term = searchTerm.toLowerCase();

    return data.filter((row) => {
      if (searchKey && row[searchKey] !== undefined) {
        return String(row[searchKey]).toLowerCase().includes(term);
      }
      // If searchKey is not specified, search across all stringifiable values
      return Object.values(row).some((val) => {
        if (val === null || val === undefined) return false;
        if (typeof val === 'object') return false;
        return String(val).toLowerCase().includes(term);
      });
    });
  }, [data, searchTerm, searchKey]);

  // Sort data
  const sortedData = useMemo(() => {
    if (!sortConfig.key) return filteredData;

    return [...filteredData].sort((a, b) => {
      const aVal = a[sortConfig.key];
      const bVal = b[sortConfig.key];

      if (aVal === bVal) return 0;
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortConfig.direction === 'asc'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }

      return sortConfig.direction === 'asc'
        ? (aVal > bVal ? 1 : -1)
        : (aVal < bVal ? 1 : -1);
    });
  }, [filteredData, sortConfig]);

  // Pagination calculations
  const totalPages = Math.ceil(sortedData.length / pageSize) || 1;
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, currentPage, pageSize]);

  const handleSort = (key) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Top Bar: Search & Action buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            placeholder={searchPlaceholder}
            className="pl-9 h-9 text-xs rounded-xl border-gray-200 bg-white"
          />
        </div>
        {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-gray-600">
            <thead className="bg-gray-50 border-b border-gray-200 text-[11px] font-bold text-gray-700 uppercase tracking-wider">
              <tr>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    onClick={() => col.sortable && handleSort(col.key)}
                    className={`px-4 py-3 ${
                      col.sortable ? 'cursor-pointer select-none hover:bg-gray-100/70 transition-colors' : ''
                    } ${col.headerClassName || ''}`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>{col.header}</span>
                      {col.sortable && sortConfig.key === col.key && (
                        <span className="text-red-600 text-xs">
                          {sortConfig.direction === 'asc' ? '↑' : '↓'}
                        </span>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-12 text-center text-gray-400">
                    <div className="w-6 h-6 border-2 border-red-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    Loading records...
                  </td>
                </tr>
              ) : paginatedData.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-12 text-center text-gray-400">
                    <Inbox className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                paginatedData.map((row, index) => (
                  <tr
                    key={row.id || index}
                    onClick={() => onRowClick && onRowClick(row)}
                    className={`transition-colors hover:bg-red-50/20 ${
                      onRowClick ? 'cursor-pointer' : ''
                    }`}
                  >
                    {columns.map((col) => (
                      <td key={col.key} className={`px-4 py-3 align-middle ${col.cellClassName || ''}`}>
                        {col.render ? col.render(row) : row[col.key] ?? '—'}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Card View (shown on screens < 768px) */}
      <div className="block md:hidden space-y-3">
        {isLoading ? (
          <div className="p-8 text-center bg-white rounded-xl border border-gray-200">
            <div className="w-6 h-6 border-2 border-red-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="text-xs text-gray-400">Loading records...</p>
          </div>
        ) : paginatedData.length === 0 ? (
          <div className="p-8 text-center bg-white rounded-xl border border-gray-200">
            <Inbox className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-xs text-gray-400">{emptyMessage}</p>
          </div>
        ) : (
          paginatedData.map((row, index) => (
            <div
              key={row.id || index}
              onClick={() => onRowClick && onRowClick(row)}
              className={`bg-white rounded-xl border border-gray-200 p-4 shadow-sm space-y-2.5 ${
                onRowClick ? 'cursor-pointer hover:border-red-300 transition-colors' : ''
              }`}
            >
              {columns.map((col) => (
                <div key={col.key} className="flex items-center justify-between text-xs">
                  <span className="text-gray-400 font-medium">{col.header}:</span>
                  <span className="text-gray-800 font-semibold text-right">
                    {col.render ? col.render(row) : row[col.key] ?? '—'}
                  </span>
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      {/* Pagination Footer */}
      {!isLoading && sortedData.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-gray-500 pt-1">
          <div>
            Showing <span className="font-semibold text-gray-700">{(currentPage - 1) * pageSize + 1}</span> to{' '}
            <span className="font-semibold text-gray-700">
              {Math.min(currentPage * pageSize, sortedData.length)}
            </span>{' '}
            of <span className="font-semibold text-gray-700">{sortedData.length}</span> records
          </div>

          <div className="flex items-center gap-1 self-end sm:self-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="h-8 w-8 p-0"
              aria-label="First page"
            >
              <ChevronsLeft className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="h-8 w-8 p-0"
              aria-label="Previous page"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </Button>

            <span className="px-2 text-xs font-semibold text-gray-700">
              {currentPage} / {totalPages}
            </span>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="h-8 w-8 p-0"
              aria-label="Next page"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="h-8 w-8 p-0"
              aria-label="Last page"
            >
              <ChevronsRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
