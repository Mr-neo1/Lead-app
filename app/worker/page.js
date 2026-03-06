'use client';

import { useState, useEffect, useCallback, memo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/Toast';
import { contactsApi } from '@/lib/api-client';
import { ROLES } from '@/lib/constants';

// Translations
const T = {
  en: {
    pending: 'Pending', accepted: 'Accepted', rejected: 'Rejected', followup: 'Follow Up',
    search: 'Search by name, phone or address...', logout: 'Sign out',
    noContacts: 'No contacts found', noAssigned: 'No contacts assigned yet',
    tryFilters: 'Try adjusting your filters', contacts: 'contacts',
    edit: 'Edit', call: 'Call', save: 'Save', saving: 'Saving...', notes: 'Add notes...',
  },
  es: {
    pending: 'Pendientes', accepted: 'Aceptados', rejected: 'Rechazados', followup: 'Seguimiento',
    search: 'Buscar por nombre, teléfono o dirección...', logout: 'Salir',
    noContacts: 'No hay contactos', noAssigned: 'Sin contactos asignados',
    tryFilters: 'Intenta ajustar los filtros', contacts: 'contactos',
    edit: 'Editar', call: 'Llamar', save: 'Guardar', saving: 'Guardando...', notes: 'Agregar notas...',
  },
};

// Status config with colors
const STATUS = {
  pending: { key: 'pending', color: 'bg-amber-500', light: 'bg-amber-50 text-amber-700 border-amber-200' },
  accepted: { key: 'accepted', color: 'bg-emerald-500', light: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  rejected: { key: 'rejected', color: 'bg-rose-500', light: 'bg-rose-50 text-rose-700 border-rose-200' },
  followup: { key: 'followup', color: 'bg-blue-500', light: 'bg-blue-50 text-blue-700 border-blue-200' },
};

// Debounce hook
function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

export default function WorkerDashboard() {
  const { user, logout, loading: authLoading } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const initialLoad = useRef(true);

  const [loading, setLoading] = useState(true);
  const [contacts, setContacts] = useState([]);
  const [stats, setStats] = useState({});
  const [selectedContact, setSelectedContact] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [lang, setLang] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('app_language') || 'es';
    }
    return 'es';
  });
  
  // Persist language to localStorage
  useEffect(() => {
    localStorage.setItem('app_language', lang);
  }, [lang]);
  
  const debouncedSearch = useDebounce(searchInput, 300);
  const t = T[lang];

  // Auth check
  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
    else if (!authLoading && user?.role === ROLES.ADMIN) router.push('/admin');
  }, [user, authLoading, router]);

  // Fetch ALL contacts (no pagination)
  const fetchContacts = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      const params = { limit: 500 }; // Get all contacts
      if (statusFilter) params.status = statusFilter;
      if (debouncedSearch) params.search = debouncedSearch;

      const response = await contactsApi.getAll(params);
      if (response?.data) {
        setContacts(response.data);
      } else if (Array.isArray(response)) {
        setContacts(response);
      }
    } catch (error) {
      // Silent
    } finally {
      setLoading(false);
    }
  }, [user, statusFilter, debouncedSearch]);

  const fetchStats = useCallback(async () => {
    if (!user) return;
    try {
      const response = await contactsApi.getStats();
      setStats(response?.data || response || {});
    } catch (error) {
      // Silent
    }
  }, [user]);

  useEffect(() => {
    if (user && user.role !== ROLES.ADMIN) {
      if (initialLoad.current) {
        fetchContacts();
        fetchStats();
        initialLoad.current = false;
      } else {
        fetchContacts();
      }
    }
  }, [user, statusFilter, debouncedSearch, fetchContacts, fetchStats]);

  // Quick status update
  const handleQuickStatus = async (contact, status) => {
    try {
      await contactsApi.update(contact.id, { status });
      toast.success('Actualizado');
      fetchContacts();
      fetchStats();
    } catch {
      toast.error('Error');
    }
  };

  // Full update from modal
  const handleStatusUpdate = async (e) => {
    e.preventDefault();
    if (!selectedContact) return;
    setActionLoading(true);
    const formData = new FormData(e.target);
    try {
      await contactsApi.update(selectedContact.id, {
        status: formData.get('status'),
        notes: formData.get('notes') || '',
      });
      toast.success('Actualizado');
      setSelectedContact(null);
      fetchContacts();
      fetchStats();
    } catch {
      toast.error('Error');
    } finally {
      setActionLoading(false);
    }
  };

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  const displayStats = {
    pending: stats.pending || 0,
    accepted: stats.accepted || 0,
    rejected: stats.rejected || 0,
    followup: stats.followup || 0,
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/40">
      {/* Top Bar */}
      <header className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-500 px-4 py-4 sticky top-0 z-50 shadow-lg">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center text-white font-semibold text-sm ring-2 ring-white/30">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <span className="font-semibold text-white">{user.name.split(' ')[0]}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setLang(l => l === 'en' ? 'es' : 'en')}
              className="px-3 py-1.5 rounded-lg bg-white/20 backdrop-blur text-white text-sm font-medium hover:bg-white/30 transition-colors"
            >
              {lang === 'en' ? '🇪🇸 ES' : '🇺🇸 EN'}
            </button>
            <button onClick={logout} className="px-3 py-1.5 rounded-lg bg-white/20 backdrop-blur text-white text-sm font-medium hover:bg-white/30 transition-colors">
              {t.logout}
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-4">
        {/* Stats Cards */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          {Object.entries(STATUS).map(([key, config]) => (
            <button
              key={key}
              onClick={() => setStatusFilter(f => f === key ? '' : key)}
              className={`p-4 rounded-xl text-center transition-all ${
                statusFilter === key
                  ? `${config.color} text-white shadow-lg scale-105`
                  : 'bg-white border border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className={`text-2xl font-bold ${statusFilter === key ? 'text-white' : 'text-gray-900'}`}>
                {displayStats[key]}
              </div>
              <div className={`text-xs font-medium ${statusFilter === key ? 'text-white/80' : 'text-gray-500'}`}>
                {t[key]}
              </div>
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="mb-4">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t.search}
            className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>

        {/* Contacts Table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="p-8 text-center">
              <div className="w-8 h-8 border-2 border-gray-300 border-t-indigo-600 rounded-full animate-spin mx-auto"></div>
            </div>
          ) : contacts.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <p className="font-medium">{t.noContacts}</p>
              <p className="text-sm mt-1">{searchInput || statusFilter ? t.tryFilters : t.noAssigned}</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {contacts.map((contact) => (
                <ContactRow
                  key={contact.id}
                  contact={contact}
                  t={t}
                  onEdit={() => setSelectedContact(contact)}
                  onQuickStatus={handleQuickStatus}
                />
              ))}
            </div>
          )}
        </div>

        {/* Contact count */}
        {!loading && contacts.length > 0 && (
          <div className="mt-3 text-center text-sm text-gray-400">
            {contacts.length} {t.contacts}
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {selectedContact && (
        <EditModal
          contact={selectedContact}
          t={t}
          loading={actionLoading}
          onClose={() => setSelectedContact(null)}
          onSubmit={handleStatusUpdate}
        />
      )}
    </div>
  );
}

// Contact Row Component
const ContactRow = memo(function ContactRow({ contact, t, onEdit, onQuickStatus }) {
  const config = STATUS[contact.status] || STATUS.pending;

  return (
    <div className="flex items-center gap-4 px-4 py-3 hover:bg-gray-50 transition-colors">
      {/* Avatar */}
      <div className={`w-10 h-10 rounded-full ${config.color} flex items-center justify-center text-white font-medium text-sm shrink-0`}>
        {contact.name.charAt(0).toUpperCase()}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="font-medium text-gray-900 truncate">{contact.name}</div>
        <div className="text-sm text-gray-500 truncate">{contact.phone}</div>
      </div>

      {/* Address (desktop) */}
      <div className="hidden md:block flex-1 min-w-0">
        <div className="text-sm text-gray-500 truncate">{contact.address || '—'}</div>
      </div>

      {/* Quick Actions */}
      <div className="flex items-center gap-1.5">
        <a
          href={`tel:${contact.phone}`}
          className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center hover:bg-blue-100 transition-colors"
          title="Llamar"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
          </svg>
        </a>
        <button
          onClick={() => window.open(`https://wa.me/${contact.phone.replace(/[\s\-\(\)\+]/g, '')}`, '_blank')}
          className="w-8 h-8 rounded-lg bg-green-50 text-green-600 flex items-center justify-center hover:bg-green-100 transition-colors"
          title="WhatsApp"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
        </button>
        {contact.address && (
          <button
            onClick={() => window.open(`https://maps.google.com/?q=${encodeURIComponent(contact.address)}`, '_blank')}
            className="w-8 h-8 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center hover:bg-orange-100 transition-colors"
            title="Mapa"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        )}
      </div>

      {/* Status Buttons */}
      <div className="flex gap-1">
        {Object.entries(STATUS).map(([status, cfg]) => (
          <button
            key={status}
            onClick={() => onQuickStatus(contact, status)}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
              contact.status === status
                ? `${cfg.color} text-white shadow-sm`
                : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
            }`}
            title={t[status]}
          >
            {status === 'pending' && (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            {status === 'accepted' && (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            )}
            {status === 'rejected' && (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
            {status === 'followup' && (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            )}
          </button>
        ))}
      </div>

      {/* Edit Button */}
      <button
        onClick={onEdit}
        className="px-3 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-lg hover:bg-gray-800 transition-colors"
      >
        {t.edit}
      </button>
    </div>
  );
});

// Edit Modal
function EditModal({ contact, t, loading, onClose, onSubmit }) {
  const config = STATUS[contact.status] || STATUS.pending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose}></div>
      
      <div className="relative bg-white rounded-2xl w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">{t.edit}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-5 space-y-4">
          {/* Contact Info */}
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
            <div className={`w-12 h-12 rounded-full ${config.color} flex items-center justify-center text-white font-semibold`}>
              {contact.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="font-medium text-gray-900">{contact.name}</p>
              <p className="text-sm text-gray-500">{contact.phone}</p>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-2 gap-2">
            <a href={`tel:${contact.phone}`} className="py-2.5 bg-blue-500 text-white rounded-lg text-center text-sm font-medium">
              {t.call}
            </a>
            <button
              type="button"
              onClick={() => window.open(`https://wa.me/${contact.phone.replace(/[\s\-\(\)\+]/g, '')}`, '_blank')}
              className="py-2.5 bg-green-500 text-white rounded-lg text-center text-sm font-medium"
            >
              WhatsApp
            </button>
          </div>

          {/* Status Selection */}
          <div className="grid grid-cols-4 gap-2">
            {Object.entries(STATUS).map(([status, cfg]) => (
              <label
                key={status}
                className={`flex flex-col items-center py-3 rounded-xl cursor-pointer transition-all border-2 ${
                  contact.status === status
                    ? `${cfg.color} text-white border-transparent`
                    : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300'
                }`}
              >
                <input
                  type="radio"
                  name="status"
                  value={status}
                  defaultChecked={contact.status === status}
                  className="sr-only"
                />
                <span className="text-xs font-medium">{t[status]}</span>
              </label>
            ))}
          </div>

          {/* Notes */}
          <textarea
            name="notes"
            defaultValue={contact.notes}
            placeholder={t.notes}
            rows={2}
            className="w-full px-3 py-2 bg-gray-50 rounded-xl border border-gray-200 resize-none text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-gray-900 text-white font-medium rounded-xl disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                {t.saving}
              </>
            ) : (
              t.save
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
