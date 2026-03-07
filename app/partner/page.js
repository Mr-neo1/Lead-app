'use client';

import { useState, useEffect, useCallback, memo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/Toast';
import Modal from '@/components/Modal';
import { contactsApi, settingsApi, uploadApi, authApi } from '@/lib/api-client';
import { ROLES } from '@/lib/constants';

// Translations
const T = {
  en: {
    pending: 'Pending', accepted: 'Accepted', rejected: 'Rejected', followup: 'Follow Up',
    search: 'Search contacts...', logout: 'Sign out', profile: 'Profile',
    noContacts: 'No contacts found', noAssigned: 'No contacts assigned yet',
    tryFilters: 'Try adjusting filters', contacts: 'contacts',
    edit: 'Edit', call: 'Call', whatsapp: 'WhatsApp', email: 'Email', save: 'Save', saving: 'Saving...', 
    notes: 'Add notes...', allContacts: 'All', changePhoto: 'Change Photo', myProfile: 'My Profile',
    changePassword: 'Change Password', currentPassword: 'Current Password', newPassword: 'New Password',
  },
  es: {
    pending: 'Pendientes', accepted: 'Aceptados', rejected: 'Rechazados', followup: 'Seguimiento',
    search: 'Buscar contactos...', logout: 'Salir', profile: 'Perfil',
    noContacts: 'No hay contactos', noAssigned: 'Sin contactos asignados',
    tryFilters: 'Ajusta los filtros', contacts: 'contactos',
    edit: 'Editar', call: 'Llamar', whatsapp: 'WhatsApp', email: 'Correo', save: 'Guardar', saving: 'Guardando...',
    notes: 'Agregar notas...', allContacts: 'Todos', changePhoto: 'Cambiar Foto', myProfile: 'Mi Perfil',
    changePassword: 'Cambiar Contraseña', currentPassword: 'Contraseña Actual', newPassword: 'Nueva Contraseña',
  },
};

// Status config
const STATUS = {
  pending: { key: 'pending', color: 'bg-amber-500', light: 'bg-amber-50 text-amber-700 border-amber-200', icon: '⏳' },
  accepted: { key: 'accepted', color: 'bg-emerald-500', light: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: '✅' },
  rejected: { key: 'rejected', color: 'bg-rose-500', light: 'bg-rose-50 text-rose-700 border-rose-200', icon: '❌' },
  followup: { key: 'followup', color: 'bg-blue-500', light: 'bg-blue-50 text-blue-700 border-blue-200', icon: '📞' },
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

// Profile Picture Component
const ProfilePicture = memo(function ProfilePicture({ src, name, size = 'md', editable = false, onUpload, loading = false }) {
  const inputRef = useRef(null);
  const sizes = { sm: 'w-10 h-10 text-sm', md: 'w-14 h-14 text-lg', lg: 'w-20 h-20 text-2xl', xl: 'w-24 h-24 text-3xl' };

  const handleClick = () => { if (editable && inputRef.current) inputRef.current.click(); };
  const handleChange = (e) => { const file = e.target.files?.[0]; if (file && onUpload) onUpload(file); };

  return (
    <div className="relative inline-block">
      <button
        onClick={handleClick}
        disabled={!editable || loading}
        className={`${sizes[size]} rounded-full overflow-hidden flex items-center justify-center font-bold transition-all ${
          editable ? 'cursor-pointer hover:ring-2 hover:ring-blue-400 hover:ring-offset-2' : 'cursor-default'
        } ${loading ? 'opacity-50' : ''}`}
        style={{ background: src ? 'transparent' : 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
      >
        {src ? (
          <img src={src} alt={name} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <span className="text-white">{name?.charAt(0)?.toUpperCase() || '?'}</span>
        )}
        {loading && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center rounded-full">
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </button>
      {editable && (
        <>
          <input ref={inputRef} type="file" accept="image/*" onChange={handleChange} className="hidden" />
          <div className="absolute -bottom-0.5 -right-0.5 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs shadow-lg border-2 border-white">
            📷
          </div>
        </>
      )}
    </div>
  );
});

// Main Partner Dashboard
export default function PartnerDashboard() {
  const { user, logout, loading: authLoading, refreshUser } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const initialLoad = useRef(true);

  const [loading, setLoading] = useState(true);
  const [contacts, setContacts] = useState([]);
  const [stats, setStats] = useState({});
  const [settings, setSettings] = useState({});
  const [selectedContact, setSelectedContact] = useState(null);
  const [showProfile, setShowProfile] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [uploadingPicture, setUploadingPicture] = useState(false);
  const [lang, setLang] = useState(() => typeof window !== 'undefined' ? localStorage.getItem('app_language') || 'es' : 'es');

  useEffect(() => { localStorage.setItem('app_language', lang); }, [lang]);
  
  const debouncedSearch = useDebounce(searchInput, 300);
  const t = T[lang];

  // Auth check
  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
    else if (!authLoading && user?.role === ROLES.ADMIN) router.push('/neo01x');
  }, [user, authLoading, router]);

  // Fetch contacts and settings
  const fetchContacts = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      const params = { limit: 500 };
      if (statusFilter) params.status = statusFilter;
      if (debouncedSearch) params.search = debouncedSearch;

      const response = await contactsApi.getAll(params);
      setContacts(response?.data || response || []);
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

  const fetchSettings = useCallback(async () => {
    try {
      const data = await settingsApi.getAll();
      setSettings({
        whatsapp_template: data.whatsapp_template?.value || '',
        email_subject_template: data.email_subject_template?.value || '',
        email_body_template: data.email_body_template?.value || '',
        company_name: data.company_name?.value || '',
      });
    } catch (error) {
      // Use empty defaults
    }
  }, []);

  useEffect(() => {
    if (user && user.role !== ROLES.ADMIN) {
      if (initialLoad.current) {
        fetchContacts();
        fetchStats();
        fetchSettings();
        initialLoad.current = false;
      } else {
        fetchContacts();
      }
    }
  }, [user, statusFilter, debouncedSearch, fetchContacts, fetchStats, fetchSettings]);

  // Message template processor
  const processTemplate = useCallback((template, contact) => {
    if (!template) return '';
    return template
      .replace(/{contact_name}/g, contact.name || '')
      .replace(/{partner_name}/g, user?.name || '')
      .replace(/{area}/g, contact.areaName || contact.area_name || '')
      .replace(/{company}/g, settings.company_name || '')
      .replace(/{phone}/g, contact.phone || '');
  }, [user, settings]);

  // Generate WhatsApp URL with default message
  const getWhatsAppUrl = useCallback((contact) => {
    const phone = contact.phone?.replace(/[\s\-\(\)\+]/g, '');
    if (!phone) return '#';
    
    // Only use default message if enabled for this user
    if (user?.useDefaultMessages !== false && settings.whatsapp_template) {
      const message = processTemplate(settings.whatsapp_template, contact);
      return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    }
    return `https://wa.me/${phone}`;
  }, [user, settings, processTemplate]);

  // Generate Email URL with default message
  const getEmailUrl = useCallback((contact) => {
    if (!contact.email) return '#';
    
    // Only use default message if enabled for this user
    if (user?.useDefaultMessages !== false && settings.email_subject_template) {
      const subject = processTemplate(settings.email_subject_template, contact);
      const body = processTemplate(settings.email_body_template, contact);
      return `mailto:${contact.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    }
    return `mailto:${contact.email}`;
  }, [user, settings, processTemplate]);

  // Quick status update
  const handleQuickStatus = async (contact, status) => {
    try {
      await contactsApi.update(contact.id, { status });
      setContacts(prev => prev.map(c => c.id === contact.id ? { ...c, status } : c));
      toast.success('✓');
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
      toast.success('✓');
      setSelectedContact(null);
      fetchContacts();
      fetchStats();
    } catch {
      toast.error('Error');
    } finally {
      setActionLoading(false);
    }
  };

  // Profile picture upload
  const handleUploadPicture = async (file) => {
    setUploadingPicture(true);
    try {
      await uploadApi.profilePicture(file);
      toast.success('Photo updated');
      if (refreshUser) await refreshUser();
    } catch (error) {
      toast.error(error.message || 'Upload failed');
    } finally {
      setUploadingPicture(false);
    }
  };

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-10 h-10 border-3 border-gray-300 border-t-indigo-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  const displayStats = {
    total: stats.total || contacts.length,
    pending: stats.pending || 0,
    accepted: stats.accepted || 0,
    rejected: stats.rejected || 0,
    followup: stats.followup || 0,
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/40">
      {/* Header */}
      <header className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-500 px-4 py-4 sticky top-0 z-50 shadow-lg safe-area-inset-top">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <button onClick={() => setShowProfile(true)} className="flex items-center gap-3">
            <ProfilePicture src={user.profilePicture} name={user.name} size="sm" />
            <div className="text-left">
              <span className="font-semibold text-white block">{user.name.split(' ')[0]}</span>
              <span className="text-xs text-white/70">{displayStats.total} {t.contacts}</span>
            </div>
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setLang(l => l === 'en' ? 'es' : 'en')}
              className="px-3 py-1.5 rounded-lg bg-white/20 backdrop-blur text-white text-sm font-medium hover:bg-white/30 transition-colors"
            >
              {lang === 'en' ? '🇪🇸' : '🇺🇸'}
            </button>
            <button onClick={logout} className="px-3 py-1.5 rounded-lg bg-white/20 backdrop-blur text-white text-sm font-medium hover:bg-white/30 transition-colors">
              {t.logout}
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto p-4 pb-24">
        {/* Stats Cards - Horizontal Scroll on Mobile */}
        <div className="flex gap-3 mb-5 overflow-x-auto pb-2 -mx-4 px-4 snap-x snap-mandatory scrollbar-hide">
          <button
            onClick={() => setStatusFilter('')}
            className={`flex-shrink-0 snap-start p-4 rounded-2xl min-w-[100px] transition-all ${
              !statusFilter
                ? 'bg-gradient-to-br from-gray-800 to-gray-900 text-white shadow-lg scale-105'
                : 'bg-white border border-gray-200'
            }`}
          >
            <div className={`text-2xl font-bold ${!statusFilter ? 'text-white' : 'text-gray-900'}`}>
              {displayStats.total}
            </div>
            <div className={`text-xs font-medium ${!statusFilter ? 'text-white/80' : 'text-gray-500'}`}>
              {t.allContacts}
            </div>
          </button>
          {Object.entries(STATUS).map(([key, config]) => (
            <button
              key={key}
              onClick={() => setStatusFilter(f => f === key ? '' : key)}
              className={`flex-shrink-0 snap-start p-4 rounded-2xl min-w-[100px] transition-all ${
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
        <div className="mb-4 relative">
          <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t.search}
            className="w-full pl-12 pr-4 py-3 bg-white border border-gray-200 rounded-2xl text-base focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent shadow-sm"
          />
        </div>

        {/* Contacts List */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-10 h-10 border-3 border-gray-300 border-t-indigo-600 rounded-full animate-spin"></div>
          </div>
        ) : contacts.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-3xl border border-gray-100">
            <div className="text-6xl mb-4">📭</div>
            <p className="font-medium text-gray-900">{t.noContacts}</p>
            <p className="text-sm text-gray-500 mt-1">{searchInput || statusFilter ? t.tryFilters : t.noAssigned}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {contacts.map((contact) => (
              <ContactCard
                key={contact.id}
                contact={contact}
                t={t}
                onEdit={() => setSelectedContact(contact)}
                onQuickStatus={handleQuickStatus}
                getWhatsAppUrl={getWhatsAppUrl}
                getEmailUrl={getEmailUrl}
              />
            ))}
          </div>
        )}

        {!loading && contacts.length > 0 && (
          <div className="mt-4 text-center text-sm text-gray-400">
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
          getWhatsAppUrl={getWhatsAppUrl}
          getEmailUrl={getEmailUrl}
        />
      )}

      {/* Profile Modal */}
      {showProfile && (
        <ProfileModal
          user={user}
          t={t}
          onClose={() => setShowProfile(false)}
          onUploadPicture={handleUploadPicture}
          uploadingPicture={uploadingPicture}
          toast={toast}
          refreshUser={refreshUser}
        />
      )}
    </div>
  );
}

// Contact Card Component
const ContactCard = memo(function ContactCard({ contact, t, onEdit, onQuickStatus, getWhatsAppUrl, getEmailUrl }) {
  const config = STATUS[contact.status] || STATUS.pending;

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 active:scale-[0.99] transition-transform">
      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        <div className={`w-12 h-12 rounded-full ${config.color} flex items-center justify-center text-white font-bold text-lg flex-shrink-0`}>
          {contact.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold text-gray-900 truncate">{contact.name}</h3>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${config.light} border flex-shrink-0`}>
              {config.icon} {t[config.key]}
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-0.5">{contact.phone}</p>
          {contact.address && <p className="text-xs text-gray-400 truncate mt-0.5">📍 {contact.address}</p>}
        </div>
      </div>

      {/* Quick Actions - Always Visible */}
      <div className="grid grid-cols-4 gap-2 mb-3">
        <a
          href={`tel:${contact.phone}`}
          className="flex flex-col items-center gap-1 py-2.5 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-colors"
        >
          <span className="text-lg">📞</span>
          <span className="text-xs font-medium">{t.call}</span>
        </a>
        <a
          href={getWhatsAppUrl(contact)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-col items-center gap-1 py-2.5 bg-green-50 text-green-600 rounded-xl hover:bg-green-100 transition-colors"
        >
          <span className="text-lg">💬</span>
          <span className="text-xs font-medium">WhatsApp</span>
        </a>
        {contact.email ? (
          <a
            href={getEmailUrl(contact)}
            className="flex flex-col items-center gap-1 py-2.5 bg-purple-50 text-purple-600 rounded-xl hover:bg-purple-100 transition-colors"
          >
            <span className="text-lg">✉️</span>
            <span className="text-xs font-medium">{t.email}</span>
          </a>
        ) : (
          <div className="flex flex-col items-center gap-1 py-2.5 bg-gray-50 text-gray-300 rounded-xl">
            <span className="text-lg">✉️</span>
            <span className="text-xs font-medium">{t.email}</span>
          </div>
        )}
        {contact.address ? (
          <a
            href={`https://maps.google.com/?q=${encodeURIComponent(contact.address)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col items-center gap-1 py-2.5 bg-orange-50 text-orange-600 rounded-xl hover:bg-orange-100 transition-colors"
          >
            <span className="text-lg">🗺️</span>
            <span className="text-xs font-medium">Map</span>
          </a>
        ) : (
          <div className="flex flex-col items-center gap-1 py-2.5 bg-gray-50 text-gray-300 rounded-xl">
            <span className="text-lg">🗺️</span>
            <span className="text-xs font-medium">Map</span>
          </div>
        )}
      </div>

      {/* Status Buttons */}
      <div className="flex items-center gap-2">
        <div className="flex gap-1 flex-1">
          {Object.entries(STATUS).map(([status, cfg]) => (
            <button
              key={status}
              onClick={() => onQuickStatus(contact, status)}
              className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
                contact.status === status
                  ? `${cfg.color} text-white shadow-sm`
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {cfg.icon}
            </button>
          ))}
        </div>
        <button
          onClick={onEdit}
          className="px-4 py-2 bg-gray-900 text-white text-xs font-medium rounded-lg hover:bg-gray-800 transition-colors"
        >
          {t.edit}
        </button>
      </div>
    </div>
  );
});

// Edit Modal
function EditModal({ contact, t, loading, onClose, onSubmit, getWhatsAppUrl, getEmailUrl }) {
  const config = STATUS[contact.status] || STATUS.pending;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose}></div>
      
      <div className="relative bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto safe-area-inset-bottom">
        {/* Drag Handle (mobile) */}
        <div className="sm:hidden flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-300 rounded-full"></div>
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <h2 className="font-semibold text-gray-900">{t.edit}</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400">
            ✕
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-5 space-y-4">
          {/* Contact Info */}
          <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-gray-50 to-gray-100 rounded-2xl">
            <div className={`w-14 h-14 rounded-full ${config.color} flex items-center justify-center text-white font-bold text-xl`}>
              {contact.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-gray-900 truncate">{contact.name}</p>
              <p className="text-sm text-gray-500">{contact.phone}</p>
              {contact.email && <p className="text-xs text-gray-400 truncate">{contact.email}</p>}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-3 gap-2">
            <a href={`tel:${contact.phone}`} className="py-3 bg-blue-500 text-white rounded-xl text-center text-sm font-medium flex items-center justify-center gap-1">
              📞 {t.call}
            </a>
            <a href={getWhatsAppUrl(contact)} target="_blank" rel="noopener noreferrer" className="py-3 bg-green-500 text-white rounded-xl text-center text-sm font-medium flex items-center justify-center gap-1">
              💬 WhatsApp
            </a>
            {contact.email ? (
              <a href={getEmailUrl(contact)} className="py-3 bg-purple-500 text-white rounded-xl text-center text-sm font-medium flex items-center justify-center gap-1">
                ✉️ {t.email}
              </a>
            ) : (
              <div className="py-3 bg-gray-200 text-gray-400 rounded-xl text-center text-sm font-medium">
                ✉️ {t.email}
              </div>
            )}
          </div>

          {/* Status Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
            <div className="grid grid-cols-4 gap-2">
              {Object.entries(STATUS).map(([status, cfg]) => (
                <label
                  key={status}
                  className={`flex flex-col items-center py-3 rounded-xl cursor-pointer transition-all border-2 ${
                    contact.status === status
                      ? `${cfg.color} text-white border-transparent shadow-lg`
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
                  <span className="text-lg mb-1">{cfg.icon}</span>
                  <span className="text-xs font-medium">{t[status]}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
            <textarea
              name="notes"
              defaultValue={contact.notes}
              placeholder={t.notes}
              rows={3}
              className="w-full px-4 py-3 bg-gray-50 rounded-xl border border-gray-200 resize-none text-base focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-gray-900 text-white font-semibold rounded-xl disabled:opacity-50 flex items-center justify-center gap-2 text-base"
          >
            {loading ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                {t.saving}
              </>
            ) : (
              <>✓ {t.save}</>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

// Profile Modal
function ProfileModal({ user, t, onClose, onUploadPicture, uploadingPicture, toast, refreshUser }) {
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [changing, setChanging] = useState(false);

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setChanging(true);
    const formData = new FormData(e.target);
    const currentPassword = formData.get('currentPassword');
    const newPassword = formData.get('newPassword');

    try {
      await authApi.changePassword({ currentPassword, newPassword });
      toast.success('Password changed');
      e.target.reset();
      setShowPasswordForm(false);
    } catch (error) {
      toast.error(error.message || 'Failed');
    } finally {
      setChanging(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose}></div>
      
      <div className="relative bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md shadow-2xl safe-area-inset-bottom">
        {/* Drag Handle */}
        <div className="sm:hidden flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-300 rounded-full"></div>
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">{t.myProfile}</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400">
            ✕
          </button>
        </div>

        <div className="p-5 space-y-6">
          {/* Profile Picture */}
          <div className="flex flex-col items-center">
            <ProfilePicture
              src={user.profilePicture}
              name={user.name}
              size="xl"
              editable
              loading={uploadingPicture}
              onUpload={onUploadPicture}
            />
            <p className="text-xs text-gray-500 mt-3">{t.changePhoto}</p>
          </div>

          {/* User Info */}
          <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">Name</span>
              <span className="text-sm font-medium text-gray-900">{user.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">Username</span>
              <span className="text-sm font-medium text-gray-900">@{user.username}</span>
            </div>
            {user.email && (
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Email</span>
                <span className="text-sm font-medium text-gray-900 truncate ml-2">{user.email}</span>
              </div>
            )}
            {user.phone && (
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Phone</span>
                <span className="text-sm font-medium text-gray-900">{user.phone}</span>
              </div>
            )}
          </div>

          {/* Areas */}
          {user.areas?.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Assigned Areas</label>
              <div className="flex flex-wrap gap-2">
                {user.areas.map((area, i) => (
                  <span key={i} className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm">
                    {area.name || area}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Change Password */}
          <div>
            <button
              onClick={() => setShowPasswordForm(!showPasswordForm)}
              className="w-full py-3 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              🔒 {t.changePassword}
            </button>

            {showPasswordForm && (
              <form onSubmit={handlePasswordChange} className="mt-4 space-y-3">
                <input
                  type="password"
                  name="currentPassword"
                  placeholder={t.currentPassword}
                  required
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl"
                />
                <input
                  type="password"
                  name="newPassword"
                  placeholder={t.newPassword}
                  required
                  minLength={6}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl"
                />
                <button
                  type="submit"
                  disabled={changing}
                  className="w-full py-3 bg-gray-900 text-white rounded-xl font-medium disabled:opacity-50"
                >
                  {changing ? 'Changing...' : 'Update Password'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
