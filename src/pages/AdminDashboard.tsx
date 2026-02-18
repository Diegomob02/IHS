import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { Plus, Search, Home, DollarSign, Users, Settings, Save, X, Trash2, FileText, Image as ImageIcon, Download, FileCheck, Loader2, Eye, Send, Archive, UserPlus, LogOut, Upload, MessageCircle, Check, Phone, PhoneCall, Clock, Shield, BarChart3, Zap, Wrench, Briefcase, ExternalLink, UserX, Menu } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useSettings } from '../context/SettingsContext';
import NotificationCenter from '../components/common/NotificationCenter';
import { InfoTooltip } from '../components/common/InfoTooltip';
import type { ManualReportContext } from '../components/reports/ManualIncidentReportBuilder';
import { useAuditLog } from '../hooks/useAuditLog';
import { buildDocumentStoragePath, normalizeDocumentsObjectPath } from '../utils/documents';
import { formatPriceError, parsePositiveNumber } from '../utils/pricing';
import { buildManualReportPayload } from '../utils/manualReportContext';
import { isPdfBase64 } from '../utils/pdfBase64';
import { getLocalAiConfig, localAiGenerate } from '../lib/localAiClient';
import { formatAuthorizedReportText } from '../utils/authorizedReportFormatter';
import { bytesToBase64, renderReportPdf } from '../lib/pdf/renderReportPdf';
import { selectPdfTemplate } from '../lib/pdfTemplates/selectPdfTemplate';
import { createReportLogger } from '../lib/reporting/reportLogger';

const LazyDocumentManager = lazy(() => import('../lazy/DocumentManagerLazy'));
const LazyManualIncidentReportBuilder = lazy(() => import('../lazy/ManualIncidentReportBuilderLazy'));
const LazyReportPdfTemplates = lazy(() => import('../lazy/ReportPdfTemplatesLazy'));
const LazyMonthlyCostLedger = lazy(() => import('../lazy/MonthlyCostLedgerLazy'));
const LazyAdminSettings = lazy(() => import('./AdminSettings'));
const LazyPropertyBillingTab = lazy(() => import('../lazy/PropertyBillingTabLazy'));

// Mock Data for Admin View (Properties still mock for now, but Users will be real)
const INITIAL_PROPERTIES = [
  { 
    id: '1', 
    title: 'Villa Mar Azul', 
    owner: 'juan.perez@example.com', 
    address: 'Calle del Mar 123, Cabo San Lucas',
    status: 'active'
  },
  { 
    id: '2', 
    title: 'Casa del Sol', 
    owner: 'maria.gonzalez@example.com', 
    address: 'Av. Playa Grande 45, San José del Cabo',
    status: 'active'
  },
  { 
    id: '3', 
    title: 'Penthouse Vista Real', 
    owner: 'robert.smith@email.com', 
    address: 'Corredor Turístico Km 15',
    status: 'maintenance'
  }
];

export default function AdminDashboard({ user, properties, setProperties, onLogout }: { user: any, properties: any[], setProperties: (props: any[]) => void, onLogout: () => void }) {
  const { t, formatCurrency, language } = useSettings();
  const { logAction } = useAuditLog();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const contractFileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'properties' | 'users' | 'leads' | 'contractors' | 'requests' | 'pdf_templates' | 'pdf_ledger' | 'settings' | 'documents'>('properties');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [showAddProperty, setShowAddProperty] = useState(false);
  const [showAddUser, setShowAddUser] = useState(false);
  const [uploading, setUploading] = useState(false);
  
  // Real Data State
  const [dbUsers, setDbUsers] = useState<any[]>([]);
  const [dbLeads, setDbLeads] = useState<any[]>([]);
  const [dbContractors, setDbContractors] = useState<any[]>([]);
  const [dbRequests, setDbRequests] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [loadingContractors, setLoadingContractors] = useState(false);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [monthlyReportRunsByProperty, setMonthlyReportRunsByProperty] = useState<Record<string, any>>({});
  const [updatingContractorId, setUpdatingContractorId] = useState<string | null>(null);
  const [updatingRequestId, setUpdatingRequestId] = useState<string | null>(null);
  const [requestPropertyFilter, setRequestPropertyFilter] = useState<string>('all');
  const [requestStatusFilter, setRequestStatusFilter] = useState<string>('all');
  const [requestFrom, setRequestFrom] = useState<string>('');
  const [requestTo, setRequestTo] = useState<string>('');
  const [requestPage, setRequestPage] = useState<number>(1);
  const [requestTotal, setRequestTotal] = useState<number>(0);

  // Super Admin Stats
  const [globalStats, setGlobalStats] = useState({
    totalProperties: 0,
    totalLeads: 0,
    totalUsers: 0,
    totalIssues: 0
  });
  const [paymentStats, setPaymentStats] = useState({
    collectedCents: 0,
    attemptsTotal: 0,
    attemptsSucceeded: 0,
    attemptsFailed: 0,
  });
  const [adminPerformance, setAdminPerformance] = useState<any[]>([]);
  const [overviewAdmins, setOverviewAdmins] = useState<any[]>([]);
  const [kpiAdminFilter, setKpiAdminFilter] = useState<string>('all');
  const [kpiMonth, setKpiMonth] = useState<string>(new Date().toISOString().slice(0, 7));
  const [propertyKpis, setPropertyKpis] = useState<any[]>([]);
  const [loadingKpis, setLoadingKpis] = useState(false);
  const [assignmentConfig, setAssignmentConfig] = useState({
    timeout_hours: 24,
    strategy: 'load_balance' // 'load_balance' | 'random'
  });
  const [loadingOverview, setLoadingOverview] = useState(false);
  
  // Chat / CRM State - REMOVED WPP
  // const [selectedLead, setSelectedLead] = useState<any | null>(null);
  // const [chatMessages, setChatMessages] = useState<any[]>([]);
  // const [newMessage, setNewMessage] = useState('');
  // const [loadingChat, setLoadingChat] = useState(false);
  
  // Call Logging State
  const [showCallLogModal, setShowCallLogModal] = useState(false);
  const [callingLead, setCallingLead] = useState<any | null>(null);
  const [callOutcome, setCallOutcome] = useState('interested');
  const [callNotes, setCallNotes] = useState('');
  const [callDuration, setCallDuration] = useState('0'); // In minutes for manual entry

  // New Property Form State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [managingProp, setManagingProp] = useState<any | null>(null); // For "Manage/Report" modal
  const [managePropertyTab, setManagePropertyTab] = useState<'operacion' | 'cobros'>('operacion');

  // User Form State (Create & Edit)
  const [newUser, setNewUser] = useState({ 
    id: '', 
    name: '', 
    email: '', 
    role: 'owner', 
    phone: '', 
    permissions: {
      can_edit_fees: false,
      can_assign_leads: false,
      can_manage_roles: false
    }
  });
  const [isEditingUser, setIsEditingUser] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentUserProfile, setCurrentUserProfile] = useState<any>(null);
  const [selectedPropertyIds, setSelectedPropertyIds] = useState<string[]>([]);
  const [bulkMonthlyFee, setBulkMonthlyFee] = useState('');
  const [applyingBulkFee, setApplyingBulkFee] = useState(false);
  const [deletePropertyOpen, setDeletePropertyOpen] = useState(false);
  const [propertyPendingDelete, setPropertyPendingDelete] = useState<any | null>(null);
  const [deletingProperty, setDeletingProperty] = useState(false);
  const [deletePropertyError, setDeletePropertyError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProfile = async () => {
      if (user?.email) {
        const { data } = await supabase
          .from('users')
          .select('*')
          .eq('email', user.email)
          .single();
        setCurrentUserProfile(data);
      }
    };
    fetchProfile();
  }, [user]);

  const openDeletePropertyModal = (prop: any) => {
    if (currentUserProfile?.role !== 'super_admin') return;
    setPropertyPendingDelete(prop);
    setDeletePropertyError(null);
    setDeletePropertyOpen(true);
  };

  const closeDeletePropertyModal = () => {
    if (deletingProperty) return;
    setDeletePropertyOpen(false);
    setPropertyPendingDelete(null);
    setDeletePropertyError(null);
  };

  useEffect(() => {
    if (activeTab === 'users') {
      fetchUsers();
    } else if (activeTab === 'leads') {
      fetchLeads();
    } else if (activeTab === 'contractors') {
      fetchContractors();
    } else if (activeTab === 'overview' && (currentUserProfile?.role === 'super_admin' || currentUserProfile?.role === 'admin')) {
      fetchOverviewData();
    }
  }, [activeTab, currentUserProfile]);

  useEffect(() => {
    if (activeTab !== 'requests') return;
    fetchRequests();
  }, [activeTab, requestPropertyFilter, requestStatusFilter, requestFrom, requestTo, requestPage, currentUserProfile?.id]);

  const fetchOverviewData = async () => {
    setLoadingOverview(true);
    try {
      const isSuper = currentUserProfile?.role === 'super_admin';
      const userId = currentUserProfile?.id;

      // 1. Fetch Counts (Filtered by role)
      let propsQuery = supabase.from('properties').select('id', { count: 'exact' });
      let leadsQuery = supabase.from('leads').select('id', { count: 'exact' });
      let issuesQuery = supabase.from('maintenance_requests').select('id', { count: 'exact' });

      if (!isSuper) {
        propsQuery = propsQuery.eq('assigned_admin_id', userId);
        leadsQuery = leadsQuery.eq('assigned_to', userId);
        // Issues are linked to properties, so complex filter or just rely on KPIs for issues
        // For simplicity in this overview card, we might skip issues query or join properties
        // But let's leave issues global count for now or fix it later if critical
      }

      const { count: propsCount } = await propsQuery;
      const { count: leadsCount } = await leadsQuery;
      const { count: usersCount } = await supabase.from('users').select('id', { count: 'exact' }); // Users are global usually
      const { count: issuesCount } = await issuesQuery;

      setGlobalStats({
        totalProperties: propsCount || 0,
        totalLeads: leadsCount || 0,
        totalUsers: usersCount || 0,
        totalIssues: issuesCount || 0
      });

      const period = String(kpiMonth || new Date().toISOString().slice(0, 7)).replace('-', '');
      let propertyIdsForScope: string[] = [];
      if (!isSuper && userId) {
        const { data: propIds } = await supabase.from('properties').select('id').eq('assigned_admin_id', userId);
        propertyIdsForScope = (propIds || []).map((p: any) => String(p.id));
      }
      const payQuery = supabase
        .from('payment_attempts')
        .select('status, amount_cents, property_id')
        .eq('period_yyyymm', period)
        .order('created_at', { ascending: false })
        .limit(5000);

      const scopedPay = !isSuper && propertyIdsForScope.length ? payQuery.in('property_id', propertyIdsForScope) : payQuery;
      const { data: payRows } = await scopedPay;
      const rows = (payRows || []) as any[];
      let total = 0;
      let succeeded = 0;
      let failed = 0;
      let collected = 0;
      for (const r of rows) {
        total += 1;
        const st = String(r.status || '');
        if (st === 'succeeded') {
          succeeded += 1;
          collected += Number(r.amount_cents || 0);
        }
        if (st === 'failed') failed += 1;
      }
      setPaymentStats({
        collectedCents: collected,
        attemptsTotal: total,
        attemptsSucceeded: succeeded,
        attemptsFailed: failed,
      });

      // 2. Fetch Admin Performance (Only for Super Admin)
      if (isSuper) {
        const { data: admins } = await supabase
          .from('users')
          .select(`
            id, name, email, role,
            properties:properties(
              id,
              maintenance_requests(count)
            ),
            leads:leads(count)
          `)
          .in('role', ['admin', 'super_admin']);
        
        if (admins) {
          setOverviewAdmins(admins.map((a: any) => ({ id: a.id, name: a.name, email: a.email, role: a.role })));
          const perf = admins.map((admin: any) => {
            const totalIssues = admin.properties?.reduce((sum: number, prop: any) => {
               return sum + (prop.maintenance_requests?.[0]?.count || 0);
            }, 0) || 0;

            return {
              ...admin,
              assignedProperties: admin.properties?.length || 0,
              assignedLeads: admin.leads?.[0]?.count || 0,
              openIssues: totalIssues
            };
          });
          setAdminPerformance(perf);
        }
      } else {
        // For Regular Admin, we just need the list for the filter dropdown (self)
        setOverviewAdmins([{ id: userId, name: currentUserProfile.name, email: currentUserProfile.email, role: 'admin' }]);
        setAdminPerformance([]); 
      }

      // 3. Fetch Config (Super Admin only)
      if (isSuper) {
        const { data: config } = await supabase
          .from('app_settings')
          .select('value')
          .eq('key', 'auto_assignment_config')
          .single();
        
        if (config) {
          setAssignmentConfig(config.value);
        }
      }

    } catch (error) {
      console.error('Error fetching overview:', error);
    } finally {
      setLoadingOverview(false);
    }
  };

  const fetchPropertyKpis = async () => {
    setLoadingKpis(true);
    try {
      const monthStart = `${kpiMonth}-01`;
      const adminId = kpiAdminFilter === 'all' ? null : kpiAdminFilter;

      const { data, error } = await supabase.rpc('get_property_kpis', {
        p_month_start: monthStart,
        p_admin_id: adminId
      });

      if (error) throw error;
      const kpis = data || [];
      setPropertyKpis(kpis);

      const propertyIds = kpis.map((r: any) => r.property_id).filter(Boolean);
      if (propertyIds.length) {
        const { data: runs } = await supabase
          .from('report_runs')
          .select('id, property_id, month, status, archived_at, archive_result, executive_summary, started_at, finished_at')
          .eq('report_key', 'property_monthly_maintenance')
          .eq('month', kpiMonth)
          .in('property_id', propertyIds)
          .order('started_at', { ascending: false });

        const byProperty: Record<string, any> = {};
        (runs || []).forEach((r: any) => {
          const pid = r.property_id;
          if (pid && !byProperty[pid]) byProperty[pid] = r;
        });
        setMonthlyReportRunsByProperty(byProperty);
      } else {
        setMonthlyReportRunsByProperty({});
      }
    } catch (error: any) {
      console.error('Error fetching property KPIs:', error);
      setPropertyKpis([]);
      setMonthlyReportRunsByProperty({});
    } finally {
      setLoadingKpis(false);
    }
  };

  const handleExportKpisCsv = () => {
    const adminNameById = new Map(overviewAdmins.map((a: any) => [a.id, a.name || a.email || a.id]));

    const header = [
      'property_id',
      'title',
      'owner_email',
      'assigned_admin',
      'monthly_fee',
      'contract_status',
      'open_requests',
      'logs_count',
      'logs_cost',
      'last_log_date',
      'docs_count',
      'last_doc_created_at'
    ];

    const escape = (value: any) => {
      const str = value === null || value === undefined ? '' : String(value);
      const escaped = str.replace(/"/g, '""');
      return `"${escaped}"`;
    };

    const rows = (propertyKpis || []).map((r: any) => [
      r.property_id,
      r.title,
      r.owner_email,
      adminNameById.get(r.assigned_admin_id) || r.assigned_admin_id || '',
      r.monthly_fee,
      r.contract_status,
      r.open_requests,
      r.logs_count,
      r.logs_cost,
      r.last_log_date,
      r.docs_count,
      r.last_doc_created_at
    ]);

    const csv = [header, ...rows].map(cols => cols.map(escape).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `kpis_propiedades_${kpiMonth}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    if (activeTab === 'overview' && currentUserProfile?.role === 'super_admin') {
      fetchPropertyKpis();
    }
  }, [activeTab, currentUserProfile, kpiMonth, kpiAdminFilter]);

  const handleSaveConfig = async () => {
    try {
      const { error } = await supabase
        .from('app_settings')
        .upsert({
          key: 'auto_assignment_config',
          value: assignmentConfig,
          updated_at: new Date(),
          updated_by: user.id
        });
      
      if (error) throw error;
      
      await logAction('update_config', 'app_settings', { key: 'auto_assignment_config', value: assignmentConfig });
      alert(t('settingsSaved'));
    } catch (error: any) {
      alert(`${t('settingSaveError')}: ${error.message}`);
    }
  };

  const handleRunAutoAssign = async () => {
    try {
      const { error } = await supabase.rpc('auto_assign_resources');
      if (error) throw error;
      
      await logAction('run_auto_assign', 'system', { triggered_by: user.id });
      alert(t('autoAssignSuccess'));
      fetchOverviewData(); // Refresh stats
    } catch (error: any) {
      alert(`${t('runAutoAssignErrorPrefix')}${error.message}`);
    }
  };

  const fetchLeads = async () => {
    setLoadingLeads(true);
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching leads:', error);
    } else {
      setDbLeads(data || []);
    }
    setLoadingLeads(false);
  };

  const fetchContractors = async () => {
    setLoadingContractors(true);
    const { data, error } = await supabase
      .from('contractor_applications')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching contractors:', error);
    } else {
      setDbContractors(data || []);
    }
    setLoadingContractors(false);
  };

  const fetchRequests = async () => {
    setLoadingRequests(true);
    try {
      const fromIso = requestFrom ? `${requestFrom}T00:00:00.000Z` : null;
      const toIso = requestTo ? `${requestTo}T23:59:59.999Z` : null;
      const status = requestStatusFilter === 'all' ? null : requestStatusFilter;
      const propertyId = requestPropertyFilter === 'all' ? null : requestPropertyFilter;

      const { data, error } = await supabase.functions.invoke('maintenance-requests', {
        body: {
          propertyId,
          status,
          from: fromIso,
          to: toIso,
          page: requestPage,
          pageSize: 10,
        },
      });

      if (error) throw error;
      setDbRequests(Array.isArray(data?.data) ? data.data : []);
      setRequestTotal(Number(data?.total ?? 0));
    } catch (e: any) {
      console.error(e);
      setDbRequests([]);
      setRequestTotal(0);
    } finally {
      setLoadingRequests(false);
    }
  };

  const updateRequestStatus = async (requestId: string, status: string) => {
    setUpdatingRequestId(requestId);
    try {
      const { data, error } = await supabase.functions.invoke('maintenance-request-update-status', {
        body: { requestId, status },
      });

      if (error) throw error;
      if (!data?.ok) throw new Error(data?.message || t('unknownError'));

      setDbRequests((prev) => prev.map((r) => (r.id === requestId ? { ...r, status } : r)));
    } catch (error: any) {
      alert(`Error al actualizar solicitud: ${error?.message || t('unknownError')}`);
    } finally {
      setUpdatingRequestId(null);
    }
  };

  const updateContractorStatus = async (applicationId: string, status: string, opts?: { forceNotify?: boolean }) => {
    setUpdatingContractorId(applicationId);
    try {
      const { data, error } = await supabase.functions.invoke('contractor-update-status', {
        body: { applicationId, status, notify: true, forceNotify: Boolean(opts?.forceNotify ?? false), baseUrl: window.location.origin }
      });

      if (error) throw error;
      if (!data?.ok) throw new Error(data?.message || t('unknownError'));

      setDbContractors((prev) => prev.map((c) => (c.id === applicationId ? { ...c, status } : c)));

      if (status === 'approved') {
        const inviteLink = String((data as any)?.inviteLink || '');
        const authLink = String((data as any)?.auth?.actionLink || '');
        const warnings = Array.isArray((data as any)?.warnings) ? (data as any).warnings : [];
        const lines = [
          inviteLink ? `Link portal (token): ${inviteLink}` : null,
          authLink ? `Link activación Auth: ${authLink}` : null,
          warnings.length ? `Warnings: ${warnings.join(', ')}` : null,
        ].filter(Boolean);
        if (lines.length) window.prompt('Activación de contratista (copia los links si hace falta):', lines.join('\n'));
      }
    } catch (error: any) {
      alert(`Error al actualizar contratista: ${error?.message || t('unknownError')}`);
    } finally {
      setUpdatingContractorId(null);
    }
  };

  const updateLeadStatus = async (id: string, newStatus: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('lead-update-status', {
        body: { leadId: id, status: newStatus }
      });

      if (error) throw error;
      if (!data?.ok) throw new Error(data?.message || t('unknownError'));

      setDbLeads(dbLeads.map(lead => lead.id === id ? { ...lead, status: newStatus } : lead));
    } catch (error: any) {
      alert(`${t('leadStatusUpdateErrorPrefix')}${error.message}`);
    }
  };

  const updateLeadAssignment = async (id: string, userId: string) => {
    try {
      const { error } = await supabase
        .from('leads')
        .update({ assigned_to: userId || null })
        .eq('id', id);
      
      if (error) throw error;
      
      // Optimistic update
      setDbLeads(dbLeads.map(lead => lead.id === id ? { ...lead, assigned_to: userId || null } : lead));
    } catch (error: any) {
      alert('Error al asignar usuario: ' + error.message);
    }
  };

  // Chat functions removed
  /*
  const fetchChatMessages = async (leadId: string) => {
    // ...
  };

  const handleOpenChat = (lead: any) => {
    // ...
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    // ...
  };
  */

  const fetchUsers = async () => {
    setLoadingUsers(true);
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching users:', error);
    } else {
      const usersRows = data || [];
      const emails = usersRows.map((u: any) => String(u.email || '').trim()).filter(Boolean);
      let rolesStatusRows: any[] = [];

      if (emails.length > 0) {
        const { data: rolesData, error: rolesError } = await supabase
          .from('user_roles')
          .select('email,status')
          .in('email', emails);
        if (rolesError) {
          console.error('Error fetching user_roles:', rolesError);
        } else {
          rolesStatusRows = rolesData || [];
        }
      }

      const statusByEmail = new Map(
        rolesStatusRows
          .filter((r: any) => r?.email)
          .map((r: any) => [String(r.email).toLowerCase(), String(r.status || '')])
      );

      setDbUsers(
        usersRows.map((u: any) => {
          const emailKey = String(u.email || '').toLowerCase();
          return {
            ...u,
            access_status: statusByEmail.get(emailKey) || null
          };
        })
      );
    }
    setLoadingUsers(false);
  };

  const handlePhoneClick = (lead: any) => {
    setCallingLead(lead);
    setShowCallLogModal(true);
    // Open system dialer
    window.location.href = `tel:${lead.phone}`;
  };

  const handleSaveCallLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!callingLead) return;

    try {
      // 1. Save Call Log
      const { error: logError } = await supabase
        .from('call_logs')
        .insert([{
          lead_id: callingLead.id,
          agent_id: user.id,
          outcome: callOutcome,
          notes: callNotes,
          duration: parseInt(callDuration) * 60 // convert to seconds
        }]);

      if (logError) throw logError;

      // 2. Update Lead Status based on outcome mapping
      let newStatus = callingLead.status;
      switch (callOutcome) {
        case 'interested':
        case 'more_info':
          newStatus = 'qualified';
          break;
        case 'quote_sent':
          newStatus = 'negotiation'; // New status mapping
          break;
        case 'contract_sent':
          newStatus = 'contract_sent'; // New status mapping
          break;
        case 'platform_onboarding':
          newStatus = 'platform_onboarding'; // New status mapping
          break;
        case 'sold':
          newStatus = 'converted';
          break;
        case 'no_answer':
        case 'voicemail':
          newStatus = 'contacted'; // Attempted
          break;
      }

      if (newStatus !== callingLead.status) {
        await updateLeadStatus(callingLead.id, newStatus);
      }

      alert(t('callLoggedSuccess'));
      setShowCallLogModal(false);
      setCallingLead(null);
      setCallNotes('');
      setCallOutcome('interested');
      setCallDuration('0');

    } catch (error: any) {
      alert(`${t('callLogErrorPrefix')}${error.message}`);
    }
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (isEditingUser && newUser.id) {
        // Update Existing User
        const { error } = await supabase
          .from('users')
          .update({
            name: newUser.name,
            email: newUser.email,
            role: newUser.role,
            phone: newUser.phone,
            permissions: newUser.permissions
          })
          .eq('id', newUser.id);

        if (error) throw error;

        // Update local state
        setDbUsers(dbUsers.map(u => u.id === newUser.id ? { ...u, ...newUser } : u));
        
        await logAction('update_user', 'users', { userId: newUser.id, updates: newUser }, newUser.id);
        alert(t('userUpdatedSuccess'));
      } else {
        // Create New User
        
        // 1. Try to fetch if user already exists (to prevent duplicate errors and provide better feedback)
        const { data: existingUser } = await supabase
          .from('users')
          .select('id')
          .eq('email', newUser.email)
          .single();

        if (existingUser) {
           alert(t('userAlreadyExists'));
           return;
        }

        // 2. Insert User into 'public.users'
        // NOTE: This creates a profile record, but NOT an Auth User (Supabase Auth).
        // To allow them to login, they must eventually Sign Up or we use an Admin API to invite them.
        // For now, we store the profile so we can link properties to them.
        const { data, error } = await supabase
          .from('users')
          .insert([{
            name: newUser.name,
            email: newUser.email,
            role: newUser.role,
            phone: newUser.phone,
            permissions: newUser.permissions
          }])
          .select();

        if (error) {
            console.error("Error inserting user:", error);
            throw error;
        }

        if (data) {
             setDbUsers([data[0], ...dbUsers]);
             await logAction('create_user', 'users', { newUser }, data[0].id);
             alert(`${t('userAddedSuccessPrefix')}${newUser.name}${t('userAddedSuccessSuffix')}`);
        }
      }

      handleCloseUserModal();
    } catch (error: any) {
      alert(`${t('errorSavingUserPrefix')}${error.message}`);
    }
  };

  const handleDeleteUser = async (user: any) => {
    if (!window.confirm(`${t('confirmDeleteUserPrefix')}${user.name}${t('confirmDeleteUserSuffix')}`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('users')
        .delete()
        .eq('id', user.id);

      if (error) throw error;

      setDbUsers(dbUsers.filter(u => u.id !== user.id));
      await logAction('delete_user', 'users', { deletedUser: user }, user.id);
      alert(t('userDeletedSuccess'));
    } catch (error: any) {
      console.error('Error deleting user:', error);
      alert(`${t('errorDeletingUserPrefix')}${error.message}`);
    }
  };

  const handleDeactivateUser = async (targetUser: any) => {
    const targetRole = String(targetUser?.role || '');
    if (targetRole !== 'owner' && targetRole !== 'contractor') {
      alert('Solo puedes dar de baja a propietarios o contratistas.');
      return;
    }

    if (!window.confirm(`${t('confirmDeactivateUserPrefix')}${targetUser.name}${t('confirmDeactivateUserSuffix')}`)) {
      return;
    }

    try {
      const email = String(targetUser?.email || '').trim();
      if (!email) {
        throw new Error('Email inválido');
      }

      const { error } = await supabase
        .from('user_roles')
        .upsert(
          {
            email,
            role: targetRole,
            status: 'revoked',
            updated_by: currentUserProfile?.id || null
          },
          { onConflict: 'email' }
        );

      if (error) throw error;

      setDbUsers(dbUsers.map((u) => (u.id === targetUser.id ? { ...u, access_status: 'revoked' } : u)));
      await logAction('deactivate_user', 'user_roles', { email, role: targetRole, status: 'revoked' }, targetUser.id);
      alert(t('userDeactivatedSuccess'));
    } catch (error: any) {
      console.error('Error deactivating user:', error);
      alert(`${t('errorDeactivatingUserPrefix')}${error.message}`);
    }
  };

  const handleEditUserClick = (user: any) => {
    setNewUser({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone || '',
      permissions: user.permissions || {
        can_edit_fees: false,
        can_assign_leads: false,
        can_manage_roles: false
      }
    });
    setIsEditingUser(true);
    setShowAddUser(true);
  };

  const handleCloseUserModal = () => {
    setShowAddUser(false);
    setIsEditingUser(false);
    setNewUser({ 
      id: '', 
      name: '', 
      email: '', 
      role: 'owner', 
      phone: '', 
      permissions: {
        can_edit_fees: false,
        can_assign_leads: false,
        can_manage_roles: false
      }
    });
  };

  const [manualReportContext, setManualReportContext] = useState<ManualReportContext>({ incidentText: '', images: [], costs: [] });
  const [manualReportValid, setManualReportValid] = useState(false);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [generatedPdf, setGeneratedPdf] = useState<string | null>(null); // Base64 string mock
  const [generatedPdfUrl, setGeneratedPdfUrl] = useState<string | null>(null);
  const [generatedReportMonth, setGeneratedReportMonth] = useState<string | null>(null);
  const [sendingEmail, setSendingEmail] = useState(false);
  
  // New Property Form State
  const [newProp, setNewProp] = useState({ 
    title: '', 
    address: '', 
    owner_email: '',
    assigned_admin_id: '',
    gallery: [] as string[], // Public images
    monthly_fee: '', // Custom Fee
    contract_status: 'pending', // Contract status
    contract_url: '', // PDF Contract URL
    contract_path: '', // Storage object path in documents bucket
    services: {
      hvac: false,
      pool: false,
      gardening: false,
      pestControl: false,
      cleaning: false,
      concierge: false
    }
  });

  const handleGenerateReport = async () => {
    setGeneratingReport(true);
    
    try {
      if (!managingProp?.id || managingProp.id.length < 20) {
        throw new Error(t('mockPropertyDocSaveError'));
      }

      const month = new Date().toISOString().slice(0, 7);
      const payload = buildManualReportPayload({ propertyId: managingProp.id, month, ctx: manualReportContext });
      const logger = createReportLogger({ propertyId: payload.propertyId, month: payload.month });
      await logger.info('start', 'Inicio generación local', {
        property_id: payload.propertyId,
        month: payload.month,
        costs_count: payload.costs.length,
        images_count: payload.images.length,
      });

      const costsText = payload.costs
        .map((c) => `- ${c.date}: ${c.concept} (${c.amount})`)
        .join('\n');
      const imagesText = payload.images
        .map((i) => `- ${i.caption ? `${i.caption} · ` : ''}${i.url}`)
        .join('\n');

      const prompt = [
        'Redacta un reporte mensual profesional para un cliente de administración de propiedad.',
        'Responde en español, sin emojis, y usando títulos con # y listas con -.',
        `Propiedad: ${String(managingProp?.title || managingProp?.name || 'Propiedad')}`,
        `Periodo (YYYY-MM): ${payload.month}`,
        '',
        'Contexto de incidentes/eventos (entrada del administrador):',
        payload.incidentText,
        '',
        'Costos registrados (fecha: concepto (monto)):',
        costsText || '- (sin costos)',
        '',
        'Imágenes relevantes (caption/url):',
        imagesText || '- (sin imágenes)',
        '',
        'Estructura requerida:',
        '# Resumen ejecutivo',
        '# Sucesos del período',
        '# Costos detallados',
        '# Recomendaciones',
      ].join('\n');

      const cfg = await getLocalAiConfig();
      if (!cfg.apiKey || !cfg.model || !cfg.endpoint) {
        throw new Error('Falta configuración obligatoria de IA local (API key, modelo o endpoint)');
      }
      await logger.info('config', 'Configuración IA local cargada', { endpoint: cfg.endpoint, model: cfg.model });

      const ai = await localAiGenerate({ prompt });
      const aiText = ai.text;
      await logger.info('ai', 'Texto generado por IA', { chars: aiText.length });

      const formatted = formatAuthorizedReportText(aiText, { title: `Reporte mensual ${payload.month}` });

      const { data: templates, error: tplErr } = await supabase
        .from('report_pdf_templates')
        .select('*')
        .eq('report_key', 'property_monthly_maintenance')
        .eq('enabled', true)
        .order('priority', { ascending: true });
      if (tplErr) throw tplErr;

      const selectedTemplate = selectPdfTemplate((templates || []) as any, {
        reportKey: 'property_monthly_maintenance',
        propertyId: payload.propertyId,
        totalCost: payload.totals.totalCost,
        eventsCount: payload.costs.length,
        hasImages: payload.images.length > 0,
        location: String(managingProp?.address || managingProp?.location || ''),
      });
      await logger.info('templates', 'Plantillas cargadas', {
        templates_count: (templates || []).length,
        selected_template_id: selectedTemplate?.id || null,
      });

      const pdfBytes = await renderReportPdf({
        propertyTitle: String(managingProp?.title || managingProp?.name || 'Propiedad'),
        propertyLocation: String(managingProp?.address || managingProp?.location || ''),
        month: payload.month,
        formatted,
        costs: payload.costs,
        totalCost: payload.totals.totalCost,
        images: payload.images.map((i) => ({ url: i.url, caption: i.caption })),
        templateSpec: selectedTemplate?.template_spec,
        formatMoney: (n) => formatCurrency(n),
      });
      await logger.info('pdf', 'PDF renderizado', { bytes: pdfBytes.length });

      const pdfBase64 = bytesToBase64(pdfBytes);
      setGeneratedPdf(pdfBase64);
      setGeneratedReportMonth(payload.month);
      if (generatedPdfUrl) URL.revokeObjectURL(generatedPdfUrl);
      const blobUrl = URL.createObjectURL(new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' }));
      setGeneratedPdfUrl(blobUrl);

      const userId = (await supabase.auth.getUser()).data.user?.id || null;
      const { error: ledgerErr } = await supabase
        .from('monthly_cost_ledger')
        .upsert(
          {
            property_id: payload.propertyId,
            month: payload.month,
            events: { incidentText: payload.incidentText, aiText, costs: payload.costs, images: payload.images },
            totals: payload.totals,
            pdf_base64: pdfBase64,
            pdf_bytes: pdfBytes.length,
            created_by: userId,
            updated_at: new Date().toISOString(),
          } as any,
          { onConflict: 'property_id,month' }
        );
      if (ledgerErr) throw ledgerErr;
      await logger.info('ledger', 'Bitácora mensual guardada', { property_id: payload.propertyId, month: payload.month });
    } catch (error: any) {
      console.error('Error generating report:', error);
      const logger = createReportLogger({ propertyId: String(managingProp?.id || ''), month: generatedReportMonth });
      await logger.error('error', 'Fallo generando reporte', { message: String(error?.message || error) });
      const msg = String(error?.message || error || 'Error desconocido');
      const isFetch = msg.toLowerCase().includes('failed to fetch') || msg.toLowerCase().includes('networkerror');
      const isPermission =
        String((error as any)?.code || '').trim() === '42501' ||
        msg.toLowerCase().includes('permission denied') ||
        msg.toLowerCase().includes('row level security') ||
        msg.toLowerCase().includes('row-level security') ||
        msg.toLowerCase().includes('rls');
      alert(
        isPermission
          ? `No tienes permisos para generar/guardar el reporte (admin/super_admin).\n\nDetalle: ${msg}`
          : isFetch
            ? `No se pudo conectar al proveedor de IA local. Revisa endpoint/modelo y usa "Probar conexión" en Settings.\n\nDetalle: ${msg}`
            : `Error al generar reporte: ${msg}`
      );
    } finally {
      setGeneratingReport(false);
    }
  };



  const handleEditClick = (prop: any) => {
    setEditingId(prop.id);
    setNewProp({
      title: prop.title,
      address: prop.address,
      owner_email: prop.owner || '', 
      assigned_admin_id: prop.assigned_admin_id || '',
      gallery: prop.gallery || (prop.image ? [prop.image] : []),
      monthly_fee: prop.monthly_fee || '',
      contract_status: prop.contract_status || 'pending',
      contract_url: prop.contract_url || '',
      contract_path: prop.contract_path || normalizeDocumentsObjectPath(prop.contract_url) || '',
      services: prop.services || {
        hvac: false,
        pool: false,
        gardening: false,
        pestControl: false,
        cleaning: false,
        concierge: false
      }
    });
    setShowAddProperty(true);
  };

  const handleSaveProperty = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Ensure at least one image is set as "main" image for backward compatibility
    const mainImage = newProp.gallery.length > 0 ? newProp.gallery[0] : `https://coreva-normal.trae.ai/api/ide/v1/text_to_image?prompt=Luxury%20home%20${newProp.title}&image_size=landscape_16_9`;
    const finalGallery = newProp.gallery.length > 0 ? newProp.gallery : [mainImage];

    try {
      const feeError = formatPriceError(newProp.monthly_fee);
      if (feeError) {
        alert(feeError);
        return;
      }

      // Resolve owner_id
      let ownerId = null;
      if (newProp.owner_email) {
         const { data } = await supabase.from('users').select('id').eq('email', newProp.owner_email).single();
         if (data) ownerId = data.id;
      }

      const parsedFee = parsePositiveNumber(newProp.monthly_fee);

      const propertyData = {
        title: newProp.title,
        location: newProp.address,
        owner_email: newProp.owner_email,
        owner_id: ownerId,
        assigned_admin_id: newProp.assigned_admin_id || null,
        images: finalGallery,
        services: newProp.services,
        monthly_fee: parsedFee ?? 0,
        contract_status: newProp.contract_status,
        contract_url: newProp.contract_url,
        contract_path: newProp.contract_path || normalizeDocumentsObjectPath(newProp.contract_url),
        property_type: 'residential'
      };

      if (editingId) {
        const existing = properties.find((p: any) => p.id === editingId);
        const previousFee = existing?.monthly_fee;

        // Edit Mode
        const { error } = await supabase
          .from('properties')
          .update(propertyData)
          .eq('id', editingId);

        if (error) throw error;
        
        // Optimistic update
        setProperties(properties.map(p => p.id === editingId ? { 
            ...p, 
            ...propertyData, 
            address: propertyData.location, 
            owner: propertyData.owner_email,
            image: mainImage, 
            gallery: finalGallery 
        } : p));
        
        await logAction('update_property', 'properties', { propertyId: editingId, updates: propertyData }, editingId);

        if (typeof previousFee !== 'undefined' && Number(previousFee) !== Number(propertyData.monthly_fee)) {
          await logAction(
            'update_property_pricing',
            'properties',
            {
              field: 'monthly_fee',
              previous_value: previousFee,
              new_value: propertyData.monthly_fee
            },
            editingId
          );
        }
        alert(`Propiedad "${newProp.title}" actualizada correctamente.`);
      } else {
        // Create Mode
        const { data, error } = await supabase
          .from('properties')
          .insert([propertyData])
          .select();

        if (error) throw error;

        if (data) {
           const newP = data[0];
           setProperties([...properties, { 
               ...newP, 
               address: newP.location, 
               owner: newP.owner_email,
               image: mainImage, 
               gallery: newP.images 
           }]);
           await logAction('create_property', 'properties', { newProperty: newP }, newP.id);
           alert(`Propiedad "${newP.title}" creada y asignada a ${newP.owner_email}`);
        }
      }

      handleCloseModal();
    } catch (error: any) {
      console.error('Error saving property:', error);
      alert(`${t('errorSavingPropertyPrefix')}${error.message}`);
    }
  };

  const toggleSelectedProperty = (propertyId: string) => {
    setSelectedPropertyIds((prev) => {
      if (prev.includes(propertyId)) return prev.filter((id) => id !== propertyId);
      return [...prev, propertyId];
    });
  };

  const clearSelectedProperties = () => {
    setSelectedPropertyIds([]);
    setBulkMonthlyFee('');
  };

  const handleApplyBulkFee = async () => {
    const feeError = formatPriceError(bulkMonthlyFee);
    if (feeError) {
      alert(feeError);
      return;
    }

    const fee = parsePositiveNumber(bulkMonthlyFee);
    if (fee === null) {
      alert(t('invalidPrice'));
      return;
    }

    if (selectedPropertyIds.length === 0) return;

    setApplyingBulkFee(true);
    try {
      const beforeById = new Map(properties.map((p: any) => [p.id, p.monthly_fee]));

      const { error } = await supabase
        .from('properties')
        .update({ monthly_fee: fee })
        .in('id', selectedPropertyIds);

      if (error) throw error;

      setProperties(
        properties.map((p: any) =>
          selectedPropertyIds.includes(p.id) ? { ...p, monthly_fee: fee } : p
        )
      );

      for (const id of selectedPropertyIds) {
        const previous = beforeById.get(id);
        if (Number(previous) !== Number(fee)) {
          await logAction(
            'update_property_pricing_bulk',
            'properties',
            {
              field: 'monthly_fee',
              previous_value: previous,
              new_value: fee,
              bulk_count: selectedPropertyIds.length
            },
            id
          );
        }
      }

      alert(t('pricesUpdatedSuccess'));
      clearSelectedProperties();
    } catch (error: any) {
      console.error('Error applying bulk fee:', error);
      alert(`${t('errorUpdatingPricesPrefix')}${error?.message || t('unknownError')}`);
    } finally {
      setApplyingBulkFee(false);
    }
  };

  const handleDeleteProperty = async (prop: any) => {
    if (currentUserProfile?.role !== 'super_admin') return;

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const hasRealId = uuidRegex.test(String(prop?.id || ''));

    try {
      if (hasRealId) {
        const { error } = await supabase
          .from('properties')
          .delete()
          .eq('id', prop.id);
        if (error) throw error;
        await logAction('delete_property', 'properties', { deletedProperty: { id: prop.id, title: prop.title } }, prop.id);
      }

      if (managingProp?.id === prop.id) {
        handleCloseManageModal();
      }
      if (editingId === prop.id) {
        handleCloseModal();
      }

      setProperties(properties.filter((p: any) => p.id !== prop.id));
      alert(t('propertyDeletedSuccess'));
    } catch (error: any) {
      console.error('Error deleting property:', error);
      throw error;
    }
  };

  const confirmDeleteProperty = async () => {
    if (!propertyPendingDelete) return;
    setDeletePropertyError(null);
    setDeletingProperty(true);
    try {
      await handleDeleteProperty(propertyPendingDelete);
      setDeletePropertyOpen(false);
      setPropertyPendingDelete(null);
    } catch (error: any) {
      setDeletePropertyError(`${t('errorDeletingPropertyPrefix')}${error?.message || t('unknownError')}`);
    } finally {
      setDeletingProperty(false);
    }
  };

  const handleCloseManageModal = () => {
    setManagingProp(null);
    setManualReportContext({ incidentText: '', images: [], costs: [] });
    setManualReportValid(false);
    setGeneratedPdf(null);
  };

  const handleCloseModal = () => {
    setShowAddProperty(false);
    setEditingId(null);
    setNewProp({ 
      title: '', 
      address: '', 
      owner_email: '',
      assigned_admin_id: '',
      gallery: [],
      monthly_fee: '',
      contract_status: 'pending',
      contract_url: '',
      contract_path: '',
      services: {
        hvac: false,
        pool: false,
        gardening: false,
        pestControl: false,
        cleaning: false,
        concierge: false
      }
    });
  };

  const openNewPropContract = async () => {
    const objectPath = newProp.contract_path || normalizeDocumentsObjectPath(newProp.contract_url);
    if (!objectPath) return;

    const { data, error } = await supabase.storage
      .from('documents')
      .createSignedUrl(objectPath, 60);

    if (error) {
      alert('No se pudo abrir el contrato: ' + error.message);
      return;
    }

    const signedUrl = data?.signedUrl;
    if (!signedUrl) {
      alert('No se pudo abrir el contrato.');
      return;
    }

    window.open(signedUrl, '_blank', 'noopener,noreferrer');
  };

  // Handle Contract PDF Upload
  const handleContractFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    
    const file = e.target.files[0];
    if (file.type !== 'application/pdf') {
      alert('Solo se permiten archivos PDF para el contrato.');
      return;
    }

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `contract_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
      const folder = editingId ? `${editingId}/contracts` : 'contracts';
      const filePath = `${folder}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('documents') // Use dedicated documents bucket
        .upload(filePath, file);

      if (uploadError) throw uploadError;
      setNewProp(prev => ({ ...prev, contract_path: filePath, contract_url: '' }));
    } catch (error: any) {
      console.error('Error uploading contract:', error);
      alert('Error al subir contrato: ' + error.message);
    } finally {
      setUploading(false);
      if (contractFileInputRef.current) {
        contractFileInputRef.current.value = '';
      }
    }
  };

  // Handle File Upload
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    
    setUploading(true);
    const files = Array.from(e.target.files);
    const newUrls: string[] = [];

    for (const file of files) {
      try {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
        const filePath = `${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('property-images')
          .upload(filePath, file);

        if (uploadError) {
          throw uploadError;
        }

        const { data } = supabase.storage
          .from('property-images')
          .getPublicUrl(filePath);

        if (data) {
          newUrls.push(data.publicUrl);
        }
      } catch (error: any) {
        console.error('Error uploading image:', error.message);
        alert(`Error al subir imagen ${file.name}: ${error.message}`);
      }
    }

    setNewProp(prev => ({
      ...prev,
      gallery: [...prev.gallery, ...newUrls]
    }));
    
    setUploading(false);
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Helper to add mock images (Legacy / Fallback)
  const addMockImageToGallery = () => {
    const keywords = ['kitchen', 'pool', 'bedroom', 'living room', 'garden'];
    const randomKeyword = keywords[Math.floor(Math.random() * keywords.length)];
    const mockUrl = `https://coreva-normal.trae.ai/api/ide/v1/text_to_image?prompt=Luxury%20${randomKeyword}%20modern&image_size=landscape_4_3&ts=${Date.now()}`;
    setNewProp(prev => ({
      ...prev,
      gallery: [...prev.gallery, mockUrl]
    }));
  };

  const removeImageFromGallery = (index: number) => {
    setNewProp(prev => ({
      ...prev,
      gallery: prev.gallery.filter((_, i) => i !== index)
    }));
  };


  const handleServiceChange = (service: keyof typeof newProp.services) => {
    setNewProp(prev => ({
      ...prev,
      services: {
        ...prev.services,
        [service]: !prev.services[service]
      }
    }));
  };

  const filteredUsers = dbUsers.filter(u => {
    const searchLower = searchQuery.toLowerCase();
    return (
      (u.name || '').toLowerCase().includes(searchLower) || 
      (u.email || '').toLowerCase().includes(searchLower) ||
      (u.role || '').toLowerCase().includes(searchLower) ||
      (u.phone || '').includes(searchQuery)
    );
  });

  const filteredLeads = dbLeads.filter(lead => {
    const searchLower = searchQuery.toLowerCase();
    return (
      (lead.name || '').toLowerCase().includes(searchLower) || 
      (lead.email || '').toLowerCase().includes(searchLower) ||
      (lead.message || '').toLowerCase().includes(searchLower) ||
      (lead.phone || '').includes(searchQuery)
    );
  });

  const [maintenanceLogs, setMaintenanceLogs] = useState<any[]>([]);
  const [propertyDocs, setPropertyDocs] = useState<any[]>([]);
  const [loadingPropertyDocs, setLoadingPropertyDocs] = useState(false);
  const [newLog, setNewLog] = useState({ content: '', cost: '', images: [] as string[] });
  const [loadingLogs, setLoadingLogs] = useState(false);

  // Filter Properties based on Role
  const filteredProperties = properties.filter(p => {
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch = 
      (p.title || '').toLowerCase().includes(searchLower) ||
      (p.address || '').toLowerCase().includes(searchLower) ||
      (p.owner || '').toLowerCase().includes(searchLower);

    // Admin Access Control: Only show assigned properties
    if (currentUserProfile?.role === 'admin') {
      return matchesSearch && p.assigned_admin_id === currentUserProfile.id;
    }
    
    // Super Admin sees all
    return matchesSearch;
  });

  const fetchMaintenanceLogs = async (propertyId: string) => {
    setLoadingLogs(true);
    const { data, error } = await supabase
      .from('maintenance_logs')
      .select('*')
      .eq('property_id', propertyId)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching logs:', error);
    } else {
      setMaintenanceLogs(data || []);
    }
    setLoadingLogs(false);
  };

  const handleSaveLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!managingProp) return;

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(managingProp.id)) {
      alert(t('mockPropertyLogSaveError'));
      return;
    }

    try {
      const { data, error } = await supabase
        .from('maintenance_logs')
        .insert([{
          property_id: managingProp.id, // Ensure managingProp has real UUID
          created_by: currentUserProfile?.id || null,
          content: newLog.content,
          cost: parseFloat(newLog.cost) || 0,
          images: newLog.images
        }])
        .select()
        .single();

      if (error) throw error;

      if (data) {
        setMaintenanceLogs([data, ...maintenanceLogs]);
        setNewLog({ content: '', cost: '', images: [] });
        alert(t('noteAddedSuccess'));
      }
    } catch (error: any) {
      console.error('Error saving maintenance log:', {
        message: error?.message,
        code: error?.code,
        details: error?.details,
        hint: error?.hint
      });

      const isRls =
        String(error?.message || '').toLowerCase().includes('row-level security') ||
        String(error?.details || '').toLowerCase().includes('row-level security');

      if (isRls) {
        alert(t('noPermissionSaveLog'));
        return;
      }

      alert(`${t('saveNoteErrorPrefix')}${error?.message || t('unknownError')}`);
    }
  };

  const handleLogImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    setUploading(true);
    // ... reuse upload logic or simplified ...
    const files = Array.from(e.target.files);
    const newUrls: string[] = [];
    
    for (const file of files) {
      try {
        const fileExt = file.name.split('.').pop();
        const fileName = `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
        const { error: uploadError } = await supabase.storage.from('property-images').upload(fileName, file);
        if (uploadError) throw uploadError;
        const { data } = supabase.storage.from('property-images').getPublicUrl(fileName);
        if (data) newUrls.push(data.publicUrl);
      } catch (err) {
        console.error(err);
      }
    }
    setNewLog(prev => ({ ...prev, images: [...prev.images, ...newUrls] }));
    setUploading(false);
  };

  const handleSendReport = async () => {
    setSendingEmail(true);
    
    try {
      if (!generatedPdf) throw new Error(t('noReportGenerated'));
      if (!isPdfBase64(generatedPdf)) throw new Error('PDF inválido (base64).');

      if (!managingProp?.id || managingProp.id.length < 20) {
        throw new Error(t('mockPropertyDocSaveError'));
      }

      const month = generatedReportMonth || new Date().toISOString().slice(0, 7);
      const logger = createReportLogger({ propertyId: managingProp.id, month });
      await logger.info('start', 'Inicio envío/archivado', { property_id: managingProp.id, month });

      const fileName = `reporte_${month}.pdf`;
      const displayName = `Reporte Mensual ${month}`;

      const bytes = Uint8Array.from(atob(generatedPdf), c => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: 'application/pdf' });

      const filePath = buildDocumentStoragePath(managingProp.id, `reports/${fileName}`);
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, blob, { upsert: true, contentType: 'application/pdf' });

      if (uploadError) throw uploadError;
      await logger.info('storage', 'PDF subido a Storage', { bucket: 'documents', path: filePath, bytes: blob.size });

      const userId = (await supabase.auth.getUser()).data.user?.id || null;
      const { data: existingDoc, error: existingErr } = await supabase
        .from('documents')
        .select('id,current_version')
        .eq('property_id', managingProp.id)
        .eq('type', 'report')
        .eq('name', displayName)
        .maybeSingle();
      if (existingErr) throw existingErr;

      let docId = existingDoc?.id ? String(existingDoc.id) : '';
      let nextVersion = existingDoc?.current_version ? Number(existingDoc.current_version) + 1 : 1;

      if (docId) {
        const { error: updErr } = await supabase
          .from('documents')
          .update({ current_version: nextVersion, updated_at: new Date().toISOString() })
          .eq('id', docId);
        if (updErr) throw updErr;
      } else {
        const { data: docData, error: docError } = await supabase
          .from('documents')
          .insert({
            property_id: managingProp.id,
            name: displayName,
            type: 'report',
            current_version: 1,
            created_by: userId,
          })
          .select('id')
          .single();
        if (docError) throw docError;
        docId = String(docData.id);
        nextVersion = 1;
      }

      const { error: versionError } = await supabase.from('document_versions').insert({
        document_id: docId,
        version_number: nextVersion,
        file_path: filePath,
        file_size: blob.size,
        mime_type: 'application/pdf',
        uploaded_by: userId,
        change_log: 'Local PDF report generation',
      });
      if (versionError) throw versionError;
      await logger.info('documents', 'Documento/version archivados', { document_id: docId, version: nextVersion });

      const toRange = (m: string) => {
        const [yStr, moStr] = m.split('-');
        const y = Number(yStr);
        const mo = Number(moStr);
        if (!Number.isFinite(y) || !Number.isFinite(mo) || mo < 1 || mo > 12) throw new Error('Mes inválido');
        const from = `${yStr}-${String(mo).padStart(2, '0')}-01`;
        const d = new Date(Date.UTC(y, mo - 1, 1, 12, 0, 0));
        d.setUTCMonth(d.getUTCMonth() + 1);
        const y2 = d.getUTCFullYear();
        const m2 = d.getUTCMonth() + 1;
        const to = `${y2}-${String(m2).padStart(2, '0')}-01`;
        return { from, to };
      };

      const range = toRange(month);
      const archiveRes = await supabase.rpc('archive_maintenance_logs_for_report_admin', {
        p_property_id: managingProp.id,
        p_from_date: range.from,
        p_to_date: range.to,
        p_report_run_id: crypto.randomUUID(),
      });
      if (archiveRes.error) throw archiveRes.error;
      await logger.info('archive', 'Archivado mensual ejecutado', { result: archiveRes.data });

      alert(t('reportSentAndArchived'));
      setGeneratedPdf(null); 
      if (generatedPdfUrl) URL.revokeObjectURL(generatedPdfUrl);
      setGeneratedPdfUrl(null);
      setGeneratedReportMonth(null);
      setManualReportContext({ incidentText: '', images: [], costs: [] });
      setManualReportValid(false);
      
    } catch (error: any) {
      console.error(error);
      const logger = createReportLogger({ propertyId: String(managingProp?.id || ''), month: generatedReportMonth });
      await logger.error('error', 'Fallo envío/archivado', { message: String(error?.message || error) });
      alert(`${t('errorSendingReportPrefix')}${error.message}`);
    } finally {
      setSendingEmail(false);
    }
  };

  const fetchPropertyDocs = async (propertyId: string) => {
    setLoadingPropertyDocs(true);
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

    const { data: docs, error: docError } = await supabase
      .from('documents')
      .select('*')
      .eq('property_id', propertyId)
      .gte('created_at', monthStart)
      .order('created_at', { ascending: false });

    if (docError) {
      console.error('Error fetching property docs:', docError);
    } else {
      setPropertyDocs(docs || []);
    }
    setLoadingPropertyDocs(false);
  };

  useEffect(() => {
    if (managingProp) {
      setManagePropertyTab('operacion');
      fetchMaintenanceLogs(managingProp.id);
      if (managingProp.id && managingProp.id.length > 20) {
         fetchPropertyDocs(managingProp.id);
      } else {
         setPropertyDocs([]);
      }
    }
  }, [managingProp]);

  return (
    <div className="h-screen bg-gray-100 flex overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-white hidden md:flex flex-col flex-shrink-0">
        <div className="p-6 border-b border-slate-800">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Settings className="text-primary" />
            {t('adminPanel')}
          </h2>
          <p className="text-xs text-slate-400 mt-1">{user.email}</p>
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
          {currentUserProfile?.role === 'super_admin' && (
            <button 
              onClick={() => setActiveTab('overview')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'overview' ? 'bg-primary text-white' : 'hover:bg-slate-800 text-slate-300'}`}
            >
              <BarChart3 size={20} />
              Resumen Global
            </button>
          )}
          <button 
            onClick={() => setActiveTab('properties')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'properties' ? 'bg-primary text-white' : 'hover:bg-slate-800 text-slate-300'}`}
          >
            <Home size={20} />
            {t('properties')}
          </button>
          <button 
            onClick={() => setActiveTab('users')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'users' ? 'bg-primary text-white' : 'hover:bg-slate-800 text-slate-300'}`}
          >
            <Users size={20} />
            {t('users')}
          </button>
          <button 
            onClick={() => setActiveTab('leads')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'leads' ? 'bg-primary text-white' : 'hover:bg-slate-800 text-slate-300'}`}
          >
            <Send size={20} />
            CRM / Leads
          </button>
          <button 
            onClick={() => setActiveTab('contractors')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'contractors' ? 'bg-primary text-white' : 'hover:bg-slate-800 text-slate-300'}`}
          >
            <Briefcase size={20} />
            Contratistas
          </button>
          <button 
            onClick={() => setActiveTab('requests')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'requests' ? 'bg-primary text-white' : 'hover:bg-slate-800 text-slate-300'}`}
          >
            <Wrench size={20} />
            {t('requestsTab')}
          </button>
          {(currentUserProfile?.role === 'super_admin' || currentUserProfile?.role === 'admin') && (
            <button
              onClick={() => setActiveTab('pdf_templates')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'pdf_templates' ? 'bg-primary text-white' : 'hover:bg-slate-800 text-slate-300'}`}
            >
              <FileText size={20} />
              Plantillas PDF
            </button>
          )}
          {(currentUserProfile?.role === 'super_admin' || currentUserProfile?.role === 'admin') && (
            <button
              onClick={() => setActiveTab('pdf_ledger')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'pdf_ledger' ? 'bg-primary text-white' : 'hover:bg-slate-800 text-slate-300'}`}
            >
              <Archive size={20} />
              Bitácora PDF
            </button>
          )}
        </nav>

        <div className="p-4 border-t border-slate-800">
          <button 
            onClick={() => setActiveTab('settings')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors mb-2 ${activeTab === 'settings' ? 'bg-primary text-white' : 'hover:bg-slate-800 text-slate-300'}`}
          >
            <Settings size={20} />
            {t('settings')}
          </button>
          <button 
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors hover:bg-red-900/20 text-slate-300 hover:text-red-400"
          >
            <LogOut size={20} />
            {t('logout')}
          </button>
        </div>
      </aside>

      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileNavOpen(false)}
            aria-label={t('navOpenMenu')}
          />
          <div className="absolute left-0 top-0 h-full w-80 max-w-[85vw] bg-slate-900 text-white overflow-y-auto">
            <div className="p-4 border-b border-slate-800 flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-bold flex items-center gap-2">
                  <Settings className="text-primary" />
                  {t('adminPanel')}
                </div>
                <div className="text-xs text-slate-400 mt-1 break-all">{user.email}</div>
              </div>
              <button
                type="button"
                className="p-2 rounded-md hover:bg-slate-800 text-slate-300 hover:text-white"
                onClick={() => setMobileNavOpen(false)}
                aria-label={t('cancel')}
              >
                <X size={18} />
              </button>
            </div>

            <nav className="p-4 space-y-2">
              {currentUserProfile?.role === 'super_admin' && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('overview');
                    setMobileNavOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'overview' ? 'bg-primary text-white' : 'hover:bg-slate-800 text-slate-300'}`}
                >
                  <BarChart3 size={20} />
                  Resumen Global
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setActiveTab('properties');
                  setMobileNavOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'properties' ? 'bg-primary text-white' : 'hover:bg-slate-800 text-slate-300'}`}
              >
                <Home size={20} />
                {t('properties')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('users');
                  setMobileNavOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'users' ? 'bg-primary text-white' : 'hover:bg-slate-800 text-slate-300'}`}
              >
                <Users size={20} />
                {t('users')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('leads');
                  setMobileNavOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'leads' ? 'bg-primary text-white' : 'hover:bg-slate-800 text-slate-300'}`}
              >
                <Send size={20} />
                CRM / Leads
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('contractors');
                  setMobileNavOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'contractors' ? 'bg-primary text-white' : 'hover:bg-slate-800 text-slate-300'}`}
              >
                <Briefcase size={20} />
                Contratistas
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('requests');
                  setMobileNavOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'requests' ? 'bg-primary text-white' : 'hover:bg-slate-800 text-slate-300'}`}
              >
                <Wrench size={20} />
                {t('requestsTab')}
              </button>
              {(currentUserProfile?.role === 'super_admin' || currentUserProfile?.role === 'admin') && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('pdf_templates');
                    setMobileNavOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'pdf_templates' ? 'bg-primary text-white' : 'hover:bg-slate-800 text-slate-300'}`}
                >
                  <FileText size={20} />
                  Plantillas PDF
                </button>
              )}
              {(currentUserProfile?.role === 'super_admin' || currentUserProfile?.role === 'admin') && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('pdf_ledger');
                    setMobileNavOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'pdf_ledger' ? 'bg-primary text-white' : 'hover:bg-slate-800 text-slate-300'}`}
                >
                  <Archive size={20} />
                  Bitácora PDF
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setActiveTab('settings');
                  setMobileNavOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'settings' ? 'bg-primary text-white' : 'hover:bg-slate-800 text-slate-300'}`}
              >
                <Settings size={20} />
                {t('settings')}
              </button>
            </nav>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <header className="bg-white shadow-sm p-4 sm:p-6 sticky top-0 z-10">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="md:hidden p-2 text-gray-500 hover:text-primary rounded-md hover:bg-gray-100"
                onClick={() => setMobileNavOpen(true)}
                aria-label={t('navOpenMenu')}
              >
                <Menu size={20} />
              </button>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-800 capitalize">
                {activeTab === 'leads'
                  ? 'CRM'
                  : activeTab === 'pdf_templates'
                    ? 'Plantillas PDF'
                    : activeTab === 'pdf_ledger'
                      ? 'Bitácora PDF'
                      : t(activeTab as any)}
              </h1>
            </div>
            <div className="flex items-center gap-2 sm:gap-4 flex-wrap justify-end">
              <NotificationCenter />
              <div className="relative w-full sm:w-auto">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input 
                  type="text" 
                  placeholder={t('searchPlaceholder')} 
                  className="w-full sm:w-72 pl-10 pr-4 py-2 border rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            {activeTab === 'users' && (
              <button 
                onClick={() => setShowAddUser(true)}
                className="bg-primary text-white px-3 py-2 rounded-lg flex items-center gap-2 hover:bg-opacity-90 transition-colors text-sm"
              >
                <UserPlus size={18} />
                <span className="hidden sm:inline">Nuevo Usuario</span>
              </button>
            )}


            {activeTab === 'properties' && (
              <button 
                onClick={() => setShowAddProperty(true)}
                className="bg-primary text-white px-3 py-2 rounded-lg flex items-center gap-2 hover:bg-opacity-90 transition-colors text-sm"
              >
                <Plus size={18} />
                <span className="hidden sm:inline">{t('newProperty')}</span>
              </button>
            )}
            
            {/* Mobile Logout Button (Visible only on small screens) */}
            <button 
              onClick={onLogout}
              className="md:hidden p-2 text-gray-500 hover:text-red-600 rounded-full hover:bg-gray-100"
              title={t('logout')}
            >
              <LogOut size={20} />
            </button>
            </div>
          </div>
        </header>

        <div className="p-4 sm:p-6 lg:p-8">
          {/* OVERVIEW TAB (Super Admin & Admin) */}
          {activeTab === 'overview' && (currentUserProfile?.role === 'super_admin' || currentUserProfile?.role === 'admin') && (
            <div className="space-y-8">
              {loadingOverview ? (
                <div className="p-12 flex justify-center">
                   <Loader2 className="animate-spin text-primary" size={32} />
                </div>
              ) : (
                <>
                  {/* Stats Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                      <div className="flex items-center gap-4">
                        <div className="bg-blue-100 p-3 rounded-lg text-blue-600">
                          <Home size={24} />
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">Propiedades Totales</p>
                          <h3 className="text-2xl font-bold text-gray-900">{globalStats.totalProperties}</h3>
                        </div>
                      </div>
                    </div>
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                      <div className="flex items-center gap-4">
                        <div className="bg-purple-100 p-3 rounded-lg text-purple-600">
                          <Users size={24} />
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">Usuarios / Leads</p>
                          <h3 className="text-2xl font-bold text-gray-900">{globalStats.totalUsers} / {globalStats.totalLeads}</h3>
                        </div>
                      </div>
                    </div>
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                      <div className="flex items-center gap-4">
                        <div className="bg-orange-100 p-3 rounded-lg text-orange-600">
                          <Wrench size={24} />
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">Cuestiones Pendientes</p>
                          <h3 className="text-2xl font-bold text-gray-900">{globalStats.totalIssues}</h3>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Financial Overview Section */}
                  <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <h3 className="font-bold text-lg text-gray-800 mb-4 flex items-center gap-2">
                      <DollarSign className="text-green-600" />
                      Resumen Financiero del Periodo ({kpiMonth})
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="p-4 bg-green-50 rounded-lg border border-green-100">
                        <p className="text-sm text-green-700 font-medium mb-1">Ingresos Estimados (Fees)</p>
                        <h4 className="text-2xl font-bold text-green-800">
                          {formatCurrency(propertyKpis.reduce((sum, p) => sum + (Number(p.monthly_fee) || 0), 0))}
                        </h4>
                      </div>
                      <div className="p-4 bg-red-50 rounded-lg border border-red-100">
                        <p className="text-sm text-red-700 font-medium mb-1">Gastos Operativos (Bitácora)</p>
                        <h4 className="text-2xl font-bold text-red-800">
                          {formatCurrency(propertyKpis.reduce((sum, p) => sum + (Number(p.logs_cost) || 0), 0))}
                        </h4>
                      </div>
                      <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
                        <p className="text-sm text-blue-700 font-medium mb-1">Balance Operativo</p>
                        <h4 className="text-2xl font-bold text-blue-800">
                          {formatCurrency(
                            propertyKpis.reduce((sum, p) => sum + (Number(p.monthly_fee) || 0), 0) - 
                            propertyKpis.reduce((sum, p) => sum + (Number(p.logs_cost) || 0), 0)
                          )}
                        </h4>
                      </div>
                    </div>

                    <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
                        <p className="text-sm text-blue-700 font-medium mb-1">Cobrado (Autopay)</p>
                        <h4 className="text-2xl font-bold text-blue-800">
                          {formatCurrency(paymentStats.collectedCents / 100)}
                        </h4>
                      </div>
                      <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
                        <p className="text-sm text-gray-700 font-medium mb-1">Intentos</p>
                        <h4 className="text-2xl font-bold text-gray-900">
                          {paymentStats.attemptsTotal}
                        </h4>
                      </div>
                      <div className="p-4 bg-red-50 rounded-lg border border-red-100">
                        <p className="text-sm text-red-700 font-medium mb-1">Fallidos</p>
                        <h4 className="text-2xl font-bold text-red-800">
                          {paymentStats.attemptsFailed}
                        </h4>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Admin Performance Table */}
                    <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                      <div className="p-6 border-b border-gray-100">
                        <h3 className="font-bold text-lg text-gray-800">Desempeño de Administradores</h3>
                        <p className="text-sm text-gray-500">Carga de trabajo y asignaciones por admin.</p>
                      </div>
                      <table className="w-full text-left">
                        <thead className="bg-gray-50 border-b border-gray-200">
                          <tr>
                            <th className="px-6 py-4 font-semibold text-gray-700">Admin</th>
                            <th className="px-6 py-4 font-semibold text-gray-700">Propiedades</th>
                            <th className="px-6 py-4 font-semibold text-gray-700">Leads</th>
                            <th className="px-6 py-4 font-semibold text-gray-700">Pendientes</th>
                            <th className="px-6 py-4 font-semibold text-gray-700">Estado</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {adminPerformance.map((admin) => (
                            <tr key={admin.id}>
                              <td className="px-6 py-4">
                                <div className="font-medium text-gray-900">{admin.name}</div>
                                <div className="text-xs text-gray-500">{admin.email}</div>
                              </td>
                              <td className="px-6 py-4">
                                <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs font-bold">
                                  {admin.assignedProperties} asignadas
                                </span>
                              </td>
                              <td className="px-6 py-4">
                                <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded-full text-xs font-bold">
                                  {admin.assignedLeads} leads
                                </span>
                              </td>
                              <td className="px-6 py-4">
                                <span className={`px-2 py-1 rounded-full text-xs font-bold ${admin.openIssues > 0 ? 'bg-orange-100 text-orange-800' : 'bg-gray-100 text-gray-600'}`}>
                                  {admin.openIssues} cuestiones
                                </span>
                              </td>
                              <td className="px-6 py-4">
                                <span className="text-green-600 text-xs font-bold">Activo</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Auto-Assignment Config */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 h-fit">
                      <h3 className="font-bold text-lg text-gray-800 mb-4 flex items-center gap-2">
                        <Settings size={20} className="text-gray-500" />
                        Configuración de Asignación
                      </h3>
                      
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Tiempo Límite (Horas)</label>
                          <p className="text-xs text-gray-500 mb-2">Tiempo antes de asignar automáticamente si no hay admin.</p>
                          <div className="relative">
                             <Clock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                             <input 
                                type="number"
                                min="1"
                                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary"
                                value={assignmentConfig.timeout_hours}
                                onChange={(e) => setAssignmentConfig({...assignmentConfig, timeout_hours: parseInt(e.target.value) || 24})}
                             />
                          </div>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Estrategia de Asignación</label>
                          <select 
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary"
                            value={assignmentConfig.strategy}
                            onChange={(e) => setAssignmentConfig({...assignmentConfig, strategy: e.target.value})}
                          >
                            <option value="load_balance">Balance de Cargas (Menos ocupado)</option>
                            <option value="random">Aleatorio / Rotativo Simple</option>
                          </select>
                        </div>

                        <div className="pt-4 space-y-3">
                          <button 
                            onClick={handleSaveConfig}
                            className="w-full py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 font-medium transition-colors flex items-center justify-center gap-2"
                          >
                            <Save size={16} />
                            Guardar Configuración
                          </button>
                          
                          <button 
                            onClick={handleRunAutoAssign}
                            className="w-full py-2 bg-primary/10 text-primary border border-primary/20 rounded-lg hover:bg-primary/20 font-medium transition-colors flex items-center justify-center gap-2"
                          >
                            <Zap size={16} />
                            Ejecutar Ahora
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="p-6 border-b border-gray-100 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <h3 className="font-bold text-lg text-gray-800">KPIs Operativos por Propiedad</h3>
                        <p className="text-sm text-gray-500">Bitácora, documentos y pendientes del periodo.</p>
                      </div>

                      <div className="flex flex-wrap gap-2 items-center">
                        <input
                          type="month"
                          value={kpiMonth}
                          onChange={(e) => setKpiMonth(e.target.value)}
                          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        />

                        <select
                          value={kpiAdminFilter}
                          onChange={(e) => setKpiAdminFilter(e.target.value)}
                          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        >
                          <option value="all">Todos los admins</option>
                          {overviewAdmins
                            .filter((a: any) => a.role === 'admin' || a.role === 'super_admin')
                            .map((a: any) => (
                              <option key={a.id} value={a.id}>
                                {a.name || a.email}
                              </option>
                            ))}
                        </select>

                        <button
                          onClick={handleExportKpisCsv}
                          className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 text-sm font-medium"
                        >
                          Exportar CSV
                        </button>
                      </div>
                    </div>

                    <div className="p-6">
                      <div className="flex flex-wrap gap-2 mb-4">
                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-700">
                          Propiedades: {propertyKpis.length}
                        </span>
                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-green-100 text-green-800">
                          Ocupadas: {propertyKpis.filter((p: any) => ['signed', 'active'].includes(String(p.contract_status || '').toLowerCase())).length}
                        </span>
                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-orange-100 text-orange-800">
                          Pendientes: {propertyKpis.reduce((sum: number, p: any) => sum + (Number(p.open_requests) || 0), 0)}
                        </span>
                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800">
                          Costo bitácora: {formatCurrency(propertyKpis.reduce((sum: number, p: any) => sum + (Number(p.logs_cost) || 0), 0))}
                        </span>
                      </div>

                      {loadingKpis ? (
                        <div className="py-12 flex justify-center">
                          <Loader2 className="animate-spin text-primary" size={32} />
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left">
                            <thead className="bg-gray-50 border border-gray-200">
                              <tr>
                                <th className="px-4 py-3 text-xs font-bold text-gray-600 uppercase">Propiedad</th>
                                <th className="px-4 py-3 text-xs font-bold text-gray-600 uppercase">Admin</th>
                                <th className="px-4 py-3 text-xs font-bold text-gray-600 uppercase">Contrato</th>
                                <th className="px-4 py-3 text-xs font-bold text-gray-600 uppercase">Fee</th>
                                <th className="px-4 py-3 text-xs font-bold text-gray-600 uppercase">Pendientes</th>
                                <th className="px-4 py-3 text-xs font-bold text-gray-600 uppercase">Bitácora</th>
                                <th className="px-4 py-3 text-xs font-bold text-gray-600 uppercase">Docs</th>
                                <th className="px-4 py-3 text-xs font-bold text-gray-600 uppercase">Reporte</th>
                                <th className="px-4 py-3 text-xs font-bold text-gray-600 uppercase">Último</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 border border-gray-200 border-t-0">
                              {propertyKpis.map((p: any) => {
                                const admin = overviewAdmins.find((a: any) => a.id === p.assigned_admin_id);
                                const contract = String(p.contract_status || '').toLowerCase();
                                const occupied = ['signed', 'active'].includes(contract);
                                const run = monthlyReportRunsByProperty[p.property_id];
                                const archived = Boolean(run?.archived_at);
                                const reportStatus = archived ? 'archivado' : String(run?.status || '');
                                const anomaliesCount = Array.isArray(run?.executive_summary?.anomalies) ? run.executive_summary.anomalies.length : 0;
                                const categories = run?.executive_summary?.categories && typeof run.executive_summary.categories === 'object'
                                  ? run.executive_summary.categories
                                  : null;
                                const topCategory = categories
                                  ? Object.entries(categories as Record<string, any>)
                                      .map(([k, v]) => ({ k, v: Number(v) || 0 }))
                                      .sort((a, b) => b.v - a.v)[0]
                                  : null;

                                return (
                                  <tr key={p.property_id} className="hover:bg-gray-50">
                                    <td className="px-4 py-3">
                                      <div className="font-medium text-gray-900">{p.title}</div>
                                      <div className="text-xs text-gray-500">{p.owner_email || '-'}</div>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-700">
                                      {admin?.name || admin?.email || (p.assigned_admin_id ? String(p.assigned_admin_id).slice(0, 8) : '-')}
                                    </td>
                                    <td className="px-4 py-3">
                                      <span className={`px-2 py-1 rounded-full text-xs font-bold ${occupied ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'}`}>
                                        {p.contract_status || 'pending'}
                                      </span>
                                    </td>
                                    <td className="px-4 py-3 text-sm font-bold text-gray-900">
                                      {formatCurrency(Number(p.monthly_fee) || 0)}
                                    </td>
                                    <td className="px-4 py-3">
                                      <span className={`px-2 py-1 rounded-full text-xs font-bold ${(Number(p.open_requests) || 0) > 0 ? 'bg-orange-100 text-orange-800' : 'bg-gray-100 text-gray-600'}`}>
                                        {Number(p.open_requests) || 0}
                                      </span>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-700">
                                      <div className="font-medium">{Number(p.logs_count) || 0} / {formatCurrency(Number(p.logs_cost) || 0)}</div>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-700">
                                      {Number(p.docs_count) || 0}
                                    </td>
                                    <td className="px-4 py-3 text-xs">
                                      {run ? (
                                        <div className="flex flex-col gap-1">
                                          <span className={`px-2 py-1 rounded-full text-[11px] font-bold w-fit ${
                                            archived ? 'bg-green-100 text-green-800' :
                                            reportStatus === 'success' ? 'bg-blue-100 text-blue-800' :
                                            reportStatus === 'failed' ? 'bg-red-100 text-red-800' :
                                            'bg-gray-100 text-gray-600'
                                          }`}>
                                            {archived ? 'Archivado' : reportStatus === 'success' ? 'Generado' : reportStatus === 'failed' ? 'Falló' : 'En curso'}
                                          </span>
                                          {anomaliesCount > 0 && (
                                            <span className="text-[11px] text-orange-700 font-bold">
                                              Alertas: {anomaliesCount}
                                            </span>
                                          )}
                                          {topCategory?.k ? (
                                            <span className="text-[11px] text-gray-600">
                                              Top: {String(topCategory.k)} ({formatCurrency(topCategory.v)})
                                            </span>
                                          ) : null}
                                        </div>
                                      ) : (
                                        <span className="text-gray-400">-</span>
                                      )}
                                    </td>
                                    <td className="px-4 py-3 text-xs text-gray-600">
                                      <div>{p.last_log_date ? new Date(p.last_log_date).toLocaleDateString('es-ES') : '-'}</div>
                                      <div>{p.last_doc_created_at ? new Date(p.last_doc_created_at).toLocaleDateString('es-ES') : '-'}</div>
                                    </td>
                                  </tr>
                                );
                              })}

                              {propertyKpis.length === 0 && (
                                <tr>
                                  <td colSpan={9} className="px-4 py-10 text-center text-gray-500">
                                    No hay datos para el periodo y filtro seleccionados.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* PROPERTIES TAB */}
          {activeTab === 'properties' && (
            filteredProperties.length > 0 ? (
              <div className="space-y-4">
                {(currentUserProfile?.role === 'super_admin' || currentUserProfile?.permissions?.can_edit_fees) && (
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="font-bold text-gray-900">Precios por Propiedad</div>
                      <div className="text-xs text-gray-500">
                        Selecciona propiedades para aplicar un precio mensual en lote (USD).
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 items-center">
                      <button
                        type="button"
                        onClick={() => setSelectedPropertyIds(filteredProperties.map((p: any) => p.id))}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
                      >
                        Seleccionar todo
                      </button>
                      <button
                        type="button"
                        onClick={clearSelectedProperties}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
                        disabled={selectedPropertyIds.length === 0}
                      >
                        Limpiar
                      </button>

                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-600">Seleccionadas:</span>
                        <span className="text-sm font-bold text-gray-900">{selectedPropertyIds.length}</span>
                      </div>

                      <div className="relative">
                        <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                        <input
                          type="number"
                          step="0.01"
                          className="w-40 pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm"
                          placeholder="0.00"
                          value={bulkMonthlyFee}
                          onChange={(e) => setBulkMonthlyFee(e.target.value)}
                        />
                      </div>

                      <button
                        type="button"
                        onClick={handleApplyBulkFee}
                        disabled={selectedPropertyIds.length === 0 || applyingBulkFee}
                        className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 text-sm font-medium disabled:opacity-50"
                      >
                        {applyingBulkFee ? 'Aplicando...' : 'Aplicar precio'}
                      </button>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredProperties.map(prop => (
                    <div key={prop.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
                      <div className="h-40 bg-gray-200 relative">
                        <img 
                          src={`https://coreva-normal.trae.ai/api/ide/v1/text_to_image?prompt=Luxury%20home%20${prop.title}&image_size=landscape_16_9`}
                          alt={prop.title}
                          className="w-full h-full object-cover"
                        />

                        {(currentUserProfile?.role === 'super_admin' || currentUserProfile?.permissions?.can_edit_fees) && (
                          <button
                            type="button"
                            onClick={() => toggleSelectedProperty(prop.id)}
                            className={`absolute top-2 left-2 w-9 h-9 rounded-lg flex items-center justify-center border transition-colors ${
                              selectedPropertyIds.includes(prop.id)
                                ? 'bg-primary text-white border-primary'
                                : 'bg-white/90 text-gray-700 border-gray-200 hover:bg-white'
                            }`}
                            title="Seleccionar para actualización masiva"
                          >
                            <Check size={18} />
                          </button>
                        )}

                        <div className={`absolute top-2 right-2 px-2 py-1 rounded text-xs font-bold uppercase ${prop.status === 'active' ? 'bg-green-500 text-white' : 'bg-orange-500 text-white'}`}>
                          {prop.status}
                        </div>
                      </div>
                      <div className="p-5">
                        <h3 className="font-bold text-lg text-gray-900">{prop.title}</h3>
                        <p className="text-sm text-gray-500 flex items-center gap-1 mt-1">
                          <Users size={14} />
                          {prop.owner}
                        </p>
                        <p className="text-sm text-gray-500 mt-2">{prop.address}</p>

                        <div className="mt-3 flex justify-between items-center bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                          <span className="text-xs text-gray-600 font-bold uppercase">Precio mensual</span>
                          <span className="text-sm font-bold text-gray-900">{formatCurrency(Number(prop.monthly_fee) || 0)}</span>
                        </div>

                        {(prop as any).services && (
                           <div className="flex flex-wrap gap-1 mt-3">
                             {Object.entries((prop as any).services).map(([key, value]) => (
                               value && (
                                 <span key={key} className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px] uppercase font-bold border border-gray-200">
                                   {key === 'hvac' ? `❄️ ${t('hvac')}` : 
                                    key === 'pool' ? `🏊 ${t('pool')}` :
                                    key === 'gardening' ? `🌿 ${t('gardening')}` :
                                    key === 'pestControl' ? `🐛 ${t('pestControl')}` :
                                    key === 'cleaning' ? `🧹 ${t('cleaning')}` : `🛎️ ${t('concierge')}`}
                                 </span>
                               )
                             ))}
                           </div>
                        )}
                        
                        <div className="mt-4 flex gap-2">
                          <button 
                            onClick={() => handleEditClick(prop)}
                            className="flex-1 bg-gray-50 text-gray-700 py-2 rounded border border-gray-200 text-sm hover:bg-gray-100"
                          >
                            {t('edit')}
                          </button>
                          <button 
                            onClick={() => setManagingProp(prop)}
                            className="flex-1 bg-primary/10 text-primary py-2 rounded border border-primary/20 text-sm hover:bg-primary/20 flex items-center justify-center gap-1"
                          >
                            <Settings size={14} />
                            {t('manage')}
                          </button>
                          {currentUserProfile?.role === 'super_admin' && (
                            <button
                              type="button"
                              onClick={() => openDeletePropertyModal(prop)}
                              className="w-10 bg-red-50 text-red-600 py-2 rounded border border-red-200 hover:bg-red-100 flex items-center justify-center"
                              title="Eliminar propiedad"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-12 text-center text-gray-500">
                <Home className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p>{searchQuery ? `No se encontraron propiedades que coincidan con "${searchQuery}"` : "No hay propiedades registradas."}</p>
              </div>
            )
          )}

          {/* USERS TAB */}
          {activeTab === 'users' && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              {loadingUsers ? (
                <div className="p-12 flex justify-center">
                  <Loader2 className="animate-spin text-primary" size={32} />
                </div>
              ) : (
                <table className="w-full text-left">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-4 font-semibold text-gray-700">Nombre</th>
                      <th className="px-6 py-4 font-semibold text-gray-700">Email</th>
                      <th className="px-6 py-4 font-semibold text-gray-700">Rol</th>
                      <th className="px-6 py-4 font-semibold text-gray-700">Estado</th>
                      <th className="px-6 py-4 font-semibold text-gray-700">Teléfono</th>
                      <th className="px-6 py-4 font-semibold text-gray-700">Registrado</th>
                      <th className="px-6 py-4 font-semibold text-gray-700">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredUsers.length > 0 ? (
                      filteredUsers.map(u => (
                        <tr key={u.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 font-medium text-gray-900">{u.name}</td>
                          <td className="px-6 py-4 text-gray-500">{u.email}</td>
                          <td className="px-6 py-4">
                            <span className={`px-2 py-1 rounded-full text-xs font-bold uppercase ${
                              u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                            }`}>
                              {u.role}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            {(u.role === 'owner' || u.role === 'contractor') ? (
                              <span className={`px-2 py-1 rounded-full text-xs font-bold uppercase ${
                                String(u.access_status || '').toLowerCase() === 'approved' ? 'bg-green-100 text-green-800' :
                                String(u.access_status || '').toLowerCase() === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                String(u.access_status || '').toLowerCase() === 'revoked' ? 'bg-red-100 text-red-700' :
                                String(u.access_status || '').toLowerCase() === 'rejected' ? 'bg-gray-200 text-gray-700' :
                                'bg-gray-100 text-gray-600'
                              }`}>
                                {u.access_status || '—'}
                              </span>
                            ) : (
                              <span className="text-gray-400 text-sm">—</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-gray-500 text-sm">{u.phone || '-'}</td>
                          <td className="px-6 py-4 text-gray-500 text-sm">
                            {new Date(u.created_at).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4 flex items-center gap-2">
                            <button 
                              onClick={() => handleEditUserClick(u)}
                              className="text-gray-400 hover:text-primary flex items-center gap-1"
                              title="Editar"
                            >
                              <Settings size={14} /> Editar
                            </button>
                            <button 
                              onClick={() => handleDeactivateUser(u)}
                              disabled={String(u.access_status || '').toLowerCase() === 'revoked'}
                              className="text-gray-400 hover:text-red-600 flex items-center gap-1 disabled:opacity-50 disabled:hover:text-gray-400"
                              title={String(u.access_status || '').toLowerCase() === 'revoked' ? 'Usuario dado de baja' : 'Dar de baja'}
                            >
                              <UserX size={14} /> Dar de baja
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                          {searchQuery ? `No se encontraron usuarios que coincidan con "${searchQuery}"` : "No hay usuarios registrados. Agrega uno nuevo para comenzar."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          )}
          {/* LEADS CRM TAB */}
          {activeTab === 'leads' && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="p-6 border-b border-gray-100">
                <h3 className="font-bold text-lg text-gray-800">Leads & Contactos</h3>
                <p className="text-sm text-gray-500">Gestión de prospectos interesados en servicios.</p>
              </div>
              
              {loadingLeads ? (
                <div className="p-12 flex justify-center">
                  <Loader2 className="animate-spin text-primary" size={32} />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  {filteredLeads.length > 0 ? (
                    <table className="w-full text-left">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="px-6 py-4 font-semibold text-gray-700">Nombre</th>
                          <th className="px-6 py-4 font-semibold text-gray-700">Contacto</th>
                          <th className="px-6 py-4 font-semibold text-gray-700">Origen</th>
                          <th className="px-6 py-4 font-semibold text-gray-700">Mensaje</th>
                          <th className="px-6 py-4 font-semibold text-gray-700">Estado</th>
                          <th className="px-6 py-4 font-semibold text-gray-700">Asignado A</th>
                          <th className="px-6 py-4 font-semibold text-gray-700">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {filteredLeads.map((lead: any) => (
                          <tr key={lead.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 font-medium text-gray-900">{lead.name}</td>
                            <td className="px-6 py-4 text-sm">
                              <div className="text-gray-900">{lead.email}</div>
                              {lead.phone ? (
                                <button 
                                  onClick={() => handlePhoneClick(lead)}
                                  className="text-blue-600 hover:text-blue-800 flex items-center gap-1 font-medium hover:underline mt-1"
                                >
                                  <Phone size={14} />
                                  {lead.phone}
                                </button>
                              ) : (
                                <span className="text-gray-400 text-xs italic">Sin teléfono</span>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              <span className={`px-2 py-1 rounded text-xs uppercase font-bold ${
                                lead.source === 'evaluation' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                              }`}>
                                {lead.source === 'evaluation' ? 'Evaluación' : 'Contacto'}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-600 max-w-xs truncate" title={lead.message}>
                              {lead.message}
                            </td>
                            <td className="px-6 py-4">
                              <select
                                className={`text-xs font-bold uppercase rounded px-2 py-1 border-0 cursor-pointer ${
                                  lead.status === 'new' ? 'bg-blue-100 text-blue-800' :
                                  lead.status === 'contacted' ? 'bg-yellow-100 text-yellow-800' :
                                  lead.status === 'qualified' ? 'bg-purple-100 text-purple-800' :
                                  lead.status === 'negotiation' ? 'bg-orange-100 text-orange-800' :
                                  lead.status === 'contract_sent' ? 'bg-teal-100 text-teal-800' :
                                  lead.status === 'platform_onboarding' ? 'bg-indigo-100 text-indigo-800' :
                                  lead.status === 'converted' ? 'bg-green-100 text-green-800' :
                                  'bg-gray-100 text-gray-800'
                                }`}
                                value={lead.status}
                                onChange={(e) => updateLeadStatus(lead.id, e.target.value)}
                              >
                                <option value="new">Nuevo</option>
                                <option value="contacted">Contactado</option>
                                <option value="qualified">Cualificado / Interesado</option>
                                <option value="negotiation">Negociación / Cotización</option>
                                <option value="contract_sent">Contrato Enviado</option>
                                <option value="platform_onboarding">Onboarding Plataforma</option>
                                <option value="converted">Vendido / Cerrado</option>
                                <option value="lost">Perdido</option>
                              </select>
                            </td>
                            <td className="px-6 py-4">
                               <select
                                  className="text-xs border-gray-300 rounded px-2 py-1 max-w-[150px] disabled:bg-gray-100 disabled:text-gray-400"
                                  value={lead.assigned_to || ''}
                                  onChange={(e) => updateLeadAssignment(lead.id, e.target.value)}
                                  disabled={
                                    currentUserProfile?.role !== 'super_admin' && 
                                    !currentUserProfile?.permissions?.can_assign_leads
                                  }
                               >
                                  <option value="">Sin Asignar</option>
                                  {dbUsers.filter((u: any) => u.role === 'admin' || u.role === 'agent' || u.role === 'super_admin').map((u: any) => (
                                    <option key={u.id} value={u.id}>{u.name}</option>
                                  ))}
                                  {/* Fallback to show all users if no admins/agents defined yet */}
                                  {dbUsers.length > 0 && dbUsers.every(u => u.role !== 'admin' && u.role !== 'agent' && u.role !== 'super_admin') && dbUsers.map((u: any) => (
                                     <option key={u.id} value={u.id}>{u.name}</option>
                                  ))}
                               </select>
                            </td>
                            <td className="px-6 py-4">
                              {/* Chat button removed */}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="p-12 text-center text-gray-500">
                      <Users className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                      <p>{searchQuery ? `No se encontraron leads que coincidan con "${searchQuery}"` : "No hay leads registrados todavía."}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* CONTRACTORS TAB */}
          {activeTab === 'contractors' && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              {loadingContractors ? (
                <div className="p-12 flex justify-center">
                  <Loader2 className="animate-spin text-primary" size={32} />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  {dbContractors.length > 0 ? (
                    <table className="w-full text-left">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="px-6 py-4 font-semibold text-gray-700">Nombre</th>
                          <th className="px-6 py-4 font-semibold text-gray-700">Empresa</th>
                          <th className="px-6 py-4 font-semibold text-gray-700">Contacto</th>
                          <th className="px-6 py-4 font-semibold text-gray-700">Estatus</th>
                          <th className="px-6 py-4 font-semibold text-gray-700">Fecha</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {dbContractors.map((app: any) => (
                          <tr key={app.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 font-medium text-gray-900">{app.full_name}</td>
                            <td className="px-6 py-4 text-sm">
                              <div className="text-gray-900">{app.company_name || '-'}</div>
                            </td>
                            <td className="px-6 py-4 text-sm">
                              {app.phone && <div className="text-gray-900">{app.phone}</div>}
                              {app.whatsapp_phone && <div className="text-gray-500">WhatsApp: {app.whatsapp_phone}</div>}
                              {app.email && <div className="text-gray-500">{app.email}</div>}
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <select
                                  value={app.status || 'submitted'}
                                  onChange={(e) => updateContractorStatus(app.id, e.target.value)}
                                  disabled={updatingContractorId === app.id}
                                  className="text-xs border border-gray-300 rounded px-2 py-1 bg-white disabled:bg-gray-100 disabled:text-gray-400"
                                >
                                  <option value="submitted">Recibido</option>
                                  <option value="reviewing">En evaluación</option>
                                  <option value="approved">Aprobado</option>
                                  <option value="rejected">Rechazado</option>
                                </select>
                                {String(app.status || '') === 'approved' && (
                                  <button
                                    type="button"
                                    onClick={() => updateContractorStatus(app.id, 'approved', { forceNotify: true })}
                                    disabled={updatingContractorId === app.id}
                                    className="text-xs px-2 py-1 rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400"
                                  >
                                    Reenviar invitación
                                  </button>
                                )}
                                {updatingContractorId === app.id && (
                                  <Loader2 className="animate-spin text-gray-400" size={14} />
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-500">
                              {new Date(app.created_at).toLocaleDateString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="p-12 text-center text-gray-500">
                      <Briefcase className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                      <p>No hay postulaciones de contratistas todavía.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* REQUESTS TAB */}
          {activeTab === 'requests' &&
            (() => {
              const scopedProperties =
                currentUserProfile?.role === 'super_admin'
                  ? properties
                  : properties.filter((p: any) => p.assigned_admin_id === currentUserProfile?.id);
              const propById = new Map<string, any>(scopedProperties.map((p: any) => [String(p.id), p]));
              const totalPages = Math.max(1, Math.ceil(requestTotal / 10));
              const clampedPage = Math.min(requestPage, totalPages);

              return (
                <div className="space-y-4">
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="text-lg font-bold text-gray-900">{t('requestsTab')}</h3>
                      <p className="text-sm text-gray-500">{t('requestsTabSubtitle')}</p>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <select
                        value={requestPropertyFilter}
                        onChange={(e) => {
                          setRequestPage(1);
                          setRequestPropertyFilter(e.target.value);
                        }}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                      >
                        <option value="all">{t('filterAll')}</option>
                        {scopedProperties.map((p: any) => (
                          <option key={p.id} value={p.id}>
                            {p.title}
                          </option>
                        ))}
                      </select>
                      <select
                        value={requestStatusFilter}
                        onChange={(e) => {
                          setRequestPage(1);
                          setRequestStatusFilter(e.target.value);
                        }}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                      >
                        <option value="all">{t('filterAll')}</option>
                        <option value="pending">{t('statusPending')}</option>
                        <option value="in_review">{t('statusInReview')}</option>
                        <option value="assigned">{t('statusAssigned')}</option>
                        <option value="in_progress">{t('statusInProgress')}</option>
                        <option value="completed">{t('statusCompleted')}</option>
                        <option value="cancelled">{t('statusCancelled')}</option>
                      </select>
                      <input
                        type="date"
                        value={requestFrom}
                        onChange={(e) => {
                          setRequestPage(1);
                          setRequestFrom(e.target.value);
                        }}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                      />
                      <input
                        type="date"
                        value={requestTo}
                        onChange={(e) => {
                          setRequestPage(1);
                          setRequestTo(e.target.value);
                        }}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                      />
                    </div>
                  </div>

                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    {loadingRequests ? (
                      <div className="p-12 flex justify-center">
                        <Loader2 className="animate-spin text-primary" size={32} />
                      </div>
                    ) : dbRequests.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left">
                          <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                              <th className="px-6 py-4 font-semibold text-gray-700">{t('property')}</th>
                              <th className="px-6 py-4 font-semibold text-gray-700">{t('servicesLabel')}</th>
                              <th className="px-6 py-4 font-semibold text-gray-700">{t('priority')}</th>
                              <th className="px-6 py-4 font-semibold text-gray-700">{t('status')}</th>
                              <th className="px-6 py-4 font-semibold text-gray-700">{t('date')}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {dbRequests.map((r: any) => {
                              const p = propById.get(String(r.property_id));
                              const services = Array.isArray(r.services) ? r.services : [];
                              return (
                                <tr key={r.id} className="hover:bg-gray-50">
                                  <td className="px-6 py-4 text-sm">
                                    <div className="font-medium text-gray-900">{p?.title || String(r.property_id).slice(0, 8)}</div>
                                    <div className="text-xs text-gray-500 truncate max-w-xs">{r.description}</div>
                                  </td>
                                  <td className="px-6 py-4 text-sm text-gray-700 max-w-xs truncate" title={services.join(', ')}>
                                    {services.join(', ') || '-'}
                                  </td>
                                  <td className="px-6 py-4 text-sm text-gray-700">
                                    {r.priority === 'low'
                                      ? t('urgencyLow')
                                      : r.priority === 'medium'
                                        ? t('urgencyMedium')
                                        : r.priority === 'high'
                                          ? t('urgencyHigh')
                                          : t('urgencyUrgent')}
                                  </td>
                                  <td className="px-6 py-4">
                                    <div className="flex items-center gap-2">
                                      <select
                                        value={r.status || 'pending'}
                                        onChange={(e) => updateRequestStatus(r.id, e.target.value)}
                                        disabled={updatingRequestId === r.id}
                                        className="text-xs border border-gray-300 rounded px-2 py-1 bg-white disabled:bg-gray-100 disabled:text-gray-400"
                                      >
                                        <option value="pending">{t('statusPending')}</option>
                                        <option value="in_review">{t('statusInReview')}</option>
                                        <option value="assigned">{t('statusAssigned')}</option>
                                        <option value="in_progress">{t('statusInProgress')}</option>
                                        <option value="completed">{t('statusCompleted')}</option>
                                        <option value="cancelled">{t('statusCancelled')}</option>
                                      </select>
                                      {updatingRequestId === r.id && (
                                        <Loader2 className="animate-spin text-gray-400" size={14} />
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-6 py-4 text-sm text-gray-500">
                                    {r.created_at ? new Date(r.created_at).toLocaleDateString() : '-'}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="p-12 text-center text-gray-500">
                        <Wrench className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                        <p>{t('requestsEmpty')}</p>
                      </div>
                    )}
                  </div>

                  {requestTotal > 10 && (
                    <div className="flex items-center justify-center gap-3">
                      <button
                        type="button"
                        onClick={() => setRequestPage((p) => Math.max(1, p - 1))}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white hover:bg-gray-50"
                        disabled={clampedPage <= 1}
                      >
                        {t('prev')}
                      </button>
                      <span className="text-sm text-gray-600">
                        {t('page')} {clampedPage} {t('of')} {totalPages}
                      </span>
                      <button
                        type="button"
                        onClick={() => setRequestPage((p) => Math.min(totalPages, p + 1))}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white hover:bg-gray-50"
                        disabled={clampedPage >= totalPages}
                      >
                        {t('next')}
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}

          {/* DOCUMENTS TAB */}
          {activeTab === 'documents' && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <Suspense
                fallback={
                  <div className="flex items-center justify-center p-12 text-gray-500">
                    <Loader2 className="animate-spin" />
                  </div>
                }
              >
                <LazyDocumentManager isAdmin={true} />
              </Suspense>
            </div>
          )}

          {/* PDF TEMPLATES TAB */}
          {activeTab === 'pdf_templates' && (
            <Suspense
              fallback={
                <div className="flex items-center justify-center p-12 text-gray-500">
                  <Loader2 className="animate-spin" />
                </div>
              }
            >
              <LazyReportPdfTemplates />
            </Suspense>
          )}

          {/* PDF LEDGER TAB */}
          {activeTab === 'pdf_ledger' && (
            <Suspense
              fallback={
                <div className="flex items-center justify-center p-12 text-gray-500">
                  <Loader2 className="animate-spin" />
                </div>
              }
            >
              <LazyMonthlyCostLedger properties={properties} />
            </Suspense>
          )}

          {/* SETTINGS TAB */}
          {activeTab === 'settings' && (
            <Suspense
              fallback={
                <div className="flex items-center justify-center p-12 text-gray-500">
                  <Loader2 className="animate-spin" />
                </div>
              }
            >
              <LazyAdminSettings />
            </Suspense>
          )}
        </div>
      </main>

      {/* Chat Modal Removed */}


      {/* Call Log Modal */}
      {showCallLogModal && callingLead && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-blue-50">
              <div className="flex items-center gap-3">
                <div className="bg-blue-100 p-2 rounded-full text-blue-600">
                  <PhoneCall size={24} />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-gray-900">Registrar Llamada</h3>
                  <p className="text-sm text-gray-500">Cliente: {callingLead.name}</p>
                </div>
              </div>
              <button onClick={() => setShowCallLogModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>
            
            <form onSubmit={handleSaveCallLog} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Resultado de la Llamada</label>
                <select 
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  value={callOutcome}
                  onChange={e => setCallOutcome(e.target.value)}
                >
                  <optgroup label="Positivo / Avance">
                    <option value="interested">Interesado</option>
                    <option value="more_info">Necesita más info</option>
                    <option value="quote_sent">Enviar Cotización</option>
                    <option value="contract_sent">Envío de Contrato</option>
                    <option value="platform_onboarding">Cargar a Plataforma</option>
                    <option value="sold">Vendido / Cerrado</option>
                  </optgroup>
                  <optgroup label="Sin Éxito / Seguimiento">
                    <option value="no_answer">No contestó</option>
                    <option value="voicemail">Buzón de voz</option>
                    <option value="wrong_number">Número equivocado</option>
                    <option value="not_interested">No interesado</option>
                  </optgroup>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Duración (minutos)</label>
                <div className="relative">
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                  <input 
                    type="number" 
                    min="0"
                    className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    value={callDuration}
                    onChange={e => setCallDuration(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notas de la Conversación</label>
                <textarea 
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent h-24 resize-none"
                  placeholder="Detalles importantes, objeciones, próximos pasos..."
                  value={callNotes}
                  onChange={e => setCallNotes(e.target.value)}
                />
              </div>

              <div className="pt-2">
                <button 
                  type="submit"
                  className="w-full py-3 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition-colors shadow-lg flex items-center justify-center gap-2"
                >
                  <Save size={18} />
                  Guardar Registro y Actualizar Estado
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manage Property Modal (Photos & Reports) */}
      {managingProp && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <div>
                <h3 className="font-bold text-lg text-gray-900">Gestión de Propiedad: {managingProp.title}</h3>
                <p className="text-sm text-gray-500">{managingProp.address}</p>
                <div className="mt-3 inline-flex rounded-lg border border-gray-200 bg-white overflow-hidden">
                  <button
                    onClick={() => setManagePropertyTab('operacion')}
                    className={
                      managePropertyTab === 'operacion'
                        ? 'px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white'
                        : 'px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50'
                    }
                  >
                    Operación
                  </button>
                  <button
                    onClick={() => setManagePropertyTab('cobros')}
                    className={
                      managePropertyTab === 'cobros'
                        ? 'px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white'
                        : 'px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50'
                    }
                  >
                    Cobros
                  </button>
                </div>
              </div>
              <button onClick={handleCloseManageModal} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>

            <div className="flex-1 overflow-auto p-6 bg-gray-50">
              {managePropertyTab === 'cobros' ? (
                <Suspense
                  fallback={
                    <div className="flex items-center justify-center p-12 text-gray-500">
                      <Loader2 className="animate-spin" />
                    </div>
                  }
                >
                  <LazyPropertyBillingTab property={managingProp} />
                </Suspense>
              ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-full">
                


                {/* LEFT COLUMN: PHOTOS & GALLERY */}
                <div className="space-y-6">
                  <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                     <h4 className="font-bold text-gray-800 flex items-center gap-2 mb-4">
                      <Archive className="text-gray-600" />
                      Historial de Documentos
                    </h4>
                    {managingProp.documents && managingProp.documents.length > 0 ? (
                      <div className="space-y-2 max-h-40 overflow-y-auto">
                        {managingProp.documents.map((doc: any) => (
                          <div key={doc.id} className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm hover:bg-gray-100 transition-colors">
                            <div className="flex items-center gap-2 overflow-hidden">
                              <FileCheck size={16} className="text-green-600 flex-shrink-0" />
                              <div className="truncate">
                                <p className="font-medium text-gray-900 truncate">{doc.name}</p>
                                <p className="text-xs text-gray-500">{new Date(doc.date).toLocaleDateString()}</p>
                              </div>
                            </div>
                            <a 
                              href={doc.url} 
                              download={`${doc.name}.pdf`}
                              className="text-blue-600 hover:text-blue-800 p-1"
                              title="Descargar"
                            >
                              <Download size={14} />
                            </a>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400 text-center py-4">No hay documentos archivados.</p>
                    )}
                  </div>

                  {/* BITACORA MENSUAL */}
                  <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <h4 className="font-bold text-gray-800 flex items-center gap-2 mb-4">
                      <Clock className="text-orange-500" />
                      Bitácora de Mantenimiento y Gastos
                    </h4>
                    
                    {/* Add New Note Form */}
                    <form onSubmit={handleSaveLog} className="mb-4 bg-gray-50 p-3 rounded-lg border border-gray-200">
                      <textarea
                        className="w-full text-sm p-2 border border-gray-300 rounded mb-2"
                        placeholder="Describe el suceso..."
                        rows={2}
                        value={newLog.content}
                        onChange={e => setNewLog({...newLog, content: e.target.value})}
                        required
                      />
                      <div className="flex gap-2 mb-2">
                        <div className="relative flex-1">
                          <DollarSign size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400"/>
                          <input
                            type="number"
                            placeholder="Costo (Opcional)"
                            className="w-full pl-6 py-1 text-sm border border-gray-300 rounded"
                            value={newLog.cost}
                            onChange={e => setNewLog({...newLog, cost: e.target.value})}
                          />
                        </div>
                        <label className="cursor-pointer bg-white border border-gray-300 px-3 py-1 rounded text-sm flex items-center gap-1 hover:bg-gray-100">
                          <ImageIcon size={14} />
                          <input type="file" multiple accept="image/*" className="hidden" onChange={handleLogImageSelect} />
                          {newLog.images.length > 0 ? `${newLog.images.length}` : '+'}
                        </label>
                      </div>
                      <button 
                        type="submit" 
                        disabled={!newLog.content}
                        className="w-full bg-orange-500 text-white text-xs font-bold py-1.5 rounded hover:bg-orange-600 disabled:opacity-50"
                      >
                        Agregar Nota
                      </button>
                    </form>

                    {/* Log List */}
                    <div className="space-y-3 max-h-60 overflow-y-auto">
                      {loadingLogs ? (
                        <div className="text-center py-4"><Loader2 className="animate-spin mx-auto text-gray-400"/></div>
                      ) : maintenanceLogs.length > 0 ? (
                        maintenanceLogs.map(log => (
                          <div key={log.id} className="border-l-2 border-orange-300 pl-3 py-1">
                            <div className="flex justify-between items-start">
                              <p className="text-xs text-gray-500">{new Date(log.created_at).toLocaleDateString()} {new Date(log.created_at).toLocaleTimeString()}</p>
                              {log.cost > 0 && <span className="text-xs font-bold text-red-600">-${log.cost}</span>}
                            </div>
                            <p className="text-sm text-gray-800 mt-1">{log.content}</p>
                            {log.images && log.images.length > 0 && (
                              <div className="flex gap-1 mt-2 overflow-x-auto">
                                {log.images.map((img: string, i: number) => (
                                  <a key={i} href={img} target="_blank" rel="noopener noreferrer">
                                    <img src={img} alt="evidencia" className="w-8 h-8 object-cover rounded border border-gray-200 hover:scale-110 transition-transform"/>
                                  </a>
                                ))}
                              </div>
                            )}
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-gray-400 text-center">No hay notas registradas este mes.</p>
                      )}
                    </div>
                  </div>

                  <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <h4 className="font-bold text-gray-800 flex items-center gap-2 mb-4">
                      <FileText className="text-purple-600" />
                      Documentos del Periodo
                    </h4>

                    {loadingPropertyDocs ? (
                      <div className="text-center py-4">
                        <Loader2 className="animate-spin mx-auto text-gray-400" />
                      </div>
                    ) : propertyDocs.length > 0 ? (
                      <ul className="text-sm text-gray-700 space-y-2 max-h-60 overflow-y-auto">
                        {propertyDocs.map((d: any) => (
                          <li key={d.id} className="flex items-center justify-between gap-3 p-2 bg-gray-50 rounded">
                            <div className="flex items-center gap-2 min-w-0">
                              <FileText size={14} className="text-gray-500" />
                              <span className="truncate">{d.name}</span>
                            </div>
                            <span className="text-xs text-gray-500 whitespace-nowrap">
                              {d.created_at ? new Date(d.created_at).toLocaleDateString('es-ES') : ''}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-gray-400 text-center py-4">No hay documentos nuevos este mes.</p>
                    )}
                  </div>
                </div>

                {/* RIGHT COLUMN: AI REPORT GENERATOR */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col h-full">
                   <h4 className="font-bold text-gray-800 flex items-center gap-2 mb-4">
                      <FileText className="text-purple-600" />
                      Generador de Reporte IA
                    </h4>
                    
                    {!generatedPdf ? (
                      <div className="flex-1 flex flex-col space-y-4">
                        <div className="bg-blue-50 p-4 rounded-lg text-sm text-blue-800 border border-blue-100">
                          <p>
                            <strong>Instrucciones:</strong> Describe los incidentes/eventos del mes, adjunta evidencias e ingresa costos.
                            La IA generará el PDF oficial con este contexto, la bitácora y documentos.
                          </p>
                        </div>

                        <div className="flex-1 overflow-y-auto">
                          <Suspense
                            fallback={
                              <div className="flex items-center justify-center p-12 text-gray-500">
                                <Loader2 className="animate-spin" />
                              </div>
                            }
                          >
                            <LazyManualIncidentReportBuilder
                              propertyId={String(managingProp?.id || '')}
                              disabled={generatingReport || sendingEmail}
                              onChange={(ctx, valid) => {
                                setManualReportContext(ctx);
                                setManualReportValid(valid);
                              }}
                            />
                          </Suspense>
                        </div>

                        <button 
                          onClick={handleGenerateReport}
                          disabled={generatingReport || !manualReportValid}
                          className="w-full py-4 bg-purple-600 text-white rounded-lg font-bold hover:bg-purple-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                          {generatingReport ? (
                            <>
                              <Loader2 className="animate-spin" />
                              Generando Reporte con IA...
                            </>
                          ) : (
                            <>
                              <FileText />
                              Generar Reporte Mensual
                            </>
                          )}
                        </button>
                      </div>
                    ) : (
                      <div className="flex-1 flex flex-col items-center justify-center space-y-6 animate-in fade-in zoom-in h-full">
                        <div className="w-full flex-1 bg-gray-100 rounded-lg border border-gray-200 overflow-hidden relative">
                           {/* PDF PREVIEW IFRAME */}
                           <iframe
                             src={generatedPdfUrl || (generatedPdf ? `data:application/pdf;base64,${generatedPdf}` : '')}
                             className="w-full h-full"
                             title="PDF Preview"
                           />
                           <div className="absolute top-2 right-2 flex gap-2">
                             <a 
                               href={generatedPdfUrl || (generatedPdf ? `data:application/pdf;base64,${generatedPdf}` : '')}
                               download="reporte_mensual.pdf"
                               className="bg-white/90 p-2 rounded-full shadow hover:bg-white text-gray-700"
                               title="Descargar"
                             >
                               <Download size={18} />
                             </a>
                           </div>
                        </div>

                        <div className="w-full space-y-3">
                          <button 
                            onClick={handleSendReport}
                            disabled={sendingEmail}
                            className="w-full py-3 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 transition-colors shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"
                          >
                            {sendingEmail ? (
                              <>
                                <Loader2 className="animate-spin" />
                                Enviando...
                              </>
                            ) : (
                              <>
                                <Send size={18} />
                                Enviar a Cliente y Archivar
                              </>
                            )}
                          </button>
                          
                          <button 
                            onClick={() => {
                              setGeneratedPdf(null);
                              if (generatedPdfUrl) URL.revokeObjectURL(generatedPdfUrl);
                              setGeneratedPdfUrl(null);
                              setGeneratedReportMonth(null);
                            }}
                            className="w-full py-2 text-gray-500 hover:text-gray-900 text-sm flex items-center justify-center gap-1"
                          >
                            <Loader2 size={14} /> Regenerar Reporte
                          </button>
                        </div>
                      </div>
                    )}
                </div>

              </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Property Modal */}
      {showAddProperty && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 flex-shrink-0">
              <h3 className="font-bold text-lg text-gray-900">
                {editingId ? 'Editar Propiedad' : 'Nueva Propiedad'}
              </h3>
              <button onClick={handleCloseModal} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6">
              <form id="propertyForm" onSubmit={handleSaveProperty} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <span className="inline-flex items-center gap-1">
                      {t('propName')}
                      <InfoTooltip helpId="admin.property.title" label={t('propName')} />
                    </span>
                  </label>
                  <input 
                    required
                    type="text" 
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                    placeholder="Ej. Villa Paraíso"
                    value={newProp.title}
                    onChange={e => setNewProp({...newProp, title: e.target.value})}
                  />
                </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <span className="inline-flex items-center gap-1">
                    {t('address')}
                    <InfoTooltip helpId="admin.property.address" label={t('address')} />
                  </span>
                </label>
                <input 
                  required
                  type="text" 
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                  placeholder="Calle, Número, Colonia"
                  value={newProp.address}
                  onChange={e => setNewProp({...newProp, address: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <span className="inline-flex items-center gap-1">
                    {t('ownerEmail')}
                    <InfoTooltip helpId="admin.property.ownerEmail" label={t('ownerEmail')} />
                  </span>
                </label>
                <input 
                  required
                  type="email" 
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                  placeholder="usuario@email.com"
                  value={newProp.owner_email}
                  onChange={e => setNewProp({...newProp, owner_email: e.target.value})}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Si el usuario ya existe, la propiedad aparecerá en su panel automáticamente.
                </p>
              </div>

              {/* Assign Admin (Only for Super Admin or if needed) */}
              {(currentUserProfile?.role === 'super_admin' || currentUserProfile?.permissions?.can_assign_leads) && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <span className="inline-flex items-center gap-1">
                      Asignar Administrador
                      <InfoTooltip helpId="admin.property.assignedAdmin" label="Asignar Administrador" />
                    </span>
                  </label>
                  <select
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                    value={newProp.assigned_admin_id}
                    onChange={e => setNewProp({...newProp, assigned_admin_id: e.target.value})}
                  >
                    <option value="">Sin Asignar</option>
                    {dbUsers.filter((u: any) => u.role === 'admin' || u.role === 'super_admin').map((u: any) => (
                      <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                    ))}
                  </select>
                </div>
              )}
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <span className="inline-flex items-center gap-1">
                    Costo de Mantenimiento Mensual (USD)
                    <InfoTooltip helpId="admin.property.monthlyFee" label="Costo de Mantenimiento Mensual (USD)" />
                  </span>
                </label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                  <input 
                    type="number" 
                    step="0.01"
                    className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary disabled:bg-gray-100 disabled:text-gray-500"
                    placeholder="0.00"
                    value={newProp.monthly_fee}
                    onChange={e => setNewProp({...newProp, monthly_fee: e.target.value})}
                    disabled={
                      currentUserProfile?.role !== 'super_admin' && 
                      !currentUserProfile?.permissions?.can_edit_fees
                    }
                  />
                </div>
                {currentUserProfile?.role !== 'super_admin' && !currentUserProfile?.permissions?.can_edit_fees && (
                   <p className="text-xs text-red-500 mt-1">No tienes permisos para editar cobros.</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <span className="inline-flex items-center gap-1">
                    {t('contract')}
                    <InfoTooltip helpId="admin.property.contractStatus" label={t('contract')} />
                  </span>
                </label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                  value={newProp.contract_status}
                  onChange={e => setNewProp({...newProp, contract_status: e.target.value})}
                >
                  <option value="pending">Pendiente de Firma</option>
                  <option value="signed">Firmado (Listo para Pago)</option>
                  <option value="active">Activo</option>
                  <option value="expired">Expirado</option>
                </select>
                
                {/* PDF Contract Upload */}
                <div className="mt-2">
                  <div className="flex items-center gap-3">
                    <input 
                      type="file" 
                      ref={contractFileInputRef}
                      className="hidden" 
                      accept="application/pdf"
                      onChange={handleContractFileSelect}
                    />
                    <button 
                      type="button"
                      onClick={() => contractFileInputRef.current?.click()}
                      disabled={uploading}
                      className="text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
                    >
                      {uploading ? <Loader2 size={16} className="animate-spin"/> : <Upload size={16}/>}
                      {(newProp.contract_path || newProp.contract_url) ? 'Reemplazar Contrato' : t('uploadContract')}
                    </button>
                    
                    {(newProp.contract_path || newProp.contract_url) && (
                      <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 px-2 py-1 rounded">
                         <FileCheck size={14} />
                         <button type="button" onClick={openNewPropContract} className="hover:underline font-medium">
                           Ver PDF Actual
                         </button>
                         <button 
                           type="button" 
                           onClick={() => setNewProp({...newProp, contract_url: '', contract_path: ''})}
                           className="text-red-500 hover:text-red-700 ml-2"
                           title="Eliminar Contrato"
                         >
                           <X size={14} />
                         </button>
                      </div>
                    )}
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-1">El usuario solo podrá pagar si el contrato está "Firmado" o "Activo".</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('publicGallery')}</label>
                <div className="grid grid-cols-3 gap-2 mb-2">
                  {newProp.gallery.map((img, idx) => (
                    <div key={idx} className="relative group aspect-video bg-gray-100 rounded overflow-hidden">
                      <img src={img} alt={`Gallery ${idx}`} className="w-full h-full object-cover" />
                      <button 
                        type="button"
                        onClick={() => removeImageFromGallery(idx)}
                        className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                  
                  {/* Hidden File Input */}
                  <input 
                    type="file" 
                    ref={fileInputRef}
                    className="hidden" 
                    accept="image/*"
                    multiple
                    onChange={handleFileSelect}
                  />

                  <button 
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="flex flex-col items-center justify-center bg-gray-50 border-2 border-dashed border-gray-300 rounded aspect-video hover:bg-gray-100 transition-colors disabled:opacity-50"
                  >
                    {uploading ? (
                      <Loader2 className="animate-spin text-primary mb-1" />
                    ) : (
                      <Upload className="text-gray-400 mb-1" />
                    )}
                    <span className="text-xs text-gray-500">{uploading ? 'Subiendo...' : t('addPhoto')}</span>
                  </button>
                </div>
                <p className="text-xs text-gray-500">Estas fotos serán visibles para el propietario en su portal.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('contractedServices')}</label>
                <div className="grid grid-cols-2 gap-3 mt-2">
                  <label className="flex items-center space-x-2 text-sm cursor-pointer hover:bg-gray-50 p-2 rounded border border-transparent hover:border-gray-200">
                    <input 
                      type="checkbox" 
                      checked={newProp.services.hvac}
                      onChange={() => handleServiceChange('hvac')}
                      className="rounded text-primary focus:ring-primary"
                    />
                    <span>❄️ {t('hvac')}</span>
                  </label>
                  <label className="flex items-center space-x-2 text-sm cursor-pointer hover:bg-gray-50 p-2 rounded border border-transparent hover:border-gray-200">
                    <input 
                      type="checkbox" 
                      checked={newProp.services.pool}
                      onChange={() => handleServiceChange('pool')}
                      className="rounded text-primary focus:ring-primary"
                    />
                    <span>🏊 {t('pool')}</span>
                  </label>
                  <label className="flex items-center space-x-2 text-sm cursor-pointer hover:bg-gray-50 p-2 rounded border border-transparent hover:border-gray-200">
                    <input 
                      type="checkbox" 
                      checked={newProp.services.gardening}
                      onChange={() => handleServiceChange('gardening')}
                      className="rounded text-primary focus:ring-primary"
                    />
                    <span>🌿 {t('gardening')}</span>
                  </label>
                  <label className="flex items-center space-x-2 text-sm cursor-pointer hover:bg-gray-50 p-2 rounded border border-transparent hover:border-gray-200">
                    <input 
                      type="checkbox" 
                      checked={newProp.services.pestControl}
                      onChange={() => handleServiceChange('pestControl')}
                      className="rounded text-primary focus:ring-primary"
                    />
                    <span>🐛 {t('pestControl')}</span>
                  </label>
                  <label className="flex items-center space-x-2 text-sm cursor-pointer hover:bg-gray-50 p-2 rounded border border-transparent hover:border-gray-200">
                    <input 
                      type="checkbox" 
                      checked={newProp.services.cleaning}
                      onChange={() => handleServiceChange('cleaning')}
                      className="rounded text-primary focus:ring-primary"
                    />
                    <span>🧹 {t('cleaning')}</span>
                  </label>
                  <label className="flex items-center space-x-2 text-sm cursor-pointer hover:bg-gray-50 p-2 rounded border border-transparent hover:border-gray-200">
                    <input 
                      type="checkbox" 
                      checked={newProp.services.concierge}
                      onChange={() => handleServiceChange('concierge')}
                      className="rounded text-primary focus:ring-primary"
                    />
                    <span>🛎️ {t('concierge')}</span>
                  </label>
                </div>
              </div>
              
              <div className="pt-4 flex gap-3 border-t border-gray-100 mt-6 bg-white sticky bottom-0">
                <button 
                  type="button"
                  onClick={handleCloseModal}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
                >
                  {t('cancel')}
                </button>
                <button 
                  type="submit"
                  className="flex-1 px-4 py-2 bg-primary text-white rounded-lg hover:bg-opacity-90 font-medium flex justify-center items-center gap-2"
                >
                  <Save size={18} />
                  {t('save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
      )}
      {/* Add/Edit User Modal */}
      {showAddUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="font-bold text-lg text-gray-900">{isEditingUser ? 'Editar Usuario' : 'Nuevo Usuario'}</h3>
              <button onClick={handleCloseUserModal} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSaveUser} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <span className="inline-flex items-center gap-1">
                    Nombre Completo
                    <InfoTooltip helpId="admin.user.name" label="Nombre Completo" />
                  </span>
                </label>
                <input 
                  required
                  type="text" 
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                  placeholder="Ej. Juan Perez"
                  value={newUser.name}
                  onChange={e => setNewUser({...newUser, name: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <span className="inline-flex items-center gap-1">
                    Email
                    <InfoTooltip helpId="admin.user.email" label="Email" />
                  </span>
                </label>
                <input 
                  required
                  type="email" 
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                  placeholder="usuario@ejemplo.com"
                  value={newUser.email}
                  onChange={e => setNewUser({...newUser, email: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <span className="inline-flex items-center gap-1">
                    Rol
                    <InfoTooltip helpId="admin.user.role" label="Rol" />
                  </span>
                </label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary disabled:bg-gray-100 disabled:text-gray-500"
                  value={newUser.role}
                  onChange={e => setNewUser({...newUser, role: e.target.value})}
                  disabled={
                    currentUserProfile?.role !== 'super_admin' && 
                    !currentUserProfile?.permissions?.can_manage_roles
                  }
                >
                  <option value="owner">Owner (Propietario)</option>
                  <option value="admin">Admin (Administrador)</option>
                  <option value="tenant">Tenant (Inquilino)</option>
                  {currentUserProfile?.role === 'super_admin' && (
                    <option value="super_admin">Super Admin</option>
                  )}
                </select>
                {currentUserProfile?.role !== 'super_admin' && !currentUserProfile?.permissions?.can_manage_roles && (
                   <p className="text-xs text-red-500 mt-1">No tienes permisos para cambiar roles.</p>
                )}
              </div>

              {/* Admin Permissions Configuration (Only for Super Admin when editing an Admin) */}
              {currentUserProfile?.role === 'super_admin' && newUser.role === 'admin' && (
                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                  <h4 className="font-bold text-sm text-gray-800 mb-3 flex items-center gap-2">
                    <Shield size={14} className="text-purple-600"/>
                    Permisos de Administrador
                  </h4>
                  <div className="space-y-2">
                    <label className="flex items-center space-x-2 text-sm cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={newUser.permissions?.can_edit_fees || false}
                        onChange={(e) => setNewUser({
                          ...newUser,
                          permissions: { ...newUser.permissions, can_edit_fees: e.target.checked }
                        })}
                        className="rounded text-purple-600 focus:ring-purple-500"
                      />
                      <span className="inline-flex items-center gap-1">
                        Editar Cobros / Mensualidades
                        <InfoTooltip helpId="admin.user.perm.can_edit_fees" label="Editar Cobros" />
                      </span>
                    </label>
                    <label className="flex items-center space-x-2 text-sm cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={newUser.permissions?.can_assign_leads || false}
                        onChange={(e) => setNewUser({
                          ...newUser,
                          permissions: { ...newUser.permissions, can_assign_leads: e.target.checked }
                        })}
                        className="rounded text-purple-600 focus:ring-purple-500"
                      />
                      <span className="inline-flex items-center gap-1">
                        Asignar Clientes / Leads
                        <InfoTooltip helpId="admin.user.perm.can_assign_leads" label="Asignar Leads" />
                      </span>
                    </label>
                    <label className="flex items-center space-x-2 text-sm cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={newUser.permissions?.can_manage_roles || false}
                        onChange={(e) => setNewUser({
                          ...newUser,
                          permissions: { ...newUser.permissions, can_manage_roles: e.target.checked }
                        })}
                        className="rounded text-purple-600 focus:ring-purple-500"
                      />
                      <span className="inline-flex items-center gap-1">
                        Gestionar Roles de Usuario
                        <InfoTooltip helpId="admin.user.perm.can_manage_roles" label="Gestionar Roles" />
                      </span>
                    </label>
                  </div>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <span className="inline-flex items-center gap-1">
                    Teléfono (Opcional)
                    <InfoTooltip helpId="admin.user.phone" label="Teléfono" />
                  </span>
                </label>
                <input 
                  type="tel" 
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                  placeholder="+52 ..."
                  value={newUser.phone}
                  onChange={e => setNewUser({...newUser, phone: e.target.value})}
                />
              </div>
              
              <div className="pt-4 flex gap-3">
                <button 
                  type="button"
                  onClick={handleCloseUserModal}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="flex-1 px-4 py-2 bg-primary text-white rounded-lg hover:bg-opacity-90 font-medium flex justify-center items-center gap-2"
                >
                  <Save size={18} />
                  {isEditingUser ? 'Actualizar Usuario' : 'Guardar Usuario'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deletePropertyOpen && propertyPendingDelete && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
              <div className="font-bold text-gray-900">{t('confirmDeletionTitle')}</div>
              <button
                type="button"
                onClick={closeDeletePropertyModal}
                disabled={deletingProperty}
                className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
                aria-label={t('cancel')}
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="text-sm text-gray-700">
                {t('confirmDeletePropertyPrefix')}
                <span className="font-bold">{propertyPendingDelete.title}</span>
                {t('confirmDeletePropertySuffix')}
              </div>

              {deletePropertyError ? (
                <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{deletePropertyError}</div>
              ) : null}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={closeDeletePropertyModal}
                  disabled={deletingProperty}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium disabled:opacity-50"
                >
                  {t('cancel')}
                </button>
                <button
                  type="button"
                  onClick={confirmDeleteProperty}
                  disabled={deletingProperty}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-bold disabled:opacity-60"
                >
                  {deletingProperty ? t('deleting') : t('delete')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
