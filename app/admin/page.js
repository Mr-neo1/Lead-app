'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/Toast';
import Modal, { ConfirmDialog } from '@/components/Modal';
import {
  StatusBadge,
  PriorityBadge,
  Spinner,
  StatCard,
  SearchInput,
  Select,
  Button,
  Pagination,
  EmptyState,
} from '@/components/UI';
import { contactsApi, usersApi, areasApi, activityApi, authApi } from '@/lib/api-client';
import { CONTACT_STATUS, STATUS_CONFIG, PRIORITY, ROLES } from '@/lib/constants';

export default function AdminDashboard() {
  const { user, logout, loading: authLoading } = useAuth();
  const router = useRouter();
  const toast = useToast();

  // UI State
  const [activeTab, setActiveTab] = useState('contacts');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Data State
  const [contacts, setContacts] = useState([]);
  const [partners, setPartners] = useState([]);
  const [areas, setAreas] = useState([]);
  const [stats, setStats] = useState({});
  const [activityLogs, setActivityLogs] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });

  // Filters
  const [filters, setFilters] = useState({
    status: '',
    areaId: '',
    assignedTo: '',
    search: '',
    page: 1,
  });

  // Selection for bulk actions
  const [selectedIds, setSelectedIds] = useState([]);

  // Auth check
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    } else if (!authLoading && user?.role !== ROLES.ADMIN) {
    router.push('/partner');
    }
  }, [user, authLoading, router]);

  // Fetch contacts
  const fetchContacts = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      const params = {};
      if (filters.status) params.status = filters.status;
      if (filters.areaId) params.areaId = filters.areaId;
      if (filters.assignedTo) params.assignedTo = filters.assignedTo;
      if (filters.search) params.search = filters.search;
      params.page = filters.page;
      params.limit = 20;

      const response = await contactsApi.getAll(params);
      
      // Handle both paginated and array responses
      if (response?.data) {
        setContacts(response.data);
        setPagination(response.pagination || { page: 1, totalPages: 1, total: response.data.length });
      } else if (Array.isArray(response)) {
        setContacts(response);
        setPagination({ page: 1, totalPages: 1, total: response.length });
      }
    } catch (error) {
      toast.error('Failed to fetch contacts');
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [filters, user, toast]);

  // Fetch supporting data
  const fetchSupportingData = useCallback(async () => {
    if (!user) return;
    try {
      const [workersRes, areasRes, statsRes] = await Promise.all([
        usersApi.getAll().catch(() => []),
        areasApi.getAll().catch(() => []),
        contactsApi.getStats().catch(() => ({})),
      ]);

      setPartners(Array.isArray(workersRes) ? workersRes : workersRes?.data || []);
      setAreas(Array.isArray(areasRes) ? areasRes : areasRes?.data || []);
      setStats(statsRes?.data || statsRes || {});
    } catch (error) {
      console.error('Failed to fetch supporting data:', error);
    }
  }, [user]);

  // Initial load
  useEffect(() => {
    if (user?.role === ROLES.ADMIN) {
      fetchContacts();
      fetchSupportingData();
    }
  }, [fetchContacts, fetchSupportingData, user]);

  // Handlers
  const handleCreateContact = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    
    const formData = new FormData(e.target);
    const data = {
      name: formData.get('name'),
      phone: formData.get('phone'),
      email: formData.get('email') || null,
      address: formData.get('address') || null,
      areaId: formData.get('areaId') || null,
      assignedTo: formData.get('assignedTo') || null,
      priority: formData.get('priority') || PRIORITY.MEDIUM,
      notes: formData.get('notes') || '',
    };

    try {
      await contactsApi.create(data);
      toast.success('Contact created successfully');
      setShowModal(null);
      fetchContacts();
      fetchSupportingData();
    } catch (error) {
      toast.error(error.message || 'Failed to create contact');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateContact = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    
    const formData = new FormData(e.target);
    const data = {
      name: formData.get('name'),
      phone: formData.get('phone'),
      email: formData.get('email') || null,
      address: formData.get('address') || null,
      areaId: formData.get('areaId') || null,
      assignedTo: formData.get('assignedTo') || null,
      status: formData.get('status'),
      priority: formData.get('priority'),
      notes: formData.get('notes') || '',
    };

    try {
      await contactsApi.update(editItem.id, data);
      toast.success('Contact updated successfully');
      setShowModal(null);
      setEditItem(null);
      fetchContacts();
    } catch (error) {
      toast.error(error.message || 'Failed to update contact');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteContact = async (contact) => {
    setConfirmDialog({
      title: 'Delete Contact',
      message: `Are you sure you want to delete "${contact.name}"? This action cannot be undone.`,
      onConfirm: async () => {
        setActionLoading(true);
        try {
          await contactsApi.delete(contact.id);
          toast.success('Contact deleted');
          fetchContacts();
          fetchSupportingData();
        } catch (error) {
          toast.error(error.message || 'Failed to delete contact');
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
      title: 'Delete Selected Contacts',
      message: `Are you sure you want to delete ${selectedIds.length} contact(s)? This action cannot be undone.`,
      onConfirm: async () => {
        setActionLoading(true);
        try {
          await contactsApi.bulkDelete(selectedIds);
          toast.success(`Deleted ${selectedIds.length} contacts`);
          setSelectedIds([]);
          fetchContacts();
          fetchSupportingData();
        } catch (error) {
          toast.error(error.message || 'Failed to delete contacts');
        } finally {
          setActionLoading(false);
          setConfirmDialog(null);
        }
      },
    });
  };

  const handleBulkAssign = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const assignedTo = formData.get('assignedTo');
    
    if (!assignedTo || selectedIds.length === 0) return;
    
    setActionLoading(true);
    try {
      await contactsApi.bulkAssign(selectedIds, assignedTo);
      toast.success(`Assigned ${selectedIds.length} contacts`);
      setSelectedIds([]);
      setShowModal(null);
      fetchContacts();
    } catch (error) {
      toast.error(error.message || 'Failed to assign contacts');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCountryAssign = async (countryCode, assignedTo, areaId = null) => {
    setActionLoading(true);
    try {
      let result;
      if (countryCode) {
        result = await contactsApi.bulkAssignByCountry(countryCode, assignedTo);
        toast.success(`Assigned ${result.updated} contacts from ${countryCode}`);
      } else if (areaId) {
        result = await contactsApi.bulkAssignByArea(areaId, assignedTo);
        toast.success(`Assigned ${result.updated} contacts from area`);
      }
      setShowModal(null);
      fetchContacts();
    } catch (error) {
      toast.error(error.message || 'Failed to assign contacts');
    } finally {
      setActionLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      const params = {};
      if (filters.status) params.status = filters.status;
      if (filters.areaId) params.areaId = filters.areaId;
      params.format = 'csv';
      
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
        toast.success('Contacts exported');
      }
    } catch (error) {
      toast.error('Failed to export contacts');
    }
  };

  // New handleImportFile using the enhanced import API
  const handleImportFile = async (file, options) => {
    setActionLoading(true);
    try {
      const result = await contactsApi.importFile(file, options);
      setShowModal(null);
      fetchContacts();
      fetchSupportingData();
      return result;
    } finally {
      setActionLoading(false);
    }
  };

  // Legacy handleImport for backwards compatibility
  const handleImport = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const file = formData.get('file');
    
    if (!file) {
      toast.error('Please select a file');
      return;
    }

    setActionLoading(true);
    try {
      const text = await file.text();
      const lines = text.trim().split('\n');
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      
      const contacts = lines.slice(1).map(line => {
        const values = line.split(',');
        const contact = {};
        headers.forEach((header, index) => {
          contact[header] = values[index]?.trim() || '';
        });
        return contact;
      }).filter(c => c.name && c.phone);

      if (contacts.length === 0) {
        toast.error('No valid contacts found in file');
        return;
      }

      await contactsApi.import({ contacts, areaId: formData.get('areaId') || null });
      toast.success(`Imported ${contacts.length} contacts`);
      setShowModal(null);
      fetchContacts();
      fetchSupportingData();
    } catch (error) {
      toast.error(error.message || 'Failed to import contacts');
    } finally {
      setActionLoading(false);
    }
  };

  // Partner handlers
  const handleCreatePartner = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    
    const formData = new FormData(e.target);
    const selectedAreas = Array.from(formData.getAll('areaIds'));
    
    const data = {
      username: formData.get('username'),
      password: formData.get('password'),
      name: formData.get('name'),
      role: ROLES.PARTNER,
      areaIds: selectedAreas,
    };

    try {
      await usersApi.create(data);
      toast.success('Partner created successfully');
      setShowModal(null);
      fetchSupportingData();
    } catch (error) {
      toast.error(error.message || 'Failed to create partner');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdatePartner = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    
    const formData = new FormData(e.target);
    const selectedAreas = Array.from(formData.getAll('areaIds'));
    
    const data = {
      name: formData.get('name'),
      areaIds: selectedAreas,
    };
    
    const password = formData.get('password');
    if (password) data.password = password;

    try {
      await usersApi.update(editItem.id, data);
      toast.success('Partner updated successfully');
      setShowModal(null);
      setEditItem(null);
      fetchSupportingData();
    } catch (error) {
      toast.error(error.message || 'Failed to update partner');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeletePartner = async (partner) => {
    setConfirmDialog({
      title: 'Delete Partner',
      message: `Are you sure you want to delete "${partner.name}"?`,
      onConfirm: async () => {
        setActionLoading(true);
        try {
          await usersApi.delete(partner.id);
          toast.success('Partner deleted');
          fetchSupportingData();
        } catch (error) {
          toast.error(error.message || 'Failed to delete partner');
        } finally {
          setActionLoading(false);
          setConfirmDialog(null);
        }
      },
    });
  };

  // Area handlers
  const handleCreateArea = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    
    const formData = new FormData(e.target);
    const data = {
      name: formData.get('name'),
      description: formData.get('description') || '',
      color: formData.get('color') || '#3B82F6',
    };

    try {
      await areasApi.create(data);
      toast.success('Area created successfully');
      setShowModal(null);
      fetchSupportingData();
    } catch (error) {
      toast.error(error.message || 'Failed to create area');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteArea = async (area) => {
    setConfirmDialog({
      title: 'Delete Area',
      message: `Are you sure you want to delete "${area.name}"? This may affect assigned contacts.`,
      onConfirm: async () => {
        setActionLoading(true);
        try {
          await areasApi.delete(area.id);
          toast.success('Area deleted');
          fetchSupportingData();
        } catch (error) {
          toast.error(error.message || 'Failed to delete area');
        } finally {
          setActionLoading(false);
          setConfirmDialog(null);
        }
      },
    });
  };

  // Toggle selection
  const toggleSelection = (id) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === contacts.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(contacts.map(c => c.id));
    }
  };

  // Loading state
  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size="lg" className="text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
              <p className="text-sm text-gray-500">Welcome back, {user.name}</p>
            </div>
            <div className="flex items-center gap-4">
              <Button variant="outline" onClick={handleExport} icon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              }>
                Export
              </Button>
              <Button variant="outline" onClick={() => setShowModal('changePassword')} icon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
              }>
                Change Password
              </Button>
              <Button variant="ghost" onClick={logout}>Logout</Button>
            </div>
          </div>
        </div>
      </header>

      {/* Stats Cards */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
          <StatCard 
            title="Total" 
            value={stats.total || 0} 
            color="blue"
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>}
          />
          {Object.entries(STATUS_CONFIG).slice(0, 5).map(([status, config]) => (
            <StatCard
              key={status}
              title={config.label}
              value={stats.byStatus?.[status] || 0}
              color={status === 'accepted' ? 'green' : status === 'rejected' ? 'red' : status === 'pending' ? 'yellow' : 'purple'}
              icon={<span className="text-lg">{config.icon}</span>}
            />
          ))}
        </div>

        {/* Tabs */}
        <div className="tabs mb-6">
          {['contacts', 'partners', 'areas', 'activity'].map(tab => (
            <button
              key={tab}
              className={`tab ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Contacts Tab */}
        {activeTab === 'contacts' && (
          <div className="space-y-4">
            {/* Filters and Actions */}
            <div className="flex flex-wrap items-center gap-4 bg-white p-4 rounded-xl shadow-sm">
              <SearchInput
                value={filters.search}
                onChange={(value) => setFilters(prev => ({ ...prev, search: value, page: 1 }))}
                placeholder="Search contacts..."
                className="w-64"
              />
              <Select
                value={filters.status}
                onChange={(value) => setFilters(prev => ({ ...prev, status: value, page: 1 }))}
                placeholder="All Statuses"
                options={Object.entries(STATUS_CONFIG).map(([value, config]) => ({ value, label: config.label }))}
                className="w-40"
              />
              <Select
                value={filters.areaId}
                onChange={(value) => setFilters(prev => ({ ...prev, areaId: value, page: 1 }))}
                placeholder="All Areas"
                options={areas.map(a => ({ value: a.id || a._id, label: a.name }))}
                className="w-40"
              />
              <Select
                value={filters.assignedTo}
                onChange={(value) => setFilters(prev => ({ ...prev, assignedTo: value, page: 1 }))}
                placeholder="All Partners"
                options={partners.filter(w => w.role === 'partner').map(w => ({ value: w.id || w._id, label: w.name }))}
                className="w-40"
              />
              
              <div className="flex-1"></div>
              
              {selectedIds.length > 0 && (
                <>
                  <Button variant="outline" onClick={() => setShowModal('bulkAssign')}>
                    Assign ({selectedIds.length})
                  </Button>
                  <Button variant="danger" onClick={handleBulkDelete}>
                    Delete ({selectedIds.length})
                  </Button>
                </>
              )}
              <Button onClick={() => setShowModal('import')} variant="outline">Import</Button>
              <Button onClick={() => setShowModal('recategorize')} variant="outline">🌍 Categorize</Button>
              <Button onClick={() => setShowModal('addContact')}>Add Contact</Button>
            </div>

            {/* Contacts Table */}
            {loading ? (
              <div className="flex justify-center py-12">
                <Spinner size="lg" className="text-blue-600" />
              </div>
            ) : contacts.length === 0 ? (
              <EmptyState
                title="No contacts found"
                description="Add your first contact or adjust the filters"
                icon={<svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>}
                action={<Button onClick={() => setShowModal('addContact')}>Add Contact</Button>}
              />
            ) : (
              <div className="data-table">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="w-8">
                        <input
                          type="checkbox"
                          checked={selectedIds.length === contacts.length && contacts.length > 0}
                          onChange={toggleSelectAll}
                          className="rounded"
                        />
                      </th>
                      <th>Name</th>
                      <th>Phone</th>
                      <th>Area</th>
                      <th>Assigned To</th>
                      <th>Status</th>
                      <th>Priority</th>
                      <th className="w-24">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contacts.map(contact => (
                      <tr key={contact.id}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(contact.id)}
                            onChange={() => toggleSelection(contact.id)}
                            className="rounded"
                          />
                        </td>
                        <td>
                          <div className="font-medium">{contact.name}</div>
                          {contact.email && <div className="text-xs text-gray-500">{contact.email}</div>}
                        </td>
                        <td>{contact.phone}</td>
                        <td>
                          {contact.area_name || contact.areaName ? (
                            <span className="inline-flex items-center gap-1">
                              {contact.areaColor && (
                                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: contact.areaColor }}></span>
                              )}
                              {contact.area_name || contact.areaName}
                            </span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td>{contact.assigned_to_name || contact.assignedToName || <span className="text-gray-400">Unassigned</span>}</td>
                        <td><StatusBadge status={contact.status} size="sm" /></td>
                        <td>{contact.priority && <PriorityBadge priority={contact.priority} size="sm" />}</td>
                        <td>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => { setEditItem(contact); setShowModal('editContact'); }}
                              className="p-1 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"
                              title="Edit"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleDeleteContact(contact)}
                              className="p-1 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded"
                              title="Delete"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="mt-4">
                <Pagination
                  currentPage={filters.page}
                  totalPages={pagination.totalPages}
                  onPageChange={(page) => setFilters(prev => ({ ...prev, page }))}
                />
              </div>
            )}
          </div>
        )}

        {/* Partners Tab */}
        {activeTab === 'partners' && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => setShowModal('addPartner')}>Add Partner</Button>
            </div>
            
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {partners.filter(w => w.role === 'partner').map(partner => (
                <div key={partner.id || partner._id} className="card">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-gray-900">{partner.name}</h3>
                      <p className="text-sm text-gray-500">@{partner.username}</p>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => { setEditItem(partner); setShowModal('editPartner'); }}
                        className="p-1 text-gray-500 hover:text-blue-600"
                        title="Edit partner"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => { setEditItem(partner); setShowModal('changePassword'); }}
                        className="p-1 text-gray-500 hover:text-yellow-600"
                        title="Reset password"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDeletePartner(partner)}
                        className="p-1 text-gray-500 hover:text-red-600"
                        title="Delete partner"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  <div className="mt-3">
                    <p className="text-xs text-gray-500 mb-1">Assigned Areas:</p>
                    <div className="flex flex-wrap gap-1">
                      {partner.areas?.length > 0 ? (
                        partner.areas.map((area, idx) => (
                          <span key={idx} className="badge badge-blue text-xs">
                            {area.name || area}
                          </span>
                        ))
                      ) : (
                        <span className="text-gray-400 text-sm">No areas assigned</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Areas Tab */}
        {activeTab === 'areas' && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => setShowModal('addArea')}>Add Area</Button>
            </div>
            
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {areas.map(area => (
                <div key={area.id || area._id} className="card">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <span 
                        className="w-4 h-4 rounded-full" 
                        style={{ backgroundColor: area.color || '#3B82F6' }}
                      ></span>
                      <h3 className="font-semibold text-gray-900">{area.name}</h3>
                    </div>
                    <button
                      onClick={() => handleDeleteArea(area)}
                      className="p-1 text-gray-500 hover:text-red-600"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                  {area.description && (
                    <p className="text-sm text-gray-500 mt-2">{area.description}</p>
                  )}
                  <div className="mt-3 flex gap-4 text-sm">
                    <span className="text-gray-500">
                      <strong className="text-gray-700">{area.contactCount || 0}</strong> contacts
                    </span>
                    <span className="text-gray-500">
                      <strong className="text-gray-700">{area.partnerCount || area.workerCount || 0}</strong> partners
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Activity Tab */}
        {activeTab === 'activity' && (
          <div className="card">
            <h3 className="font-semibold mb-4">Recent Activity</h3>
            <p className="text-gray-500 text-sm">Activity logging coming soon...</p>
          </div>
        )}
      </div>

      {/* Modals */}
      <ContactFormModal
        isOpen={showModal === 'addContact' || showModal === 'editContact'}
        onClose={() => { setShowModal(null); setEditItem(null); }}
        onSubmit={showModal === 'editContact' ? handleUpdateContact : handleCreateContact}
        contact={editItem}
        areas={areas}
        partners={partners}
        loading={actionLoading}
      />

      <PartnerFormModal
        isOpen={showModal === 'addPartner' || showModal === 'editPartner'}
        onClose={() => { setShowModal(null); setEditItem(null); }}
        onSubmit={showModal === 'editPartner' ? handleUpdatePartner : handleCreatePartner}
        partner={editItem}
        areas={areas}
        loading={actionLoading}
      />

      <AreaFormModal
        isOpen={showModal === 'addArea'}
        onClose={() => setShowModal(null)}
        onSubmit={handleCreateArea}
        loading={actionLoading}
      />

      <ImportModal
        isOpen={showModal === 'import'}
        onClose={() => setShowModal(null)}
        onImport={handleImportFile}
        areas={areas}
        loading={actionLoading}
        toast={toast}
      />

      <BulkAssignModal
        isOpen={showModal === 'bulkAssign'}
        onClose={() => setShowModal(null)}
        onSubmit={handleBulkAssign}
        onCountryAssign={handleCountryAssign}
        partners={partners}
        areas={areas}
        selectedCount={selectedIds.length}
        loading={actionLoading}
      />

      <RecategorizeModal
        isOpen={showModal === 'recategorize'}
        onClose={() => setShowModal(null)}
        onComplete={() => { fetchContacts(); fetchSupportingData(); }}
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

      {/* Change Password Modal */}
      <ChangePasswordModal
        isOpen={showModal === 'changePassword'}
        onClose={() => { setShowModal(null); setEditItem(null); }}
        user={editItem || user}
        isOwnPassword={!editItem || editItem.id === user.id}
        loading={actionLoading}
        onSubmit={async (data) => {
          setActionLoading(true);
          try {
            await authApi.changePassword(data);
            toast.success(data.userId ? 'Password changed successfully' : 'Your password has been changed');
            setShowModal(null);
            setEditItem(null);
          } catch (error) {
            toast.error(error.message || 'Failed to change password');
          } finally {
            setActionLoading(false);
          }
        }}
      />
    </div>
  );
}

// Contact Form Modal Component
function ContactFormModal({ isOpen, onClose, onSubmit, contact, areas, partners, loading }) {
  const isEdit = !!contact;
  
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEdit ? 'Edit Contact' : 'Add Contact'} size="lg">
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <input
              type="text"
              name="name"
              defaultValue={contact?.name}
              required
              className="input"
              placeholder="Contact name"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone *</label>
            <input
              type="tel"
              name="phone"
              defaultValue={contact?.phone}
              required
              className="input"
              placeholder="+1 234 567 890"
            />
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              name="email"
              defaultValue={contact?.email}
              className="input"
              placeholder="email@example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Area</label>
            <select name="areaId" defaultValue={contact?.areaId || contact?.area_id || ''} className="select">
              <option value="">Select Area</option>
              {areas.map(a => (
                <option key={a.id || a._id} value={a.id || a._id}>{a.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
          <input
            type="text"
            name="address"
            defaultValue={contact?.address}
            className="input"
            placeholder="Full address"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Assign To</label>
            <select name="assignedTo" defaultValue={contact?.assignedTo || contact?.assigned_to || ''} className="select">
              <option value="">Unassigned</option>
              {partners.filter(w => w.role === 'partner').map(w => (
                <option key={w.id || w._id} value={w.id || w._id}>{w.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
            <select name="priority" defaultValue={contact?.priority || 'medium'} className="select">
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
        </div>

        {isEdit && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select name="status" defaultValue={contact?.status} className="select">
              {Object.entries(STATUS_CONFIG).map(([value, config]) => (
                <option key={value} value={value}>{config.label}</option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea
            name="notes"
            defaultValue={contact?.notes}
            className="input"
            rows={3}
            placeholder="Additional notes..."
          />
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={loading}>{isEdit ? 'Update' : 'Create'}</Button>
        </div>
      </form>
    </Modal>
  );
}

// Partner Form Modal Component
function PartnerFormModal({ isOpen, onClose, onSubmit, partner, areas, loading }) {
  const isEdit = !!partner;
  
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEdit ? 'Edit Partner' : 'Add Partner'} size="md">
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
          <input
            type="text"
            name="name"
            defaultValue={partner?.name}
            required
            className="input"
            placeholder="Partner name"
          />
        </div>

        {!isEdit && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Username *</label>
              <input
                type="text"
                name="username"
                required
                className="input"
                placeholder="username"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
              <input
                type="password"
                name="password"
                required
                className="input"
                placeholder="••••••••"
              />
            </div>
          </>
        )}

        {isEdit && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">New Password (leave blank to keep current)</label>
            <input
              type="password"
              name="password"
              className="input"
              placeholder="••••••••"
            />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Assigned Areas</label>
          <div className="space-y-2 max-h-40 overflow-y-auto border rounded-lg p-3">
            {areas.map(area => (
              <label key={area.id || area._id} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  name="areaIds"
                  value={area.id || area._id}
                  defaultChecked={partner?.areas?.some(a => (a.id || a._id || a) === (area.id || area._id))}
                  className="rounded text-blue-600"
                />
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: area.color || '#3B82F6' }}></span>
                  {area.name}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={loading}>{isEdit ? 'Update' : 'Create'}</Button>
        </div>
      </form>
    </Modal>
  );
}

// Area Form Modal Component
function AreaFormModal({ isOpen, onClose, onSubmit, loading }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Area" size="sm">
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Area Name *</label>
          <input
            type="text"
            name="name"
            required
            className="input"
            placeholder="e.g., Downtown District"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea
            name="description"
            className="input"
            rows={2}
            placeholder="Optional description"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Color</label>
          <input
            type="color"
            name="color"
            defaultValue="#3B82F6"
            className="w-full h-10 rounded-lg cursor-pointer"
          />
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={loading}>Create</Button>
        </div>
      </form>
    </Modal>
  );
}

// Change Password Modal Component
function ChangePasswordModal({ isOpen, onClose, user, isOwnPassword, loading, onSubmit }) {
  const [error, setError] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    const formData = new FormData(e.target);
    const newPassword = formData.get('newPassword');
    const confirmPassword = formData.get('confirmPassword');
    const currentPassword = formData.get('currentPassword');

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    const data = { newPassword };
    
    if (isOwnPassword) {
      data.currentPassword = currentPassword;
    } else {
      data.userId = user.id || user._id;
    }

    await onSubmit(data);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isOwnPassword ? 'Change Your Password' : `Change Password for ${user?.name}`} size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-700">
          <svg className="w-5 h-5 inline-block mr-2 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {isOwnPassword 
            ? 'Enter your current password and choose a new secure password.'
            : `You are changing the password for user "${user?.name}". They will need to use this new password to login.`
          }
        </div>

        {isOwnPassword && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Current Password *</label>
            <input
              type={showPasswords ? 'text' : 'password'}
              name="currentPassword"
              required
              className="input"
              placeholder="Enter your current password"
            />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">New Password *</label>
          <input
            type={showPasswords ? 'text' : 'password'}
            name="newPassword"
            required
            minLength={6}
            className="input"
            placeholder="Enter new password (min 6 characters)"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Confirm New Password *</label>
          <input
            type={showPasswords ? 'text' : 'password'}
            name="confirmPassword"
            required
            minLength={6}
            className="input"
            placeholder="Confirm new password"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={showPasswords}
            onChange={(e) => setShowPasswords(e.target.checked)}
            className="rounded border-gray-300"
          />
          Show passwords
        </label>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={loading}>
            {isOwnPassword ? 'Change Password' : 'Reset Password'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// Import Modal Component with Preview and Column Mapping
function ImportModal({ isOpen, onClose, onImport, areas, loading, toast }) {
  const [step, setStep] = useState('upload'); // 'upload' | 'preview' | 'mapping'
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [columnMapping, setColumnMapping] = useState({});
  const [selectedSheet, setSelectedSheet] = useState(0);
  const [areaId, setAreaId] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [filterText, setFilterText] = useState('');
  const [groupByCountry, setGroupByCountry] = useState(false);

  const TARGET_FIELDS = [
    { key: 'name', label: 'Name', required: true },
    { key: 'phone', label: 'Phone', required: false },
    { key: 'email', label: 'Email', required: false },
    { key: 'address', label: 'Address', required: false },
    { key: 'notes', label: 'Notes', required: false },
    { key: 'tags', label: 'Tags', required: false },
  ];

  const SUPPORTED_TYPES = '.csv,.xlsx,.xls,.json,.txt,.tsv';

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setStep('upload');
      setFile(null);
      setPreview(null);
      setColumnMapping({});
      setSelectedSheet(0);
      setAreaId('');
      setFilterText('');
      setGroupByCountry(false);
    }
  }, [isOpen]);

  // Handle file selection
  const handleFileSelect = async (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setPreviewLoading(true);

    try {
      const result = await contactsApi.previewImport(selectedFile, selectedSheet);
      setPreview(result);
      setColumnMapping(result.suggestedMapping || {});
      setStep('preview');
    } catch (error) {
      toast.error(error.message || 'Failed to parse file');
      setFile(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  // Handle sheet change for Excel files
  const handleSheetChange = async (e) => {
    const newIndex = parseInt(e.target.value, 10);
    setSelectedSheet(newIndex);
    
    if (file) {
      setPreviewLoading(true);
      try {
        const result = await contactsApi.previewImport(file, newIndex);
        setPreview(result);
        setColumnMapping(result.suggestedMapping || {});
      } catch (error) {
        toast.error('Failed to load sheet');
      } finally {
        setPreviewLoading(false);
      }
    }
  };

  // Handle column mapping change
  const handleMappingChange = (sourceCol, targetField) => {
    setColumnMapping(prev => {
      const newMapping = { ...prev };
      // Remove previous mapping to this target field
      Object.keys(newMapping).forEach(key => {
        if (newMapping[key] === targetField && key !== sourceCol) {
          delete newMapping[key];
        }
      });
      if (targetField) {
        newMapping[sourceCol] = targetField;
      } else {
        delete newMapping[sourceCol];
      }
      return newMapping;
    });
  };

  // Filter preview data
  const filteredPreview = preview?.preview?.filter(row => {
    if (!filterText) return true;
    const searchLower = filterText.toLowerCase();
    return Object.values(row).some(val => 
      String(val).toLowerCase().includes(searchLower)
    );
  }) || [];

  // Check if name column is mapped
  const hasNameMapping = Object.values(columnMapping).includes('name');

  // Handle import
  const handleImport = async () => {
    if (!hasNameMapping) {
      toast.error('Please map a column to "Name" field');
      return;
    }

    try {
      const result = await onImport(file, {
        areaId: groupByCountry ? '' : areaId, // Don't use areaId if grouping by country
        columnMapping,
        sheetIndex: selectedSheet,
        groupByCountry,
      });
      
      let message = `Imported ${result.imported} contacts (${result.skipped} skipped)`;
      if (result.countriesCreated && result.countriesCreated.length > 0) {
        message += `. Created ${result.countriesCreated.length} country areas.`;
      }
      toast.success(message);
    } catch (error) {
      toast.error(error.message || 'Import failed');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Import Contacts" size="xl">
      <div className="space-y-4">
        {/* Step Indicator */}
        <div className="flex items-center justify-center gap-2 mb-4">
          <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm ${step === 'upload' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
            <span className="w-5 h-5 rounded-full bg-current bg-opacity-20 flex items-center justify-center text-xs">1</span>
            Upload
          </div>
          <div className="w-8 h-px bg-gray-300"></div>
          <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm ${step === 'preview' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
            <span className="w-5 h-5 rounded-full bg-current bg-opacity-20 flex items-center justify-center text-xs">2</span>
            Preview & Map
          </div>
        </div>

        {/* Upload Step */}
        {step === 'upload' && (
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-medium text-blue-900 mb-2">Supported File Types</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm text-blue-700">
                <div><span className="font-medium">Excel:</span> .xlsx, .xls</div>
                <div><span className="font-medium">CSV:</span> .csv</div>
                <div><span className="font-medium">JSON:</span> .json</div>
                <div><span className="font-medium">Text:</span> .txt, .tsv</div>
              </div>
              <p className="text-sm text-blue-600 mt-2">
                Required: <code className="bg-blue-100 px-1 rounded">name</code> column. 
                Optional: phone, email, address, notes, tags
              </p>
            </div>

            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-400 transition-colors">
              <input
                type="file"
                accept={SUPPORTED_TYPES}
                onChange={handleFileSelect}
                className="hidden"
                id="file-upload"
                disabled={previewLoading}
              />
              <label htmlFor="file-upload" className="cursor-pointer">
                <div className="text-4xl mb-2">📁</div>
                <p className="text-gray-700 font-medium">
                  {previewLoading ? 'Processing...' : 'Click to select or drop a file'}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  Excel, CSV, JSON, or Text files
                </p>
              </label>
            </div>
          </div>
        )}

        {/* Preview & Mapping Step */}
        {step === 'preview' && preview && (
          <div className="space-y-4">
            {/* File Info */}
            <div className="bg-gray-50 rounded-lg p-3 flex items-center justify-between">
              <div>
                <span className="font-medium">{preview.fileName}</span>
                <span className="text-sm text-gray-500 ml-2">({preview.fileType.toUpperCase()})</span>
                <span className="text-sm text-gray-500 ml-2">• {preview.totalRows} rows</span>
              </div>
              <Button variant="secondary" size="sm" onClick={() => {
                setStep('upload');
                setFile(null);
                setPreview(null);
              }}>
                Change File
              </Button>
            </div>

            {/* Sheet Selector for Excel */}
            {preview.sheetNames?.length > 1 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Select Sheet</label>
                <select 
                  value={selectedSheet} 
                  onChange={handleSheetChange}
                  className="select"
                  disabled={previewLoading}
                >
                  {preview.sheetNames.map((name, index) => (
                    <option key={index} value={index}>{name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Column Mapping */}
            <div className="border rounded-lg p-4">
              <h4 className="font-medium text-gray-900 mb-3">Column Mapping</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {preview.headers?.map(header => (
                  <div key={header} className="flex items-center gap-2">
                    <span className="text-sm text-gray-600 truncate min-w-0 flex-1" title={header}>
                      {header}
                    </span>
                    <span className="text-gray-400">→</span>
                    <select
                      value={columnMapping[header] || ''}
                      onChange={(e) => handleMappingChange(header, e.target.value)}
                      className="select text-sm py-1 flex-1"
                    >
                      <option value="">-- Skip --</option>
                      {TARGET_FIELDS.map(field => (
                        <option key={field.key} value={field.key}>
                          {field.label} {field.required ? '*' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              {!hasNameMapping && (
                <p className="text-red-500 text-sm mt-2">⚠️ Please map a column to "Name" field</p>
              )}
            </div>

            {/* Area Assignment */}
            <div className="space-y-3">
              {/* Group by Country Toggle */}
              <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <input
                  type="checkbox"
                  id="groupByCountry"
                  checked={groupByCountry}
                  onChange={(e) => setGroupByCountry(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                />
                <label htmlFor="groupByCountry" className="flex-1">
                  <span className="font-medium text-blue-900">Group by Country Code</span>
                  <p className="text-xs text-blue-700">Auto-create areas based on phone country codes (e.g., 🇺🇸 United States, 🇮🇳 India)</p>
                </label>
              </div>

              {/* Area dropdown - disabled when grouping by country */}
              {!groupByCountry && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Assign to Area</label>
                  <select value={areaId} onChange={(e) => setAreaId(e.target.value)} className="select">
                    <option value="">No Area</option>
                    {areas.map(a => (
                      <option key={a.id || a._id} value={a.id || a._id}>{a.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Data Preview */}
            <div className="border rounded-lg">
              <div className="p-3 bg-gray-50 border-b flex items-center justify-between">
                <h4 className="font-medium text-gray-900">Data Preview (first 10 rows)</h4>
                <input
                  type="text"
                  placeholder="Filter preview..."
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  className="input text-sm py-1 px-2 w-48"
                />
              </div>
              <div className="overflow-x-auto max-h-64">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-100 sticky top-0">
                    <tr>
                      {preview.headers?.map(header => (
                        <th key={header} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          {header}
                          {columnMapping[header] && (
                            <span className="ml-1 text-blue-600 normal-case">→ {columnMapping[header]}</span>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {filteredPreview.map((row, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        {preview.headers?.map(header => (
                          <td key={header} className="px-3 py-2 text-gray-700 whitespace-nowrap max-w-xs truncate" title={row[header]}>
                            {row[header] || '-'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredPreview.length === 0 && (
                  <div className="p-4 text-center text-gray-500">No matching rows</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-between pt-4 border-t">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <div className="flex gap-2">
            {step === 'preview' && (
              <Button 
                onClick={handleImport} 
                loading={loading}
                disabled={!hasNameMapping || previewLoading}
              >
                Import {preview?.totalRows || 0} Contacts
              </Button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

// Bulk Assign Modal Component
function BulkAssignModal({ isOpen, onClose, onSubmit, partners, selectedCount, loading, onCountryAssign, areas }) {
  const [mode, setMode] = useState('selected'); // 'selected' | 'country' | 'area'
  const [countryGroups, setCountryGroups] = useState([]);
  const [selectedCountry, setSelectedCountry] = useState('');
  const [selectedArea, setSelectedArea] = useState('');
  const [loadingCountries, setLoadingCountries] = useState(false);

  // Fetch country groups when switching to country mode
  useEffect(() => {
    if (mode === 'country' && countryGroups.length === 0) {
      setLoadingCountries(true);
      contactsApi.getCountryGroups()
        .then(data => setCountryGroups(data.countries || []))
        .catch(() => setCountryGroups([]))
        .finally(() => setLoadingCountries(false));
    }
  }, [mode]);

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      setMode('selected');
      setSelectedCountry('');
      setSelectedArea('');
    }
  }, [isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const assignedTo = formData.get('assignedTo');
    
    if (!assignedTo) return;

    if (mode === 'country' && selectedCountry) {
      await onCountryAssign(selectedCountry, assignedTo);
    } else if (mode === 'area' && selectedArea) {
      await onCountryAssign(null, assignedTo, selectedArea);
    } else {
      onSubmit(e);
    }
  };

  const selectedCountryInfo = countryGroups.find(c => c.countryCode === selectedCountry);
  const selectedAreaInfo = areas?.find(a => (a.id || a._id) === selectedArea);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Assign Contacts" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Mode Selector */}
        <div className="flex gap-2 p-1 bg-gray-100 rounded-lg">
          <button
            type="button"
            onClick={() => setMode('selected')}
            className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
              mode === 'selected' ? 'bg-white shadow text-blue-600' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Selected ({selectedCount})
          </button>
          <button
            type="button"
            onClick={() => setMode('country')}
            className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
              mode === 'country' ? 'bg-white shadow text-blue-600' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            By Country 🌍
          </button>
          <button
            type="button"
            onClick={() => setMode('area')}
            className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
              mode === 'area' ? 'bg-white shadow text-blue-600' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            By Area
          </button>
        </div>

        {/* Selected Mode */}
        {mode === 'selected' && (
          <p className="text-gray-600">
            Assign <strong>{selectedCount}</strong> selected contact(s) to a partner.
          </p>
        )}

        {/* Country Mode */}
        {mode === 'country' && (
          <div className="space-y-3">
            {loadingCountries ? (
              <div className="text-center py-4 text-gray-500">Loading countries...</div>
            ) : countryGroups.length === 0 ? (
              <div className="text-center py-4 text-gray-500">No contacts with country codes found</div>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Select Country *</label>
                  <select 
                    value={selectedCountry} 
                    onChange={(e) => setSelectedCountry(e.target.value)}
                    className="select"
                    required={mode === 'country'}
                  >
                    <option value="">Choose a country</option>
                    {countryGroups.map(c => (
                      <option key={c.countryCode} value={c.countryCode}>
                        {c.flag} {c.countryName} ({c.count} contacts, {c.unassignedCount} unassigned)
                      </option>
                    ))}
                  </select>
                </div>
                {selectedCountryInfo && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{selectedCountryInfo.flag}</span>
                      <div>
                        <p className="font-medium text-blue-900">{selectedCountryInfo.countryName}</p>
                        <p className="text-sm text-blue-700">
                          {selectedCountryInfo.count} total • {selectedCountryInfo.unassignedCount} unassigned
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Area Mode */}
        {mode === 'area' && (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Select Area *</label>
              <select 
                value={selectedArea} 
                onChange={(e) => setSelectedArea(e.target.value)}
                className="select"
                required={mode === 'area'}
              >
                <option value="">Choose an area</option>
                {areas?.map(a => (
                  <option key={a.id || a._id} value={a.id || a._id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            {selectedAreaInfo && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <p className="font-medium text-green-900">{selectedAreaInfo.name}</p>
                <p className="text-sm text-green-700">{selectedAreaInfo.description || 'No description'}</p>
              </div>
            )}
          </div>
        )}

        {/* Partner Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Assign to Partner *</label>
          <select name="assignedTo" required className="select">
            <option value="">Select Partner</option>
            {partners.filter(w => w.role === 'partner').map(w => (
              <option key={w.id || w._id} value={w.id || w._id}>{w.name}</option>
            ))}
          </select>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button 
            type="submit" 
            loading={loading}
            disabled={
              (mode === 'selected' && selectedCount === 0) ||
              (mode === 'country' && !selectedCountry) ||
              (mode === 'area' && !selectedArea)
            }
          >
            {mode === 'selected' && `Assign ${selectedCount} Contacts`}
            {mode === 'country' && selectedCountryInfo && `Assign ${selectedCountryInfo.count} Contacts`}
            {mode === 'country' && !selectedCountryInfo && 'Assign Contacts'}
            {mode === 'area' && 'Assign Area Contacts'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// Recategorize Modal - Categorize existing contacts by country code
function RecategorizeModal({ isOpen, onClose, onComplete, toast }) {
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [overwrite, setOverwrite] = useState(false);
  const [result, setResult] = useState(null);

  // Fetch preview when modal opens or overwrite changes
  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      setResult(null);
      contactsApi.previewRecategorize(overwrite)
        .then(data => setPreview(data))
        .catch(() => setPreview(null))
        .finally(() => setLoading(false));
    } else {
      setPreview(null);
      setResult(null);
      setOverwrite(false);
    }
  }, [isOpen, overwrite]);

  const handleRecategorize = async () => {
    setLoading(true);
    try {
      const data = await contactsApi.recategorize(overwrite);
      setResult(data);
      toast.success(`Categorized ${data.updated} contacts into ${data.countriesFound.length} countries`);
      onComplete();
    } catch (error) {
      toast.error(error.message || 'Failed to recategorize');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="🌍 Categorize by Country Code" size="lg">
      <div className="space-y-4">
        {/* Explanation */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="font-medium text-blue-900 mb-2">How it works</h4>
          <p className="text-sm text-blue-700">
            This will analyze phone numbers in existing contacts and automatically create country-based areas 
            (e.g., 🇺🇸 United States, 🇮🇳 India) based on the country code in each phone number.
          </p>
        </div>

        {/* Overwrite Toggle */}
        <div className="flex items-center gap-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <input
            type="checkbox"
            id="overwriteAreas"
            checked={overwrite}
            onChange={(e) => setOverwrite(e.target.checked)}
            className="w-4 h-4 text-yellow-600 rounded focus:ring-yellow-500"
          />
          <label htmlFor="overwriteAreas" className="flex-1">
            <span className="font-medium text-yellow-900">Overwrite existing area assignments</span>
            <p className="text-xs text-yellow-700">If checked, contacts already assigned to an area will be reassigned based on their phone country code</p>
          </label>
        </div>

        {/* Preview Results or Final Results */}
        {result ? (
          // Show results after recategorization
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h4 className="font-medium text-green-900 mb-2">✅ Categorization Complete</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div className="bg-white rounded p-2 text-center">
                  <div className="text-2xl font-bold text-green-600">{result.updated}</div>
                  <div className="text-gray-500">Updated</div>
                </div>
                <div className="bg-white rounded p-2 text-center">
                  <div className="text-2xl font-bold text-gray-600">{result.skipped}</div>
                  <div className="text-gray-500">Skipped</div>
                </div>
                <div className="bg-white rounded p-2 text-center">
                  <div className="text-2xl font-bold text-yellow-600">{result.noPhone}</div>
                  <div className="text-gray-500">No Phone</div>
                </div>
                <div className="bg-white rounded p-2 text-center">
                  <div className="text-2xl font-bold text-red-600">{result.noCountry}</div>
                  <div className="text-gray-500">Unknown Country</div>
                </div>
              </div>
            </div>

            {result.countriesFound.length > 0 && (
              <div>
                <h4 className="font-medium text-gray-900 mb-2">Countries Found</h4>
                <div className="max-h-48 overflow-y-auto border rounded-lg">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left">Country</th>
                        <th className="px-3 py-2 text-right">Contacts</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {result.countriesFound.map(c => (
                        <tr key={c.countryCode}>
                          <td className="px-3 py-2">{c.flag} {c.countryName}</td>
                          <td className="px-3 py-2 text-right font-medium">{c.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : preview ? (
          // Show preview before recategorization
          <div className="space-y-4">
            <div className="bg-gray-50 border rounded-lg p-4">
              <h4 className="font-medium text-gray-900 mb-2">Preview</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div className="bg-white rounded p-2 text-center border">
                  <div className="text-2xl font-bold text-blue-600">{preview.totalContacts}</div>
                  <div className="text-gray-500">Total Contacts</div>
                </div>
                <div className="bg-white rounded p-2 text-center border">
                  <div className="text-2xl font-bold text-green-600">{preview.wouldUpdate}</div>
                  <div className="text-gray-500">Will Update</div>
                </div>
                <div className="bg-white rounded p-2 text-center border">
                  <div className="text-2xl font-bold text-gray-600">{preview.wouldSkip}</div>
                  <div className="text-gray-500">Will Skip</div>
                </div>
                <div className="bg-white rounded p-2 text-center border">
                  <div className="text-2xl font-bold text-yellow-600">{preview.noPhone + preview.noCountry}</div>
                  <div className="text-gray-500">No Country</div>
                </div>
              </div>
            </div>

            {preview.countries.length > 0 && (
              <div>
                <h4 className="font-medium text-gray-900 mb-2">Countries Detected ({preview.countries.length})</h4>
                <div className="max-h-48 overflow-y-auto border rounded-lg">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left">Country</th>
                        <th className="px-3 py-2 text-right">Contacts</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {preview.countries.map(c => (
                        <tr key={c.countryCode}>
                          <td className="px-3 py-2">
                            <span className="inline-flex items-center gap-2">
                              <span>{c.flag}</span>
                              <span>{c.countryName}</span>
                              <span 
                                className="w-3 h-3 rounded-full" 
                                style={{ backgroundColor: c.color }}
                              ></span>
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right font-medium">{c.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {preview.countries.length === 0 && preview.wouldUpdate === 0 && (
              <div className="text-center py-8 text-gray-500">
                <div className="text-4xl mb-2">📱</div>
                <p>No contacts with recognizable country codes found.</p>
                <p className="text-sm">Make sure phone numbers include country codes (e.g., +1, +91)</p>
              </div>
            )}
          </div>
        ) : loading ? (
          <div className="flex justify-center py-8">
            <Spinner size="lg" className="text-blue-600" />
          </div>
        ) : null}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button type="button" variant="secondary" onClick={onClose}>
            {result ? 'Close' : 'Cancel'}
          </Button>
          {!result && preview && preview.wouldUpdate > 0 && (
            <Button 
              onClick={handleRecategorize}
              loading={loading}
            >
              Categorize {preview.wouldUpdate} Contacts
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
