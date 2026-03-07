'use client';

import { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/Toast';
import Modal, { ConfirmDialog } from '@/components/Modal';
import { contactsApi, usersApi, areasApi, authApi, settingsApi, uploadApi } from '@/lib/api-client';
import { ROLES } from '@/lib/constants';

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

const TABS = [
  { id: 'contacts', label: 'Contacts', icon: '👥' },
  { id: 'partners', label: 'Partners', icon: '🤝' },
  { id: 'areas', label: 'Areas', icon: '📍' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
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

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  return isMobile;
}

// ===== Profile Picture Component =====
const ProfilePicture = memo(function ProfilePicture({ 
  src, 
  name, 
  size = 'md', 
  editable = false, 
  onUpload,
  loading = false 
}) {
  const inputRef = useRef(null);
  const sizes = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-12 h-12 text-sm',
    lg: 'w-20 h-20 text-xl',
    xl: 'w-24 h-24 text-2xl',
  };

  const handleClick = () => {
    if (editable && inputRef.current) {
      inputRef.current.click();
    }
  };

  const handleChange = (e) => {
    const file = e.target.files?.[0];
    if (file && onUpload) {
      onUpload(file);
    }
  };

  return (
    <div className="relative inline-block">
      <button
        onClick={handleClick}
        disabled={!editable || loading}
        className={`${sizes[size]} rounded-full overflow-hidden flex items-center justify-center font-semibold transition-all ${
          editable ? 'cursor-pointer hover:ring-2 hover:ring-blue-400 hover:ring-offset-2' : 'cursor-default'
        } ${loading ? 'opacity-50' : ''}`}
        style={{ 
          background: src ? 'transparent' : `linear-gradient(135deg, #6366f1, #8b5cf6)`,
        }}
      >
        {src ? (
          <img src={src} alt={name} className="w-full h-full object-cover" />
        ) : (
          <span className="text-white">{name?.charAt(0)?.toUpperCase() || '?'}</span>
        )}
        {loading && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center rounded-full">
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </button>
      {editable && (
        <>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            onChange={handleChange}
            className="hidden"
          />
          <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs shadow-lg">
            📷
          </div>
        </>
      )}
    </div>
  );
});

// ===== Mobile Contact Card =====
const MobileContactCard = memo(function MobileContactCard({
  contact,
  isSelected,
  onToggleSelect,
  onStatusChange,
  onEdit,
  onDelete,
  partners,
}) {
  const [showActions, setShowActions] = useState(false);
  const currentStatus = STATUS_OPTIONS.find(s => s.value === contact.status) || STATUS_OPTIONS[0];

  return (
    <div className={`bg-white rounded-xl p-4 shadow-sm border ${isSelected ? 'border-blue-400 bg-blue-50' : 'border-gray-100'}`}>
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleSelect(contact.id)}
          className="mt-1 w-5 h-5 rounded"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold text-gray-900 truncate">{contact.name}</h3>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${currentStatus.color}`}>
              {currentStatus.label}
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">{contact.phone}</p>
          {contact.address && <p className="text-xs text-gray-400 truncate mt-0.5">{contact.address}</p>}
          
          {/* Quick Actions */}
          <div className="flex items-center gap-2 mt-3">
            <a href={`tel:${contact.phone}`} className="flex-1 py-2 bg-blue-50 text-blue-600 rounded-lg text-center text-sm font-medium">
              📞 Call
            </a>
            <a 
              href={`https://wa.me/${contact.phone?.replace(/[\s\-\(\)\+]/g, '')}`}
              target="_blank"
              className="flex-1 py-2 bg-green-50 text-green-600 rounded-lg text-center text-sm font-medium"
            >
              💬 WhatsApp
            </a>
            <button 
              onClick={() => setShowActions(!showActions)}
              className="px-3 py-2 bg-gray-100 rounded-lg text-sm"
            >
              •••
            </button>
          </div>

          {/* Expanded Actions */}
          {showActions && (
            <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
              <div className="flex flex-wrap gap-1">
                {STATUS_OPTIONS.map(s => (
                  <button
                    key={s.value}
                    onClick={() => onStatusChange(contact.id, s.value)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                      contact.status === s.value ? s.color + ' border' : 'bg-gray-100'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={() => onEdit(contact)} className="flex-1 py-2 bg-blue-100 text-blue-700 rounded-lg text-sm font-medium">
                  Edit
                </button>
                <button onClick={() => onDelete(contact)} className="px-4 py-2 bg-red-100 text-red-700 rounded-lg text-sm font-medium">
                  Delete
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

// ===== Desktop Contact Row =====
const DesktopContactRow = memo(function DesktopContactRow({
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

  const currentStatus = STATUS_OPTIONS.find(s => s.value === contact.status) || STATUS_OPTIONS[0];

  return (
    <div
      className={`grid grid-cols-[40px_2fr_1.2fr_1fr_140px_100px] gap-2 px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors items-center ${
        isSelected ? 'bg-blue-50' : ''
      } ${isUpdating ? 'opacity-50' : ''}`}
      style={{ height: VIRTUAL_ROW_HEIGHT }}
    >
      <div className="flex items-center justify-center">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleSelect(contact.id)}
          className="w-4 h-4 rounded border-gray-300 text-blue-600"
        />
      </div>

      <div className="truncate">
        <div className="font-medium text-gray-900 truncate">{contact.name}</div>
        {contact.email && <div className="text-xs text-gray-500 truncate">{contact.email}</div>}
      </div>

      <div className="text-sm text-gray-600 truncate">
        <a href={`tel:${contact.phone}`} className="hover:text-blue-600">{contact.phone}</a>
      </div>

      <div className="text-sm truncate">
        {contact.areaName || contact.area_name || <span className="text-gray-400">—</span>}
      </div>

      <div className="relative">
        <button
          onClick={() => setShowStatusDropdown(!showStatusDropdown)}
          className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium border ${currentStatus.color}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${currentStatus.dot}`} />
          {currentStatus.label}
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {showStatusDropdown && (
          <div className="absolute z-20 mt-1 bg-white rounded-lg shadow-lg border min-w-[140px]">
            {STATUS_OPTIONS.map(s => (
              <button
                key={s.value}
                onClick={() => handleStatusChange(s.value)}
                className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2 ${
                  contact.status === s.value ? 'bg-gray-50' : ''
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${s.dot}`} />
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-1">
        <button onClick={() => onEdit(contact)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded" title="Edit">
          ✏️
        </button>
        <a href={`tel:${contact.phone}`} className="p-1.5 text-gray-400 hover:text-green-600 rounded" title="Call">
          📞
        </a>
        <button onClick={() => onDelete(contact)} className="p-1.5 text-gray-400 hover:text-red-600 rounded" title="Delete">
          🗑️
        </button>
      </div>
    </div>
  );
});

// ===== Stats Cards =====
const AnalyticsSection = memo(function AnalyticsSection({ stats, contacts }) {
  const chartData = useMemo(() => {
    const byStatus = {};
    contacts.forEach(c => { byStatus[c.status] = (byStatus[c.status] || 0) + 1; });
    return { byStatus };
  }, [contacts]);

  const conversionRate = useMemo(() => {
    if (contacts.length === 0) return 0;
    const converted = contacts.filter(c => c.status === 'converted' || c.status === 'accepted').length;
    return Math.round((converted / contacts.length) * 100);
  }, [contacts]);

  return (
    <div className="grid grid-cols-3 md:grid-cols-6 gap-2 md:gap-4 mb-4 md:mb-6">
      <StatCard title="Total" value={stats.total || contacts.length} icon="👥" color="bg-gradient-to-br from-blue-500 to-blue-600" />
      <StatCard title="Pending" value={chartData.byStatus.pending || 0} icon="⏳" color="bg-gradient-to-br from-amber-500 to-amber-600" />
      <StatCard title="Accepted" value={chartData.byStatus.accepted || 0} icon="✅" color="bg-gradient-to-br from-emerald-500 to-emerald-600" />
      <StatCard title="Rejected" value={chartData.byStatus.rejected || 0} icon="❌" color="bg-gradient-to-br from-rose-500 to-rose-600" />
      <StatCard title="Follow Up" value={chartData.byStatus.followup || 0} icon="📞" color="bg-gradient-to-br from-sky-500 to-sky-600" />
      <StatCard title="Rate" value={`${conversionRate}%`} icon="📈" color="bg-gradient-to-br from-purple-500 to-purple-600" />
    </div>
  );
});

function StatCard({ title, value, icon, color }) {
  return (
    <div className={`${color} rounded-xl p-2 md:p-4 text-white shadow-lg`}>
      <div className="flex items-center gap-1 md:gap-2 mb-1">
        <span className="text-lg md:text-2xl">{icon}</span>
      </div>
      <div className="text-lg md:text-2xl font-bold">{value}</div>
      <div className="text-xs md:text-sm text-white/80 truncate">{title}</div>
    </div>
  );
}

// ===== Settings Tab Component =====
function SettingsTab({ toast }) {
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const data = await settingsApi.getAll();
      setSettings({
        whatsapp_template: data.whatsapp_template?.value || '',
        email_subject_template: data.email_subject_template?.value || '',
        email_body_template: data.email_body_template?.value || '',
        company_name: data.company_name?.value || '',
      });
    } catch (error) {
      toast.error('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await settingsApi.update(settings);
      toast.success('Settings saved');
    } catch (error) {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center p-8"><div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full" /></div>;
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="bg-white rounded-xl p-4 md:p-6 border border-gray-200">
        <h3 className="text-lg font-semibold mb-4">📝 Default Message Templates</h3>
        <p className="text-sm text-gray-500 mb-4">
          Available placeholders: <code className="bg-gray-100 px-1 rounded">{'{contact_name}'}</code>, 
          <code className="bg-gray-100 px-1 rounded ml-1">{'{partner_name}'}</code>, 
          <code className="bg-gray-100 px-1 rounded ml-1">{'{area}'}</code>, 
          <code className="bg-gray-100 px-1 rounded ml-1">{'{company}'}</code>
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Company Name</label>
            <input
              value={settings.company_name}
              onChange={e => setSettings(s => ({ ...s, company_name: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="Your Company Name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">WhatsApp Message Template</label>
            <textarea
              value={settings.whatsapp_template}
              onChange={e => setSettings(s => ({ ...s, whatsapp_template: e.target.value }))}
              rows={4}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="Hello {contact_name}, this is {partner_name}..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Email Subject Template</label>
            <input
              value={settings.email_subject_template}
              onChange={e => setSettings(s => ({ ...s, email_subject_template: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="Follow-up from {partner_name}"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Email Body Template</label>
            <textarea
              value={settings.email_body_template}
              onChange={e => setSettings(s => ({ ...s, email_body_template: e.target.value }))}
              rows={6}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="Dear {contact_name},\n\nHope you're doing well..."
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl p-4 md:p-6 border border-gray-200">
        <h3 className="text-lg font-semibold mb-2">ℹ️ How it works</h3>
        <ul className="text-sm text-gray-600 space-y-2">
          <li>• Partners can click WhatsApp/Email icons to send messages with these templates pre-filled</li>
          <li>• You can enable/disable default messages per partner in the Partners tab</li>
          <li>• Placeholders are replaced automatically with contact and partner info</li>
        </ul>
      </div>
    </div>
  );
}

// ===== Partners Tab with Profile Picture =====
function PartnersTab({ partners, areas, onRefresh, toast }) {
  const [showModal, setShowModal] = useState(null);
  const [editPartner, setEditPartner] = useState(null);
  const [uploadingFor, setUploadingFor] = useState(null);

  const partnerList = partners.filter(p => p.role === 'partner' || p.role === 'worker');

  const handleUploadPicture = async (file, partnerId) => {
    setUploadingFor(partnerId);
    try {
      await uploadApi.profilePicture(file, partnerId);
      toast.success('Profile picture updated');
      onRefresh();
    } catch (error) {
      toast.error(error.message || 'Upload failed');
    } finally {
      setUploadingFor(null);
    }
  };

  const handleToggleDefaultMessages = async (partner) => {
    try {
      await usersApi.update(partner.id, { useDefaultMessages: !partner.useDefaultMessages });
      toast.success('Setting updated');
      onRefresh();
    } catch (error) {
      toast.error('Failed to update');
    }
  };

  const handleDelete = async (partner) => {
    if (!confirm(`Delete ${partner.name}?`)) return;
    try {
      await usersApi.delete(partner.id);
      toast.success('Partner deleted');
      onRefresh();
    } catch (error) {
      toast.error('Failed to delete');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">{partnerList.length} Partners</h2>
        <button onClick={() => setShowModal('add')} className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium text-sm">
          + Add Partner
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {partnerList.map(partner => (
          <div key={partner.id} className="bg-white rounded-xl p-4 border border-gray-200 hover:shadow-md transition-shadow">
            <div className="flex items-start gap-3">
              <ProfilePicture
                src={partner.profilePicture}
                name={partner.name}
                size="lg"
                editable
                loading={uploadingFor === partner.id}
                onUpload={(file) => handleUploadPicture(file, partner.id)}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900 truncate">{partner.name}</h3>
                  <div className="flex gap-1">
                    <button onClick={() => { setEditPartner(partner); setShowModal('edit'); }} className="p-1 text-gray-400 hover:text-blue-600">
                      ✏️
                    </button>
                    <button onClick={() => handleDelete(partner)} className="p-1 text-gray-400 hover:text-red-600">
                      🗑️
                    </button>
                  </div>
                </div>
                <p className="text-sm text-gray-500">@{partner.username}</p>
                {partner.email && <p className="text-xs text-gray-400 truncate">{partner.email}</p>}
                {partner.phone && <p className="text-xs text-gray-400">{partner.phone}</p>}
              </div>
            </div>

            {/* Areas */}
            <div className="mt-3 flex flex-wrap gap-1">
              {partner.areas?.length > 0 ? (
                partner.areas.slice(0, 3).map((area, i) => (
                  <span key={i} className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs">
                    {area.name || area}
                  </span>
                ))
              ) : (
                <span className="text-gray-400 text-xs">No areas assigned</span>
              )}
              {partner.areas?.length > 3 && (
                <span className="text-xs text-gray-400">+{partner.areas.length - 3} more</span>
              )}
            </div>

            {/* Default Messages Toggle */}
            <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
              <span className="text-xs text-gray-500">Default Messages</span>
              <button
                onClick={() => handleToggleDefaultMessages(partner)}
                className={`relative w-10 h-6 rounded-full transition-colors ${
                  partner.useDefaultMessages !== false ? 'bg-green-500' : 'bg-gray-300'
                }`}
              >
                <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                  partner.useDefaultMessages !== false ? 'left-5' : 'left-1'
                }`} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Partner Form Modal */}
      {showModal && (
        <PartnerFormModal
          isOpen={true}
          onClose={() => { setShowModal(null); setEditPartner(null); }}
          partner={editPartner}
          areas={areas}
          onSuccess={() => { setShowModal(null); setEditPartner(null); onRefresh(); }}
          toast={toast}
        />
      )}
    </div>
  );
}

// ===== Areas Tab =====
function AreasTab({ areas, contacts, onRefresh, toast }) {
  const [showModal, setShowModal] = useState(false);

  const areaStats = useMemo(() => {
    const stats = {};
    areas.forEach(a => { stats[a.id] = 0; });
    contacts.forEach(c => {
      const areaId = c.areaId || c.area_id;
      if (areaId && stats[areaId] !== undefined) stats[areaId]++;
    });
    return stats;
  }, [areas, contacts]);

  const handleDelete = async (area) => {
    if (!confirm(`Delete ${area.name}?`)) return;
    try {
      await areasApi.delete(area.id);
      toast.success('Area deleted');
      onRefresh();
    } catch (error) {
      toast.error('Failed to delete');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">{areas.length} Areas</h2>
        <button onClick={() => setShowModal(true)} className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium text-sm">
          + Add Area
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {areas.map(area => (
          <div key={area.id} className="bg-white rounded-xl p-4 border border-gray-200">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded-full" style={{ backgroundColor: area.color || '#3B82F6' }} />
                <h3 className="font-semibold text-gray-900">{area.name}</h3>
              </div>
              <button onClick={() => handleDelete(area)} className="p-1 text-gray-400 hover:text-red-600">🗑️</button>
            </div>
            {area.description && <p className="text-sm text-gray-500 mt-2">{area.description}</p>}
            <div className="mt-3 text-sm text-gray-600">
              <strong>{areaStats[area.id] || 0}</strong> contacts
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <AreaFormModal
          isOpen={true}
          onClose={() => setShowModal(false)}
          onSuccess={() => { setShowModal(false); onRefresh(); }}
          toast={toast}
        />
      )}
    </div>
  );
}

// ===== Main Admin Dashboard =====
export default function AdminDashboard() {
  const { user, logout, loading: authLoading } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const isMobile = useIsMobile();

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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Filters
  const [filters, setFilters] = useState({ search: '', status: '', areaId: '', assignedTo: '', unassigned: false });
  const debouncedSearch = useDebounce(filters.search);

  // Auth check
  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
    else if (!authLoading && user?.role !== ROLES.ADMIN) router.push('/partner');
  }, [user, authLoading, router]);

  // Fetch ALL data
  const fetchAllData = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      const [contactsRes, workersRes, areasRes, statsRes] = await Promise.all([
        contactsApi.getAll({ limit: 10000 }),
        usersApi.getAll().catch(() => []),
        areasApi.getAll().catch(() => []),
        contactsApi.getStats().catch(() => ({})),
      ]);
      setAllContacts(Array.isArray(contactsRes?.data || contactsRes) ? (contactsRes?.data || contactsRes) : []);
      setPartners(Array.isArray(workersRes) ? workersRes : workersRes?.data || []);
      setAreas(Array.isArray(areasRes) ? areasRes : areasRes?.data || []);
      setStats(statsRes?.data || statsRes || {});
    } catch (error) {
      toast.error('Failed to fetch data');
    } finally {
      setLoading(false);
    }
  }, [user, toast]);

  useEffect(() => {
    if (user?.role === ROLES.ADMIN) fetchAllData();
  }, [fetchAllData, user]);

  // Filtered contacts
  const filteredContacts = useMemo(() => {
    let result = [...allContacts];
    if (debouncedSearch) {
      const search = debouncedSearch.toLowerCase();
      result = result.filter(c =>
        c.name?.toLowerCase().includes(search) || c.phone?.includes(search) || c.email?.toLowerCase().includes(search)
      );
    }
    if (filters.status) result = result.filter(c => c.status === filters.status);
    if (filters.areaId) result = result.filter(c => (c.areaId || c.area_id) === filters.areaId);
    if (filters.assignedTo) result = result.filter(c => (c.assignedTo || c.assigned_to) === filters.assignedTo);
    if (filters.unassigned) result = result.filter(c => !c.assignedTo && !c.assigned_to);
    return result;
  }, [allContacts, debouncedSearch, filters]);

  // Handlers
  const handleInlineStatusChange = async (contactId, newStatus) => {
    try {
      await contactsApi.update(contactId, { status: newStatus });
      setAllContacts(prev => prev.map(c => c.id === contactId ? { ...c, status: newStatus } : c));
      toast.success('Updated');
    } catch { toast.error('Failed'); }
  };

  const handleDeleteContact = async (contact) => {
    if (!confirm(`Delete "${contact.name}"?`)) return;
    try {
      await contactsApi.delete(contact.id);
      setAllContacts(prev => prev.filter(c => c.id !== contact.id));
      toast.success('Deleted');
    } catch { toast.error('Failed'); }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Delete ${selectedIds.length} contacts?`)) return;
    try {
      await contactsApi.bulkDelete(selectedIds);
      setAllContacts(prev => prev.filter(c => !selectedIds.includes(c.id)));
      setSelectedIds([]);
      toast.success(`Deleted ${selectedIds.length} contacts`);
    } catch { toast.error('Failed'); }
  };

  const handleExport = async () => {
    try {
      const response = await contactsApi.export({ format: 'csv', limit: 10000 });
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
        toast.success('Exported');
      }
    } catch { toast.error('Export failed'); }
  };

  const handleRemoveDuplicates = async () => {
    try {
      // First preview
      const preview = await contactsApi.previewDuplicates();
      const data = preview.data || preview;
      
      if (data.totalDuplicates === 0) {
        toast.success('No duplicates found!');
        return;
      }
      
      if (!confirm(`Found ${data.totalDuplicates} duplicate contacts in ${data.duplicateGroups} phone number groups.\n\nRemove duplicates? (Keeps oldest entry for each phone number)`)) {
        return;
      }
      
      // Remove duplicates
      const result = await contactsApi.removeDuplicates(false);
      toast.success(result.data?.message || result.message || `Removed ${result.removed} duplicates`);
      fetchAllData();
    } catch (error) {
      toast.error(error.message || 'Failed to remove duplicates');
    }
  };

  const toggleSelection = (id) => setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  const toggleSelectAll = () => setSelectedIds(selectedIds.length === filteredContacts.length ? [] : filteredContacts.map(c => c.id));

  if (authLoading || !user) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" /></div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-[1600px] mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="md:hidden p-2 -ml-2 text-gray-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={mobileMenuOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
                </svg>
              </button>
              <ProfilePicture src={user.profilePicture} name={user.name} size="sm" />
              <div className="hidden sm:block">
                <h1 className="text-sm font-semibold text-gray-900">{user.name}</h1>
                <p className="text-xs text-gray-500">{filteredContacts.length} contacts</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={fetchAllData} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg" title="Refresh">🔄</button>
              <button onClick={handleRemoveDuplicates} className="hidden sm:flex px-3 py-2 text-sm bg-orange-100 hover:bg-orange-200 text-orange-700 rounded-lg font-medium items-center gap-2" title="Remove duplicate phone numbers">
                🧹 Dedupe
              </button>
              <button onClick={handleExport} className="hidden sm:flex px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg font-medium items-center gap-2">
                📥 Export
              </button>
              <button onClick={logout} className="px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg font-medium">
                Logout
              </button>
            </div>
          </div>

          {/* Mobile Menu */}
          {mobileMenuOpen && (
            <div className="md:hidden mt-3 pt-3 border-t border-gray-100">
              <div className="flex flex-wrap gap-2">
                {TABS.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => { setActiveTab(tab.id); setMobileMenuOpen(false); }}
                    className={`px-3 py-2 rounded-lg text-sm font-medium ${
                      activeTab === tab.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {tab.icon} {tab.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-4 py-4 md:py-6">
        {/* Desktop Tabs */}
        <div className="hidden md:flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === tab.id ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* Contacts Tab */}
        {activeTab === 'contacts' && (
          <>
            <AnalyticsSection stats={stats} contacts={allContacts} />

            {/* Filters */}
            <div className="flex flex-col md:flex-row gap-3 mb-4">
              <div className="relative flex-1">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={filters.search}
                  onChange={(e) => setFilters(f => ({ ...f, search: e.target.value }))}
                  placeholder="Search contacts..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0">
                <select
                  value={filters.status}
                  onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
                  className="px-3 py-2 border rounded-lg text-sm whitespace-nowrap"
                >
                  <option value="">All Status</option>
                  {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>

                <select
                  value={filters.areaId}
                  onChange={e => setFilters(f => ({ ...f, areaId: e.target.value }))}
                  className="px-3 py-2 border rounded-lg text-sm whitespace-nowrap"
                >
                  <option value="">All Areas</option>
                  {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>

                <button
                  onClick={() => setShowModal('import')}
                  className="px-4 py-2 bg-gray-600 text-white rounded-lg font-medium text-sm whitespace-nowrap"
                >
                  📥 Import
                </button>
                <button
                  onClick={() => setShowModal('addContact')}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium text-sm whitespace-nowrap"
                >
                  + Add
                </button>
              </div>
            </div>

            {/* Bulk Actions */}
            {selectedIds.length > 0 && (
              <div className="flex items-center gap-2 mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                <span className="text-sm font-medium text-blue-700">{selectedIds.length} selected</span>
                <button onClick={() => setShowModal('bulkAssign')} className="text-sm text-blue-600 hover:underline">Assign</button>
                <button onClick={handleBulkDelete} className="text-sm text-red-600 hover:underline">Delete</button>
                <button onClick={() => setSelectedIds([])} className="text-sm text-gray-500 hover:underline ml-auto">Clear</button>
              </div>
            )}

            {/* Contacts List */}
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
              </div>
            ) : filteredContacts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 bg-white rounded-xl border">
                <div className="text-5xl mb-4">📭</div>
                <h3 className="text-lg font-medium text-gray-900 mb-1">No contacts found</h3>
                <button onClick={() => setShowModal('addContact')} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium">
                  Add Contact
                </button>
              </div>
            ) : isMobile ? (
              <div className="space-y-3">
                {filteredContacts.slice(0, 50).map(contact => (
                  <MobileContactCard
                    key={contact.id}
                    contact={contact}
                    isSelected={selectedIds.includes(contact.id)}
                    onToggleSelect={toggleSelection}
                    onStatusChange={handleInlineStatusChange}
                    onEdit={(c) => { setEditItem(c); setShowModal('editContact'); }}
                    onDelete={handleDeleteContact}
                    partners={partners}
                  />
                ))}
                {filteredContacts.length > 50 && (
                  <p className="text-center text-sm text-gray-500 py-4">Showing 50 of {filteredContacts.length} contacts</p>
                )}
              </div>
            ) : (
              <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                <div className="grid grid-cols-[40px_2fr_1.2fr_1fr_140px_100px] gap-2 px-4 py-3 bg-gray-50 border-b font-medium text-sm text-gray-600">
                  <div className="flex items-center justify-center">
                    <input type="checkbox" checked={selectedIds.length === filteredContacts.length && filteredContacts.length > 0} onChange={toggleSelectAll} className="w-4 h-4 rounded" />
                  </div>
                  <div>Name</div>
                  <div>Phone</div>
                  <div>Area</div>
                  <div>Status</div>
                  <div className="text-center">Actions</div>
                </div>
                <div className="max-h-[calc(100vh-400px)] overflow-y-auto">
                  {filteredContacts.map(contact => (
                    <DesktopContactRow
                      key={contact.id}
                      contact={contact}
                      isSelected={selectedIds.includes(contact.id)}
                      onToggleSelect={toggleSelection}
                      onStatusChange={handleInlineStatusChange}
                      onEdit={(c) => { setEditItem(c); setShowModal('editContact'); }}
                      onDelete={handleDeleteContact}
                      partners={partners}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Partners Tab */}
        {activeTab === 'partners' && (
          <PartnersTab partners={partners} areas={areas} onRefresh={fetchAllData} toast={toast} />
        )}

        {/* Areas Tab */}
        {activeTab === 'areas' && (
          <AreasTab areas={areas} contacts={allContacts} onRefresh={fetchAllData} toast={toast} />
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <SettingsTab toast={toast} />
        )}
      </main>

      {/* Modals */}
      <ContactFormModal
        isOpen={showModal === 'addContact' || showModal === 'editContact'}
        onClose={() => { setShowModal(null); setEditItem(null); }}
        contact={editItem}
        areas={areas}
        partners={partners}
        onSuccess={(contact) => {
          if (editItem) setAllContacts(prev => prev.map(c => c.id === contact.id ? contact : c));
          else setAllContacts(prev => [contact, ...prev]);
          setShowModal(null);
          setEditItem(null);
        }}
        toast={toast}
      />

      <ImportModal
        isOpen={showModal === 'import'}
        onClose={() => setShowModal(null)}
        areas={areas}
        partners={partners}
        onSuccess={fetchAllData}
        toast={toast}
      />

      <BulkAssignModal
        isOpen={showModal === 'bulkAssign'}
        onClose={() => setShowModal(null)}
        partners={partners.filter(p => p.role === 'partner')}
        selectedCount={selectedIds.length}
        onAssign={async (partnerId) => {
          try {
            await contactsApi.bulkAssign(selectedIds, partnerId);
            fetchAllData();
            setSelectedIds([]);
            setShowModal(null);
            toast.success('Assigned');
          } catch { toast.error('Failed'); }
        }}
      />
    </div>
  );
}

// ===== Modal Components =====
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
    if (isEdit) data.status = formData.get('status');

    try {
      const result = isEdit ? await contactsApi.update(contact.id, data) : await contactsApi.create(data);
      toast.success(isEdit ? 'Updated' : 'Created');
      onSuccess(result.data || result);
    } catch (error) {
      toast.error(error.message || 'Failed');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEdit ? 'Edit Contact' : 'Add Contact'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><label className="block text-sm font-medium mb-1">Name *</label><input name="name" defaultValue={contact?.name} required className="w-full px-3 py-2 border rounded-lg" /></div>
          <div><label className="block text-sm font-medium mb-1">Phone *</label><input name="phone" defaultValue={contact?.phone} required className="w-full px-3 py-2 border rounded-lg" /></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><label className="block text-sm font-medium mb-1">Email</label><input name="email" type="email" defaultValue={contact?.email} className="w-full px-3 py-2 border rounded-lg" /></div>
          <div><label className="block text-sm font-medium mb-1">Area</label>
            <select name="areaId" defaultValue={contact?.areaId || contact?.area_id || ''} className="w-full px-3 py-2 border rounded-lg">
              <option value="">Select Area</option>
              {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        </div>
        <div><label className="block text-sm font-medium mb-1">Address</label><input name="address" defaultValue={contact?.address} className="w-full px-3 py-2 border rounded-lg" /></div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><label className="block text-sm font-medium mb-1">Assign To</label>
            <select name="assignedTo" defaultValue={contact?.assignedTo || contact?.assigned_to || ''} className="w-full px-3 py-2 border rounded-lg">
              <option value="">Unassigned</option>
              {partners.filter(p => p.role === 'partner').map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div><label className="block text-sm font-medium mb-1">Priority</label>
            <select name="priority" defaultValue={contact?.priority || 'normal'} className="w-full px-3 py-2 border rounded-lg">
              {PRIORITY_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
        </div>
        {isEdit && (
          <div><label className="block text-sm font-medium mb-1">Status</label>
            <select name="status" defaultValue={contact?.status || 'pending'} className="w-full px-3 py-2 border rounded-lg">
              {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        )}
        <div><label className="block text-sm font-medium mb-1">Notes</label><textarea name="notes" defaultValue={contact?.notes} rows={3} className="w-full px-3 py-2 border rounded-lg" /></div>
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
    const data = { name: formData.get('name'), email: formData.get('email') || null, phone: formData.get('phone') || null, areaIds: selectedAreas };
    if (!isEdit) { data.username = formData.get('username'); data.password = formData.get('password'); data.role = 'partner'; }
    const password = formData.get('password');
    if (password && isEdit) data.password = password;

    try {
      isEdit ? await usersApi.update(partner.id, data) : await usersApi.create(data);
      toast.success(isEdit ? 'Updated' : 'Created');
      onSuccess();
    } catch (error) {
      toast.error(error.message || 'Failed');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEdit ? 'Edit Partner' : 'Add Partner'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {!isEdit && <div><label className="block text-sm font-medium mb-1">Username *</label><input name="username" required className="w-full px-3 py-2 border rounded-lg" /></div>}
        <div><label className="block text-sm font-medium mb-1">Name *</label><input name="name" defaultValue={partner?.name} required className="w-full px-3 py-2 border rounded-lg" /></div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><label className="block text-sm font-medium mb-1">Email</label><input name="email" type="email" defaultValue={partner?.email} className="w-full px-3 py-2 border rounded-lg" /></div>
          <div><label className="block text-sm font-medium mb-1">Phone</label><input name="phone" defaultValue={partner?.phone} className="w-full px-3 py-2 border rounded-lg" /></div>
        </div>
        <div><label className="block text-sm font-medium mb-1">{isEdit ? 'New Password (leave blank to keep)' : 'Password *'}</label><input name="password" type="password" required={!isEdit} className="w-full px-3 py-2 border rounded-lg" /></div>
        <div><label className="block text-sm font-medium mb-1">Assigned Areas</label>
          <div className="max-h-40 overflow-y-auto border rounded-lg p-2">
            {areas.map(area => (
              <label key={area.id} className="flex items-center gap-2 py-1">
                <input type="checkbox" name="areaIds" value={area.id} defaultChecked={partner?.areas?.some(a => (a.id || a) === area.id)} />
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
    try {
      await areasApi.create({ name: formData.get('name'), description: formData.get('description') || '', color: formData.get('color') || '#3B82F6' });
      toast.success('Created');
      onSuccess();
    } catch (error) {
      toast.error(error.message || 'Failed');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Area">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div><label className="block text-sm font-medium mb-1">Name *</label><input name="name" required className="w-full px-3 py-2 border rounded-lg" /></div>
        <div><label className="block text-sm font-medium mb-1">Description</label><input name="description" className="w-full px-3 py-2 border rounded-lg" /></div>
        <div><label className="block text-sm font-medium mb-1">Color</label><input name="color" type="color" defaultValue="#3B82F6" className="w-16 h-10 border rounded-lg cursor-pointer" /></div>
        <div className="flex justify-end gap-2 pt-4">
          <button type="button" onClick={onClose} className="px-4 py-2 border rounded-lg">Cancel</button>
          <button type="submit" disabled={loading} className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50">{loading ? 'Creating...' : 'Create'}</button>
        </div>
      </form>
    </Modal>
  );
}

function BulkAssignModal({ isOpen, onClose, partners, selectedCount, onAssign }) {
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Assign ${selectedCount} Contacts`}>
      <div className="space-y-4">
        <select value={selected} onChange={e => setSelected(e.target.value)} className="w-full px-3 py-2 border rounded-lg">
          <option value="">Select Partner</option>
          {partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 border rounded-lg">Cancel</button>
          <button onClick={async () => { setLoading(true); await onAssign(selected); setLoading(false); }} disabled={!selected || loading} className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50">
            {loading ? 'Assigning...' : 'Assign'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ===== Import Modal =====
function ImportModal({ isOpen, onClose, areas, partners, onSuccess, toast }) {
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [file, setFile] = useState(null);
  const [sheets, setSheets] = useState([]);
  const [selectedSheet, setSelectedSheet] = useState(0);
  const [areaId, setAreaId] = useState('');
  const [assignedTo, setAssignedTo] = useState('');

  const handleFileChange = async (e) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    setFile(selectedFile);
    setLoading(true);

    try {
      const response = await contactsApi.previewImport(selectedFile, selectedSheet);
      const data = response.data || response;
      setPreview(data);
      if (data.sheets) setSheets(data.sheets);
    } catch (err) {
      toast.error(err.message || 'Failed to preview file');
      setFile(null);
      setPreview(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSheetChange = async (index) => {
    setSelectedSheet(index);
    if (!file) return;
    setLoading(true);
    try {
      const response = await contactsApi.previewImport(file, index);
      setPreview(response.data || response);
    } catch (err) {
      toast.error('Failed to load sheet');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      toast.error('Select a file first');
      return;
    }
    setLoading(true);

    try {
      const response = await contactsApi.importFile(file, {
        areaId: areaId || null,
        assignedTo: assignedTo || null,
        sheetIndex: selectedSheet,
      });
      const result = response.data || response;
      // Use API message or construct one
      const msg = result.message || `Imported ${result.imported || 0} contacts${result.duplicates ? `, ${result.duplicates} duplicates skipped` : ''}`;
      toast.success(msg);
      onSuccess();
      handleClose();
    } catch (error) {
      toast.error(error.message || 'Import failed');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFile(null);
    setPreview(null);
    setSheets([]);
    setSelectedSheet(0);
    setAreaId('');
    setAssignedTo('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Import Contacts" size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">Select File *</label>
          <input
            type="file"
            onChange={handleFileChange}
            accept=".csv,.xlsx,.xls,.json,.txt,.tsv"
            className="w-full px-3 py-2 border rounded-lg text-sm file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
          <p className="text-xs text-gray-500 mt-1">Supported: CSV, Excel (.xlsx, .xls), JSON, TXT, TSV</p>
        </div>

        {sheets.length > 1 && (
          <div>
            <label className="block text-sm font-medium mb-1">Select Sheet</label>
            <select
              value={selectedSheet}
              onChange={(e) => handleSheetChange(Number(e.target.value))}
              className="w-full px-3 py-2 border rounded-lg"
            >
              {sheets.map((name, i) => (
                <option key={i} value={i}>{name}</option>
              ))}
            </select>
          </div>
        )}

        {preview && (
          <div className="border rounded-lg p-3 bg-gray-50 overflow-x-auto">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Preview ({preview.totalRows || preview.rows?.length || 0} rows)</span>
              {preview.columns && (
                <span className="text-xs text-gray-500">Columns: {preview.columns.join(', ')}</span>
              )}
            </div>
            {preview.rows && preview.rows.length > 0 && (
              <div className="max-h-40 overflow-y-auto">
                <table className="text-xs w-full min-w-max">
                  <thead className="sticky top-0 bg-gray-100">
                    <tr>
                      {(preview.columns || Object.keys(preview.rows[0])).map((col, i) => (
                        <th key={i} className="px-2 py-1 text-left border-b font-medium">{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.slice(0, 5).map((row, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        {(preview.columns || Object.keys(row)).map((col, j) => (
                          <td key={j} className="px-2 py-1 border-b truncate max-w-[150px]">
                            {row[col] || row[col.toLowerCase()] || '—'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Assign to Area</label>
            <select value={areaId} onChange={(e) => setAreaId(e.target.value)} className="w-full px-3 py-2 border rounded-lg">
              <option value="">Auto-detect / None</option>
              {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Assign to Partner</label>
            <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className="w-full px-3 py-2 border rounded-lg">
              <option value="">Unassigned</option>
              {partners.filter(p => p.role === 'partner').map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <button type="button" onClick={handleClose} className="px-4 py-2 border rounded-lg">Cancel</button>
          <button
            type="submit"
            disabled={loading || !file}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? (
              <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span> Processing...</>
            ) : (
              <>📥 Import</>          )}
          </button>
        </div>
      </form>
    </Modal>
  );
}
