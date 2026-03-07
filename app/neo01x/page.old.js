'use client';

import { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/Toast';
import Modal, { ConfirmDialog } from '@/components/Modal';
import { contactsApi, usersApi, areasApi, authApi } from '@/lib/api-client';
import { CONTACT_STATUS, STATUS_CONFIG, PRIORITY, ROLES } from '@/lib/constants';

// ===== Constants =====
const VIRTUAL_ROW_HEIGHT = 56;
const BUFFER_SIZE = 10;

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending', color: 'bg-amber-100 text-amber-700 border-amber-300', dot: 'bg-amber-500' },
  { value: 'accepted', label: 'Accepted', color: 'bg-emerald-100 text-emerald-700 border-emerald-300', dot: 'bg-emerald-500' },
  { value: 'rejected', label: 'Rejected', color: 'bg-rose-100 text-rose-700 border-rose-300', dot: 'bg-rose-500' },
  { value: 'followup', label: 'Follow Up', color: 'bg-blue-100 text-blue-700 border-blue-300', dot: 'bg-blue-500' },
  { value: 'converted', label: 'Converted', color: 'bg-purple-100 text-purple-700 border-purple-300', dot: 'bg-purple-500' },
];

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low', color: 'text-gray-500' },
  { value: 'normal', label: 'Normal', color: 'text-blue-600' },
  { value: 'high', label: 'High', color: 'text-orange-600' },
  { value: 'urgent', label: 'Urgent', color: 'text-red-600' },
];

// ===== Utility Hooks =====
function useDebounce(value, delay = 300) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

// ===== Virtual List Component =====
const VirtualContactList = memo(function VirtualContactList({
  contacts,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  onStatusChange,
  onPriorityChange,
  onEdit,
  onDelete,
  onAssign,
  partners,
}) {
  const containerRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(600);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    
    const handleScroll = () => setScrollTop(container.scrollTop);
    const handleResize = () => setContainerHeight(container.clientHeight);
    
    container.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleResize);
    handleResize();
    
    return () => {
      container.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const totalHeight = contacts.length * VIRTUAL_ROW_HEIGHT;
  const startIndex = Math.max(0, Math.floor(scrollTop / VIRTUAL_ROW_HEIGHT) - BUFFER_SIZE);
  const endIndex = Math.min(
    contacts.length,
    Math.ceil((scrollTop + containerHeight) / VIRTUAL_ROW_HEIGHT) + BUFFER_SIZE
  );
  const visibleContacts = contacts.slice(startIndex, endIndex);
  const offsetY = startIndex * VIRTUAL_ROW_HEIGHT;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-[40px_2fr_1.2fr_1fr_1fr_120px_100px_100px] gap-2 px-4 py-3 bg-gray-50 border-b font-medium text-sm text-gray-600 sticky top-0 z-10">
        <div className="flex items-center justify-center">
          <input
            type="checkbox"
            checked={selectedIds.length === contacts.length && contacts.length > 0}
            onChange={onSelectAll}
            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
        </div>
        <div>Name</div>
        <div>Phone</div>
        <div>Area</div>
        <div>Partner</div>
        <div>Status</div>
        <div>Priority</div>
        <div className="text-center">Actions</div>
      </div>

      {/* Virtual Scrollable Body */}
      <div
        ref={containerRef}
        className="overflow-y-auto"
        style={{ height: 'calc(100vh - 380px)', minHeight: '400px' }}
      >
        <div style={{ height: totalHeight, position: 'relative' }}>
          <div style={{ transform: `translateY(${offsetY}px)` }}>
            {visibleContacts.map(contact => (
              <ContactRow
                key={contact.id}
                contact={contact}
                isSelected={selectedIds.includes(contact.id)}
                onToggleSelect={onToggleSelect}
                onStatusChange={onStatusChange}
                onPriorityChange={onPriorityChange}
                onEdit={onEdit}
                onDelete={onDelete}
                onAssign={onAssign}
                partners={partners}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
});

// ===== Contact Row with Inline Editing =====
const ContactRow = memo(function ContactRow({
  contact,
  isSelected,
  onToggleSelect,
  onStatusChange,
  onPriorityChange,
  onEdit,
  onDelete,
  onAssign,
  partners,
}) {
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [showPriorityDropdown, setShowPriorityDropdown] = useState(false);
  const [showAssignDropdown, setShowAssignDropdown] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const handleStatusChange = async (newStatus) => {
    setIsUpdating(true);
    setShowStatusDropdown(false);
    try {
      await onStatusChange(contact.id, newStatus);
    } finally {
      setIsUpdating(false);
    }
  };

  const handlePriorityChange = async (newPriority) => {
    setIsUpdating(true);
    setShowPriorityDropdown(false);
    try {
      await onPriorityChange(contact.id, newPriority);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleAssign = async (partnerId) => {
    setIsUpdating(true);
    setShowAssignDropdown(false);
    try {
      await onAssign(contact.id, partnerId);
    } finally {
      setIsUpdating(false);
    }
  };

  const currentStatus = STATUS_OPTIONS.find(s => s.value === contact.status) || STATUS_OPTIONS[0];
  const currentPriority = PRIORITY_OPTIONS.find(p => p.value === contact.priority) || PRIORITY_OPTIONS[1];

  return (
    <div
      className={`grid grid-cols-[40px_2fr_1.2fr_1fr_1fr_120px_100px_100px] gap-2 px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors items-center ${
        isSelected ? 'bg-blue-50' : ''
      } ${isUpdating ? 'opacity-50' : ''}`}
      style={{ height: VIRTUAL_ROW_HEIGHT }}
    >
      {/* Checkbox */}
      <div className="flex items-center justify-center">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleSelect(contact.id)}
          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
      </div>

      {/* Name */}
      <div className="truncate">
        <div className="font-medium text-gray-900 truncate">{contact.name}</div>
        {contact.email && (
          <div className="text-xs text-gray-500 truncate">{contact.email}</div>
        )}
      </div>

      {/* Phone */}
      <div className="text-sm text-gray-600 truncate">
        <a href={`tel:${contact.phone}`} className="hover:text-blue-600">
          {contact.phone}
        </a>
      </div>

      {/* Area */}
      <div className="text-sm truncate">
        {contact.areaName || contact.area_name ? (
          <span className="inline-flex items-center gap-1.5">
            <span 
              className="w-2 h-2 rounded-full flex-shrink-0" 
              style={{ backgroundColor: contact.areaColor || '#6B7280' }}
            />
            <span className="truncate">{contact.areaName || contact.area_name}</span>
          </span>
        ) : (
          <span className="text-gray-400">—</span>
        )}
      </div>

      {/* Partner (Inline Assignable) */}
      <div className="relative">
        <button
          onClick={() => setShowAssignDropdown(!showAssignDropdown)}
          className="text-sm text-left w-full truncate hover:text-blue-600 transition-colors"
        >
          {contact.assignedToName || contact.assigned_to_name || (
            <span className="text-gray-400 italic">Unassigned</span>
          )}
        </button>
        {showAssignDropdown && (
          <DropdownMenu onClose={() => setShowAssignDropdown(false)}>
            <div className="py-1 max-h-48 overflow-y-auto">
              <button
                onClick={() => handleAssign(null)}
                className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 text-gray-500"
              >
                Unassigned
              </button>
              {partners.map(p => (
                <button
                  key={p.id}
                  onClick={() => handleAssign(p.id)}
                  className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 ${
                    (contact.assignedTo || contact.assigned_to) === p.id ? 'bg-blue-50 text-blue-700' : ''
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </DropdownMenu>
        )}
      </div>

      {/* Status (Inline Editable) */}
      <div className="relative">
        <button
          onClick={() => setShowStatusDropdown(!showStatusDropdown)}
          className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium border transition-all hover:shadow-sm ${currentStatus.color}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${currentStatus.dot}`} />
          {currentStatus.label}
          <svg className="w-3 h-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {showStatusDropdown && (
          <DropdownMenu onClose={() => setShowStatusDropdown(false)}>
            {STATUS_OPTIONS.map(status => (
              <button
                key={status.value}
                onClick={() => handleStatusChange(status.value)}
                className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2 ${
                  contact.status === status.value ? 'bg-gray-50' : ''
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${status.dot}`} />
                {status.label}
              </button>
            ))}
          </DropdownMenu>
        )}
      </div>

      {/* Priority (Inline Editable) */}
      <div className="relative">
        <button
          onClick={() => setShowPriorityDropdown(!showPriorityDropdown)}
          className={`text-xs font-medium ${currentPriority.color} hover:underline`}
        >
          • {currentPriority.label}
        </button>
        {showPriorityDropdown && (
          <DropdownMenu onClose={() => setShowPriorityDropdown(false)}>
            {PRIORITY_OPTIONS.map(priority => (
              <button
                key={priority.value}
                onClick={() => handlePriorityChange(priority.value)}
                className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 ${priority.color} ${
                  contact.priority === priority.value ? 'bg-gray-50' : ''
                }`}
              >
                • {priority.label}
              </button>
            ))}
          </DropdownMenu>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-center gap-1">
        <button
          onClick={() => onEdit(contact)}
          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
          title="Edit"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </button>
        <a
          href={`tel:${contact.phone}`}
          className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded transition-colors"
          title="Call"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
          </svg>
        </a>
        <button
          onClick={() => onDelete(contact)}
          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
          title="Delete"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </div>
  );
});

// ===== Dropdown Menu =====
function DropdownMenu({ children, onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute z-20 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 min-w-[140px] py-1"
      style={{ left: 0 }}
    >
      {children}
    </div>
  );
}

// ===== Analytics Cards =====
const AnalyticsSection = memo(function AnalyticsSection({ stats, contacts }) {
  const chartData = useMemo(() => {
    const byStatus = {};
    const byArea = {};
    const byPartner = {};
    
    contacts.forEach(c => {
      byStatus[c.status] = (byStatus[c.status] || 0) + 1;
      const area = c.areaName || c.area_name || 'Unassigned';
      byArea[area] = (byArea[area] || 0) + 1;
      const partner = c.assignedToName || c.assigned_to_name || 'Unassigned';
      byPartner[partner] = (byPartner[partner] || 0) + 1;
    });
    
    return { byStatus, byArea, byPartner };
  }, [contacts]);

  const conversionRate = useMemo(() => {
    if (contacts.length === 0) return 0;
    const converted = contacts.filter(c => c.status === 'converted' || c.status === 'accepted').length;
    return Math.round((converted / contacts.length) * 100);
  }, [contacts]);

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
      <StatCard 
        title="Total Contacts" 
        value={stats.total || contacts.length} 
        icon="👥"
        color="bg-gradient-to-br from-blue-500 to-blue-600"
      />
      <StatCard 
        title="Pending" 
        value={chartData.byStatus.pending || 0} 
        icon="⏳"
        color="bg-gradient-to-br from-amber-500 to-amber-600"
        trend={chartData.byStatus.pending > 10 ? 'high' : null}
      />
      <StatCard 
        title="Accepted" 
        value={chartData.byStatus.accepted || 0} 
        icon="✅"
        color="bg-gradient-to-br from-emerald-500 to-emerald-600"
      />
      <StatCard 
        title="Rejected" 
        value={chartData.byStatus.rejected || 0} 
        icon="❌"
        color="bg-gradient-to-br from-rose-500 to-rose-600"
      />
      <StatCard 
        title="Follow Up" 
        value={chartData.byStatus.followup || 0} 
        icon="📞"
        color="bg-gradient-to-br from-sky-500 to-sky-600"
      />
      <StatCard 
        title="Conversion Rate" 
        value={`${conversionRate}%`} 
        icon="📈"
        color="bg-gradient-to-br from-purple-500 to-purple-600"
        isPercentage
      />
    </div>
  );
});

function StatCard({ title, value, icon, color, trend, isPercentage }) {
  return (
    <div className={`${color} rounded-xl p-4 text-white shadow-lg`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-2xl">{icon}</span>
        {trend === 'high' && (
          <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">High</span>
        )}
      </div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-sm text-white/80">{title}</div>
    </div>
  );
}

// ===== Quick Filters =====
function QuickFilters({ filters, setFilters, areas, partners, contacts }) {
  const counts = useMemo(() => {
    const result = { all: contacts.length };
    STATUS_OPTIONS.forEach(s => {
      result[s.value] = contacts.filter(c => c.status === s.value).length;
    });
    result.unassigned = contacts.filter(c => !c.assignedTo && !c.assigned_to).length;
    return result;
  }, [contacts]);

  return (
    <div className="flex flex-wrap gap-2 mb-4">
      <button
        onClick={() => setFilters(f => ({ ...f, status: '' }))}
        className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
          !filters.status ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
        }`}
      >
        All ({counts.all})
      </button>
      {STATUS_OPTIONS.map(status => (
        <button
          key={status.value}
          onClick={() => setFilters(f => ({ ...f, status: status.value }))}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors flex items-center gap-1.5 ${
            filters.status === status.value
              ? `${status.color} border`
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
          {status.label} ({counts[status.value]})
        </button>
      ))}
      <button
        onClick={() => setFilters(f => ({ ...f, unassigned: !f.unassigned }))}
        className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
          filters.unassigned ? 'bg-orange-100 text-orange-700 border border-orange-300' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
        }`}
      >
        🚫 Unassigned ({counts.unassigned})
      </button>
    </div>
  );
}

// ===== Main Admin Dashboard =====
export default function AdminDashboard() {
  const { user, logout, loading: authLoading } = useAuth();
  const router = useRouter();
  const toast = useToast();

  // Data State
  const [allContacts, setAllContacts] = useState([]);
  const [partners, setPartners] = useState([]);
  const [areas, setAreas] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // UI State
  const [activeTab, setActiveTab] = useState('contacts');
  const [showModal, setShowModal] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);

  // Filters
  const [filters, setFilters] = useState({
    search: '',
    status: '',
    areaId: '',
    assignedTo: '',
    unassigned: false,
  });
  const debouncedSearch = useDebounce(filters.search);

  // Auth check
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    } else if (!authLoading && user?.role !== ROLES.ADMIN) {
      router.push('/partner');
    }
  }, [user, authLoading, router]);

  // Fetch ALL contacts (no pagination)
  const fetchAllData = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      const [contactsRes, workersRes, areasRes, statsRes] = await Promise.all([
        contactsApi.getAll({ limit: 10000 }), // Get all contacts
        usersApi.getAll().catch(() => []),
        areasApi.getAll().catch(() => []),
        contactsApi.getStats().catch(() => ({})),
      ]);

      const contactsData = contactsRes?.data || contactsRes || [];
      setAllContacts(Array.isArray(contactsData) ? contactsData : []);
      setPartners(Array.isArray(workersRes) ? workersRes : workersRes?.data || []);
      setAreas(Array.isArray(areasRes) ? areasRes : areasRes?.data || []);
      setStats(statsRes?.data || statsRes || {});
    } catch (error) {
      toast.error('Failed to fetch data');
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [user, toast]);

  useEffect(() => {
    if (user?.role === ROLES.ADMIN) {
      fetchAllData();
    }
  }, [fetchAllData, user]);

  // Filtered contacts (client-side filtering for instant response)
  const filteredContacts = useMemo(() => {
    let result = [...allContacts];

    // Search filter
    if (debouncedSearch) {
      const search = debouncedSearch.toLowerCase();
      result = result.filter(c =>
        c.name?.toLowerCase().includes(search) ||
        c.phone?.includes(search) ||
        c.email?.toLowerCase().includes(search) ||
        c.address?.toLowerCase().includes(search)
      );
    }

    // Status filter
    if (filters.status) {
      result = result.filter(c => c.status === filters.status);
    }

    // Area filter
    if (filters.areaId) {
      result = result.filter(c => (c.areaId || c.area_id) === filters.areaId);
    }

    // Partner filter
    if (filters.assignedTo) {
      result = result.filter(c => (c.assignedTo || c.assigned_to) === filters.assignedTo);
    }

    // Unassigned filter
    if (filters.unassigned) {
      result = result.filter(c => !c.assignedTo && !c.assigned_to);
    }

    return result;
  }, [allContacts, debouncedSearch, filters]);

  // ===== Handlers =====
  const handleInlineStatusChange = async (contactId, newStatus) => {
    try {
      await contactsApi.update(contactId, { status: newStatus });
      setAllContacts(prev => prev.map(c => 
        c.id === contactId ? { ...c, status: newStatus } : c
      ));
      toast.success('Status updated');
    } catch (error) {
      toast.error('Failed to update status');
    }
  };

  const handleInlinePriorityChange = async (contactId, newPriority) => {
    try {
      await contactsApi.update(contactId, { priority: newPriority });
      setAllContacts(prev => prev.map(c => 
        c.id === contactId ? { ...c, priority: newPriority } : c
      ));
      toast.success('Priority updated');
    } catch (error) {
      toast.error('Failed to update priority');
    }
  };

  const handleInlineAssign = async (contactId, partnerId) => {
    try {
      await contactsApi.update(contactId, { assignedTo: partnerId });
      const partner = partners.find(p => p.id === partnerId);
      setAllContacts(prev => prev.map(c => 
        c.id === contactId ? { 
          ...c, 
          assignedTo: partnerId, 
          assigned_to: partnerId,
          assignedToName: partner?.name || null,
          assigned_to_name: partner?.name || null,
        } : c
      ));
      toast.success(partnerId ? 'Contact assigned' : 'Contact unassigned');
    } catch (error) {
      toast.error('Failed to assign contact');
    }
  };

  const handleDeleteContact = async (contact) => {
    setConfirmDialog({
      title: 'Delete Contact',
      message: `Delete "${contact.name}"? This cannot be undone.`,
      onConfirm: async () => {
        setActionLoading(true);
        try {
          await contactsApi.delete(contact.id);
          setAllContacts(prev => prev.filter(c => c.id !== contact.id));
          toast.success('Contact deleted');
        } catch (error) {
          toast.error('Failed to delete contact');
        } finally {
          setActionLoading(false);
          setConfirmDialog(null);
        }
      },
    });
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    setConfirmDialog({
      title: 'Delete Selected',
      message: `Delete ${selectedIds.length} contacts? This cannot be undone.`,
      onConfirm: async () => {
        setActionLoading(true);
        try {
          await contactsApi.bulkDelete(selectedIds);
          setAllContacts(prev => prev.filter(c => !selectedIds.includes(c.id)));
          setSelectedIds([]);
          toast.success(`Deleted ${selectedIds.length} contacts`);
        } catch (error) {
          toast.error('Failed to delete contacts');
        } finally {
          setActionLoading(false);
          setConfirmDialog(null);
        }
      },
    });
  };

  const handleBulkAssign = async (partnerId) => {
    if (selectedIds.length === 0) return;
    setActionLoading(true);
    try {
      await contactsApi.bulkAssign(selectedIds, partnerId);
      const partner = partners.find(p => p.id === partnerId);
      setAllContacts(prev => prev.map(c => 
        selectedIds.includes(c.id) ? { 
          ...c, 
          assignedTo: partnerId,
          assigned_to: partnerId,
          assignedToName: partner?.name || null,
          assigned_to_name: partner?.name || null,
        } : c
      ));
      setSelectedIds([]);
      setShowModal(null);
      toast.success(`Assigned ${selectedIds.length} contacts`);
    } catch (error) {
      toast.error('Failed to assign contacts');
    } finally {
      setActionLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      const params = { format: 'csv', limit: 10000 };
      if (filters.status) params.status = filters.status;
      if (filters.areaId) params.areaId = filters.areaId;
      
      const response = await contactsApi.export(params);
      
      if (response.isFile) {
        const blob = new Blob([response.data], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `contacts-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        toast.success('Exported successfully');
      }
    } catch (error) {
      toast.error('Export failed');
    }
  };

  const toggleSelection = (id) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredContacts.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredContacts.map(c => c.id));
    }
  };

  // Loading state
  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-[1600px] mx-auto px-4 md:px-6 py-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Welcome back, {user.name}</h1>
              <p className="text-sm text-gray-500">{filteredContacts.length} contacts • Last updated: {new Date().toLocaleTimeString()}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchAllData()}
                className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"
                title="Refresh"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
              <button
                onClick={handleExport}
                className="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg font-medium flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Export
              </button>
              <button
                onClick={() => setShowModal('changePassword')}
                className="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg font-medium"
              >
                Change Password
              </button>
              <button
                onClick={logout}
                className="px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg font-medium"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-4 md:px-6 py-6">
        {/* Analytics */}
        <AnalyticsSection stats={stats} contacts={allContacts} />

        {/* Tabs */}
        <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
          {['contacts', 'partners', 'areas'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === tab ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Contacts Tab */}
        {activeTab === 'contacts' && (
          <>
            {/* Quick Status Filters */}
            <QuickFilters 
              filters={filters} 
              setFilters={setFilters} 
              areas={areas} 
              partners={partners}
              contacts={allContacts}
            />

            {/* Search and Actions Bar */}
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <div className="relative flex-1 min-w-[200px] max-w-md">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={filters.search}
                  onChange={(e) => setFilters(f => ({ ...f, search: e.target.value }))}
                  placeholder="Search contacts..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>

              <select
                value={filters.areaId}
                onChange={(e) => setFilters(f => ({ ...f, areaId: e.target.value }))}
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Areas</option>
                {areas.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>

              <select
                value={filters.assignedTo}
                onChange={(e) => setFilters(f => ({ ...f, assignedTo: e.target.value }))}
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Partners</option>
                {partners.filter(p => p.role === 'partner').map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>

              <div className="flex-1" />

              {selectedIds.length > 0 && (
                <div className="flex items-center gap-2 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-200">
                  <span className="text-sm font-medium text-blue-700">{selectedIds.length} selected</span>
                  <button
                    onClick={() => setShowModal('bulkAssign')}
                    className="text-sm text-blue-600 hover:underline"
                  >
                    Assign
                  </button>
                  <button
                    onClick={handleBulkDelete}
                    className="text-sm text-red-600 hover:underline"
                  >
                    Delete
                  </button>
                  <button
                    onClick={() => setSelectedIds([])}
                    className="text-sm text-gray-500 hover:underline"
                  >
                    Clear
                  </button>
                </div>
              )}

              <button
                onClick={() => setShowModal('import')}
                className="px-4 py-2 text-sm border border-gray-200 hover:bg-gray-50 rounded-lg font-medium"
              >
                Import
              </button>
              <button
                onClick={() => setShowModal('addContact')}
                className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
              >
                + Add Contact
              </button>
            </div>

            {/* Contacts Table with Virtual Scrolling */}
            {loading ? (
              <div className="flex items-center justify-center h-96">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
              </div>
            ) : filteredContacts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-96 bg-white rounded-xl border border-gray-200">
                <div className="text-6xl mb-4">📭</div>
                <h3 className="text-lg font-medium text-gray-900 mb-1">No contacts found</h3>
                <p className="text-gray-500 mb-4">Try adjusting your filters or add a new contact</p>
                <button
                  onClick={() => setShowModal('addContact')}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium"
                >
                  Add Contact
                </button>
              </div>
            ) : (
              <VirtualContactList
                contacts={filteredContacts}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelection}
                onSelectAll={toggleSelectAll}
                onStatusChange={handleInlineStatusChange}
                onPriorityChange={handleInlinePriorityChange}
                onEdit={(contact) => { setEditItem(contact); setShowModal('editContact'); }}
                onDelete={handleDeleteContact}
                onAssign={handleInlineAssign}
                partners={partners.filter(p => p.role === 'partner')}
              />
            )}
          </>
        )}

        {/* Partners Tab */}
        {activeTab === 'partners' && (
          <PartnersTab 
            partners={partners} 
            areas={areas}
            onAdd={() => setShowModal('addPartner')}
            onEdit={(p) => { setEditItem(p); setShowModal('editPartner'); }}
            onDelete={(p) => {
              setConfirmDialog({
                title: 'Delete Partner',
                message: `Delete "${p.name}"?`,
                onConfirm: async () => {
                  try {
                    await usersApi.delete(p.id);
                    setPartners(prev => prev.filter(x => x.id !== p.id));
                    toast.success('Partner deleted');
                  } catch (e) {
                    toast.error('Failed to delete');
                  }
                  setConfirmDialog(null);
                }
              });
            }}
          />
        )}

        {/* Areas Tab */}
        {activeTab === 'areas' && (
          <AreasTab 
            areas={areas}
            contacts={allContacts}
            onAdd={() => setShowModal('addArea')}
            onDelete={(a) => {
              setConfirmDialog({
                title: 'Delete Area',
                message: `Delete "${a.name}"?`,
                onConfirm: async () => {
                  try {
                    await areasApi.delete(a.id);
                    setAreas(prev => prev.filter(x => x.id !== a.id));
                    toast.success('Area deleted');
                  } catch (e) {
                    toast.error('Failed to delete');
                  }
                  setConfirmDialog(null);
                }
              });
            }}
          />
        )}
      </main>

      {/* Modals */}
      <BulkAssignModal
        isOpen={showModal === 'bulkAssign'}
        onClose={() => setShowModal(null)}
        partners={partners.filter(p => p.role === 'partner')}
        selectedCount={selectedIds.length}
        onAssign={handleBulkAssign}
        loading={actionLoading}
      />

      <ContactFormModal
        isOpen={showModal === 'addContact' || showModal === 'editContact'}
        onClose={() => { setShowModal(null); setEditItem(null); }}
        contact={editItem}
        areas={areas}
        partners={partners}
        onSuccess={(contact) => {
          if (editItem) {
            setAllContacts(prev => prev.map(c => c.id === contact.id ? contact : c));
          } else {
            setAllContacts(prev => [contact, ...prev]);
          }
          setShowModal(null);
          setEditItem(null);
        }}
        toast={toast}
      />

      <PartnerFormModal
        isOpen={showModal === 'addPartner' || showModal === 'editPartner'}
        onClose={() => { setShowModal(null); setEditItem(null); }}
        partner={editItem}
        areas={areas}
        onSuccess={(partner) => {
          if (editItem) {
            setPartners(prev => prev.map(p => p.id === partner.id ? partner : p));
          } else {
            setPartners(prev => [...prev, partner]);
          }
          fetchAllData(); // Refresh to get full data
          setShowModal(null);
          setEditItem(null);
        }}
        toast={toast}
      />

      <AreaFormModal
        isOpen={showModal === 'addArea'}
        onClose={() => setShowModal(null)}
        onSuccess={(area) => {
          setAreas(prev => [...prev, area]);
          setShowModal(null);
        }}
        toast={toast}
      />

      <ImportModal
        isOpen={showModal === 'import'}
        onClose={() => setShowModal(null)}
        areas={areas}
        onSuccess={() => {
          fetchAllData();
          setShowModal(null);
        }}
        toast={toast}
      />

      <ChangePasswordModal
        isOpen={showModal === 'changePassword'}
        onClose={() => { setShowModal(null); setEditItem(null); }}
        user={editItem || user}
        toast={toast}
      />

      <ConfirmDialog
        isOpen={!!confirmDialog}
        onClose={() => setConfirmDialog(null)}
        onConfirm={confirmDialog?.onConfirm}
        title={confirmDialog?.title}
        message={confirmDialog?.message}
        isLoading={actionLoading}
      />
    </div>
  );
}

// ===== Partners Tab =====
function PartnersTab({ partners, areas, onAdd, onEdit, onDelete }) {
  const partnerList = partners.filter(p => p.role === 'partner');
  
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">{partnerList.length} Partners</h2>
        <button 
          onClick={onAdd}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium"
        >
          + Add Partner
        </button>
      </div>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {partnerList.map(partner => (
          <div key={partner.id} className="bg-white rounded-xl p-4 border border-gray-200 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-gray-900">{partner.name}</h3>
                <p className="text-sm text-gray-500">@{partner.username}</p>
              </div>
              <div className="flex gap-1">
                <button onClick={() => onEdit(partner)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button onClick={() => onDelete(partner)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1">
              {partner.areas?.length > 0 ? (
                partner.areas.map((area, i) => (
                  <span key={i} className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs">
                    {area.name || area}
                  </span>
                ))
              ) : (
                <span className="text-gray-400 text-sm">No areas</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ===== Areas Tab =====
function AreasTab({ areas, contacts, onAdd, onDelete }) {
  const areaStats = useMemo(() => {
    const stats = {};
    areas.forEach(a => { stats[a.id] = 0; });
    contacts.forEach(c => {
      const areaId = c.areaId || c.area_id;
      if (areaId && stats[areaId] !== undefined) stats[areaId]++;
    });
    return stats;
  }, [areas, contacts]);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">{areas.length} Areas</h2>
        <button 
          onClick={onAdd}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium"
        >
          + Add Area
        </button>
      </div>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {areas.map(area => (
          <div key={area.id} className="bg-white rounded-xl p-4 border border-gray-200 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded-full" style={{ backgroundColor: area.color || '#3B82F6' }} />
                <h3 className="font-semibold text-gray-900">{area.name}</h3>
              </div>
              <button onClick={() => onDelete(area)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
            {area.description && <p className="text-sm text-gray-500 mt-2">{area.description}</p>}
            <div className="mt-3 text-sm text-gray-600">
              <strong>{areaStats[area.id] || 0}</strong> contacts
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ===== Modal Components =====

function BulkAssignModal({ isOpen, onClose, partners, selectedCount, onAssign, loading }) {
  const [selected, setSelected] = useState('');
  
  if (!isOpen) return null;
  
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Assign ${selectedCount} Contacts`}>
      <div className="space-y-4">
        <select 
          value={selected} 
          onChange={e => setSelected(e.target.value)}
          className="w-full px-3 py-2 border rounded-lg"
        >
          <option value="">Select Partner</option>
          {partners.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 border rounded-lg">Cancel</button>
          <button 
            onClick={() => onAssign(selected)}
            disabled={!selected || loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50"
          >
            {loading ? 'Assigning...' : 'Assign'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ContactFormModal({ isOpen, onClose, contact, areas, partners, onSuccess, toast }) {
  const [loading, setLoading] = useState(false);
  const isEdit = !!contact;
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    const formData = new FormData(e.target);
    const data = {
      name: formData.get('name'),
      phone: formData.get('phone'),
      email: formData.get('email') || null,
      address: formData.get('address') || null,
      areaId: formData.get('areaId') || null,
      assignedTo: formData.get('assignedTo') || null,
      priority: formData.get('priority') || 'normal',
      notes: formData.get('notes') || '',
    };
    
    if (isEdit) {
      data.status = formData.get('status');
    }

    try {
      const result = isEdit 
        ? await contactsApi.update(contact.id, data)
        : await contactsApi.create(data);
      toast.success(isEdit ? 'Contact updated' : 'Contact created');
      onSuccess(result.data || result);
    } catch (error) {
      toast.error(error.message || 'Failed to save contact');
    } finally {
      setLoading(false);
    }
  };
  
  if (!isOpen) return null;
  
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEdit ? 'Edit Contact' : 'Add Contact'} size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Name *</label>
            <input name="name" defaultValue={contact?.name} required className="w-full px-3 py-2 border rounded-lg" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Phone *</label>
            <input name="phone" defaultValue={contact?.phone} required className="w-full px-3 py-2 border rounded-lg" />
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input name="email" type="email" defaultValue={contact?.email} className="w-full px-3 py-2 border rounded-lg" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Area</label>
            <select name="areaId" defaultValue={contact?.areaId || contact?.area_id || ''} className="w-full px-3 py-2 border rounded-lg">
              <option value="">Select Area</option>
              {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Address</label>
          <input name="address" defaultValue={contact?.address} className="w-full px-3 py-2 border rounded-lg" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Assign To</label>
            <select name="assignedTo" defaultValue={contact?.assignedTo || contact?.assigned_to || ''} className="w-full px-3 py-2 border rounded-lg">
              <option value="">Unassigned</option>
              {partners.filter(p => p.role === 'partner').map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Priority</label>
            <select name="priority" defaultValue={contact?.priority || 'normal'} className="w-full px-3 py-2 border rounded-lg">
              {PRIORITY_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
        </div>

        {isEdit && (
          <div>
            <label className="block text-sm font-medium mb-1">Status</label>
            <select name="status" defaultValue={contact?.status || 'pending'} className="w-full px-3 py-2 border rounded-lg">
              {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium mb-1">Notes</label>
          <textarea name="notes" defaultValue={contact?.notes} rows={3} className="w-full px-3 py-2 border rounded-lg" />
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <button type="button" onClick={onClose} className="px-4 py-2 border rounded-lg">Cancel</button>
          <button type="submit" disabled={loading} className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50">
            {loading ? 'Saving...' : (isEdit ? 'Update' : 'Create')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function PartnerFormModal({ isOpen, onClose, partner, areas, onSuccess, toast }) {
  const [loading, setLoading] = useState(false);
  const isEdit = !!partner;
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    const formData = new FormData(e.target);
    const selectedAreas = Array.from(formData.getAll('areaIds'));
    
    const data = {
      name: formData.get('name'),
      areaIds: selectedAreas,
    };
    
    if (!isEdit) {
      data.username = formData.get('username');
      data.password = formData.get('password');
      data.role = 'partner';
    }
    
    const password = formData.get('password');
    if (password && isEdit) data.password = password;

    try {
      const result = isEdit 
        ? await usersApi.update(partner.id, data)
        : await usersApi.create(data);
      toast.success(isEdit ? 'Partner updated' : 'Partner created');
      onSuccess(result.data || result);
    } catch (error) {
      toast.error(error.message || 'Failed to save partner');
    } finally {
      setLoading(false);
    }
  };
  
  if (!isOpen) return null;
  
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEdit ? 'Edit Partner' : 'Add Partner'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {!isEdit && (
          <div>
            <label className="block text-sm font-medium mb-1">Username *</label>
            <input name="username" required className="w-full px-3 py-2 border rounded-lg" />
          </div>
        )}
        
        <div>
          <label className="block text-sm font-medium mb-1">Name *</label>
          <input name="name" defaultValue={partner?.name} required className="w-full px-3 py-2 border rounded-lg" />
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-1">{isEdit ? 'New Password (leave blank to keep)' : 'Password *'}</label>
          <input name="password" type="password" required={!isEdit} className="w-full px-3 py-2 border rounded-lg" />
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-1">Assigned Areas</label>
          <div className="max-h-40 overflow-y-auto border rounded-lg p-2">
            {areas.map(area => (
              <label key={area.id} className="flex items-center gap-2 py-1">
                <input 
                  type="checkbox" 
                  name="areaIds" 
                  value={area.id}
                  defaultChecked={partner?.areas?.some(a => (a.id || a) === area.id)}
                />
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: area.color }} />
                {area.name}
              </label>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <button type="button" onClick={onClose} className="px-4 py-2 border rounded-lg">Cancel</button>
          <button type="submit" disabled={loading} className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50">
            {loading ? 'Saving...' : (isEdit ? 'Update' : 'Create')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function AreaFormModal({ isOpen, onClose, onSuccess, toast }) {
  const [loading, setLoading] = useState(false);
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    const formData = new FormData(e.target);
    const data = {
      name: formData.get('name'),
      description: formData.get('description') || '',
      color: formData.get('color') || '#3B82F6',
    };

    try {
      const result = await areasApi.create(data);
      toast.success('Area created');
      onSuccess(result.data || result);
    } catch (error) {
      toast.error(error.message || 'Failed to create area');
    } finally {
      setLoading(false);
    }
  };
  
  if (!isOpen) return null;
  
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Area">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Name *</label>
          <input name="name" required className="w-full px-3 py-2 border rounded-lg" />
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-1">Description</label>
          <input name="description" className="w-full px-3 py-2 border rounded-lg" />
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-1">Color</label>
          <input name="color" type="color" defaultValue="#3B82F6" className="w-16 h-10 border rounded-lg cursor-pointer" />
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <button type="button" onClick={onClose} className="px-4 py-2 border rounded-lg">Cancel</button>
          <button type="submit" disabled={loading} className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50">
            {loading ? 'Creating...' : 'Create'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ImportModal({ isOpen, onClose, areas, onSuccess, toast }) {
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  
  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    try {
      const text = await file.text();
      const lines = text.trim().split('\n');
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      const rows = lines.slice(1, 6).map(line => {
        const values = line.split(',');
        return headers.reduce((obj, h, i) => {
          obj[h] = values[i]?.trim() || '';
          return obj;
        }, {});
      });
      setPreview({ headers, rows, total: lines.length - 1 });
    } catch (err) {
      toast.error('Failed to read file');
    }
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    const formData = new FormData(e.target);
    const file = formData.get('file');
    
    if (!file) {
      toast.error('Select a file');
      setLoading(false);
      return;
    }

    try {
      const text = await file.text();
      const lines = text.trim().split('\n');
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      
      const contacts = lines.slice(1).map(line => {
        const values = line.split(',');
        return headers.reduce((obj, h, i) => {
          obj[h] = values[i]?.trim() || '';
          return obj;
        }, {});
      }).filter(c => c.name && c.phone);

      await contactsApi.import({ contacts, areaId: formData.get('areaId') || null });
      toast.success(`Imported ${contacts.length} contacts`);
      onSuccess();
    } catch (error) {
      toast.error(error.message || 'Import failed');
    } finally {
      setLoading(false);
    }
  };
  
  if (!isOpen) return null;
  
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Import Contacts" size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">CSV File *</label>
          <input 
            type="file" 
            name="file" 
            accept=".csv" 
            onChange={handleFileChange}
            className="w-full px-3 py-2 border rounded-lg" 
          />
          <p className="text-xs text-gray-500 mt-1">CSV with columns: name, phone, email, address</p>
        </div>
        
        {preview && (
          <div className="border rounded-lg p-3 bg-gray-50">
            <p className="text-sm font-medium mb-2">Preview ({preview.total} rows found)</p>
            <div className="overflow-x-auto">
              <table className="text-xs w-full">
                <thead>
                  <tr>{preview.headers.map((h, i) => <th key={i} className="px-2 py-1 text-left">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {preview.rows.map((row, i) => (
                    <tr key={i}>{preview.headers.map((h, j) => <td key={j} className="px-2 py-1">{row[h]}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        
        <div>
          <label className="block text-sm font-medium mb-1">Assign to Area</label>
          <select name="areaId" className="w-full px-3 py-2 border rounded-lg">
            <option value="">No Area</option>
            {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <button type="button" onClick={onClose} className="px-4 py-2 border rounded-lg">Cancel</button>
          <button type="submit" disabled={loading} className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50">
            {loading ? 'Importing...' : 'Import'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ChangePasswordModal({ isOpen, onClose, user, toast }) {
  const [loading, setLoading] = useState(false);
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    const formData = new FormData(e.target);
    const newPassword = formData.get('newPassword');
    const confirmPassword = formData.get('confirmPassword');
    
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      setLoading(false);
      return;
    }

    try {
      await authApi.changePassword({ 
        currentPassword: formData.get('currentPassword'),
        newPassword 
      });
      toast.success('Password changed');
      onClose();
    } catch (error) {
      toast.error(error.message || 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };
  
  if (!isOpen) return null;
  
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Change Password">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Current Password *</label>
          <input name="currentPassword" type="password" required className="w-full px-3 py-2 border rounded-lg" />
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-1">New Password *</label>
          <input name="newPassword" type="password" required minLength={6} className="w-full px-3 py-2 border rounded-lg" />
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-1">Confirm Password *</label>
          <input name="confirmPassword" type="password" required className="w-full px-3 py-2 border rounded-lg" />
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <button type="button" onClick={onClose} className="px-4 py-2 border rounded-lg">Cancel</button>
          <button type="submit" disabled={loading} className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50">
            {loading ? 'Changing...' : 'Change Password'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
