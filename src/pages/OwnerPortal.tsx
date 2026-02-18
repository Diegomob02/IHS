import { useState, useEffect, lazy, Suspense } from 'react';
import { Lock, User, FileText, LogOut, MapPin, CreditCard, Home, Globe, RefreshCw, Archive, Settings, Phone, Loader2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { buildPublicUrl, getPublicSupabaseConfig } from '../utils/env';
import { User as SupabaseUser } from '@supabase/supabase-js';
import { useSettings } from '../context/SettingsContext';
import { clearSessionStartedAt, isSessionOlderThan24h } from '../utils/authRouting';
import { normalizeDocumentsObjectPath } from '../utils/documents';
import { DocumentManager } from '../components/documents/DocumentManager';
import NotificationCenter from '../components/common/NotificationCenter';
import { PasswordField } from '../components/common/PasswordField';

// Lazy load AdminDashboard
const AdminDashboard = lazy(() => import('./AdminDashboard'));

// Loading component
const LoadingSpinner = () => (
  <div className="flex justify-center items-center p-12">
    <Loader2 className="animate-spin h-8 w-8 text-primary" />
  </div>
);

// --- MOCK DATA FOR DEMO PURPOSES ---
const ADMIN_EMAILS = ['admin@ihs.com', 'diego@ihs.com', 'amoreno@moreno-arquitectos.com']; // Add your email here

interface MockProperty {
  id: string;
  name: string;
  address: string;
  image: string;
}

const MOCK_PROPERTY: MockProperty = {
  id: 'prop_001',
  name: 'Villa Mar Azul',
  address: 'Calle del Mar 123, Cabo San Lucas, BCS',
  image: 'https://coreva-normal.trae.ai/api/ide/v1/text_to_image?prompt=Luxury%20villa%20in%20Cabo%20San%20Lucas%20ocean%20view%20modern%20architecture&image_size=landscape_4_3'
};

const INITIAL_MOCK_PROPERTIES = [
  { 
    id: 'prop_001', 
    title: 'Villa Mar Azul', 
    address: 'Calle del Mar 123, Cabo San Lucas, BCS', 
    owner: 'demo@ihs.com', // Placeholder
    status: 'active',
    image: 'https://coreva-normal.trae.ai/api/ide/v1/text_to_image?prompt=Luxury%20villa%20in%20Cabo%20San%20Lucas%20ocean%20view%20modern%20architecture&image_size=landscape_4_3',
    services: { hvac: true, pool: true, gardening: true, pestControl: false, cleaning: true, concierge: true }
  },
  { 
    id: 'prop_002', 
    title: 'Casa del Sol', 
    address: 'Av. Playa Grande 45, San José del Cabo', 
    owner: 'maria.gonzalez@example.com',
    status: 'active',
    image: 'https://coreva-normal.trae.ai/api/ide/v1/text_to_image?prompt=Mexican%20hacienda%20luxury%20home%20sunny&image_size=landscape_4_3',
    services: { hvac: true, pool: false, gardening: true, pestControl: true, cleaning: true, concierge: false }
  }
];

export default function OwnerPortal() {
  const { t, language, setLanguage, currency, setCurrency, formatCurrency } = useSettings();
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'documents' | 'contractor' | 'settings'>('dashboard');
  const navigate = useNavigate();
  
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    if (tab && ['dashboard', 'documents', 'contractor', 'settings'].includes(tab)) {
      setActiveTab(tab as any);
    }
  }, []);
  
  // Shared Properties State (Fetched from Supabase)
  const [properties, setProperties] = useState<any[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState('');
  const [propertySearch, setPropertySearch] = useState('');
  const [propertyStatusFilter, setPropertyStatusFilter] = useState<'all' | 'active' | 'inactive' | 'pending'>('all');
  const [propertyPage, setPropertyPage] = useState(1);
  const pageSize = 10;
  const contractorServiceOptions = [
    { value: 'plomería', labelKey: 'servicePlumbing' },
    { value: 'electricidad', labelKey: 'serviceElectrical' },
    { value: 'carpintería', labelKey: 'serviceCarpentry' },
    { value: 'pintura', labelKey: 'servicePainting' },
    { value: 'jardinería', labelKey: 'serviceGardening' },
    { value: 'alberca', labelKey: 'servicePool' },
    { value: 'hvac', labelKey: 'serviceHvac' },
    { value: 'limpieza', labelKey: 'serviceCleaning' },
    { value: 'otro', labelKey: 'serviceOther' },
  ];
  const [requestServices, setRequestServices] = useState<string[]>([]);
  const [requestDescription, setRequestDescription] = useState('');
  const [requestUrgency, setRequestUrgency] = useState<'low' | 'medium' | 'high'>('medium');
  const [requestPreferredDate, setRequestPreferredDate] = useState('');
  const [requestBudgetEstimated, setRequestBudgetEstimated] = useState('');
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const [requestHistoryLoading, setRequestHistoryLoading] = useState(false);
  const [requestHistory, setRequestHistory] = useState<any[]>([]);
  const [requestHistoryPage, setRequestHistoryPage] = useState(1);
  const [requestHistoryTotal, setRequestHistoryTotal] = useState(0);
  const [requestStatusFilter, setRequestStatusFilter] = useState<'all' | 'pending' | 'in_review' | 'assigned' | 'in_progress' | 'completed' | 'cancelled'>('all');
  const [requestFrom, setRequestFrom] = useState('');
  const [requestTo, setRequestTo] = useState('');

  useEffect(() => {
    setPropertyPage(1);
  }, [propertySearch, propertyStatusFilter, user?.email, properties.length]);

  useEffect(() => {
    fetchProperties();
  }, []);

  useEffect(() => {
    if (!user?.email) return;

    const isAdminEmail = ADMIN_EMAILS.includes(user.email || '');
    if (isAdminEmail) return;

    const owned = properties.filter((p: any) => p.owner === user.email);
    if (owned.length === 0) {
      if (selectedPropertyId) setSelectedPropertyId('');
      return;
    }

    const stillValid = owned.some((p: any) => p.id === selectedPropertyId);
    if (!selectedPropertyId || !stillValid) {
      setSelectedPropertyId(owned[0].id);
    }
  }, [user, properties, selectedPropertyId]);

  const fetchProperties = async () => {
    const { data, error } = await supabase
      .from('properties')
      .select('*, assigned_admin:assigned_admin_id(name, email, phone)')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching properties:', error);
    } else {
      // Map DB fields to UI expected fields
      const mapped = (data || []).map(p => ({
        ...p,
        address: p.location, // DB: location, UI: address
        owner: p.owner_email, // DB: owner_email, UI: owner
        image: p.images && p.images.length > 0 ? p.images[0] : '',
        gallery: p.images || []
      }));
      setProperties(mapped);
    }
  };

  const openPropertyContract = async (property: any) => {
    const objectPath = property?.contract_path || normalizeDocumentsObjectPath(property?.contract_url);
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

  const fetchRequestHistory = async (opts: { propertyId?: string; page?: number }) => {
    if (!user?.id) return;
    if (ADMIN_EMAILS.includes(user.email || '')) return;
    if (activeTab !== 'contractor') return;

    setRequestHistoryLoading(true);
    try {
      const fromIso = requestFrom ? `${requestFrom}T00:00:00.000Z` : null;
      const toIso = requestTo ? `${requestTo}T23:59:59.999Z` : null;
      const status = requestStatusFilter === 'all' ? null : requestStatusFilter;
      const page = opts.page ?? requestHistoryPage;

      const { data, error } = await supabase.functions.invoke('maintenance-requests', {
        body: {
          propertyId: opts.propertyId || null,
          status,
          from: fromIso,
          to: toIso,
          page,
          pageSize: 10,
        },
      });

      if (error) throw error;
      setRequestHistory(Array.isArray(data?.data) ? data.data : []);
      setRequestHistoryTotal(Number(data?.total ?? 0));
    } catch (e: any) {
      console.error(e);
      setRequestHistory([]);
      setRequestHistoryTotal(0);
    } finally {
      setRequestHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab !== 'contractor') return;
    if (!selectedPropertyId) return;
    fetchRequestHistory({ propertyId: selectedPropertyId });
  }, [activeTab, selectedPropertyId, requestStatusFilter, requestFrom, requestTo, requestHistoryPage, user?.id]);

  const toggleRequestService = (value: string) => {
    setRequestServices((prev) => (prev.includes(value) ? prev.filter((x) => x !== value) : [...prev, value]));
  };

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPropertyId) return;
    if (requestSubmitting) return;
    setRequestSubmitting(true);
    try {
      const budget = requestBudgetEstimated.trim();
      const { data, error } = await supabase.functions.invoke('maintenance-request-create', {
        body: {
          propertyId: selectedPropertyId,
          services: requestServices,
          description: requestDescription,
          urgency: requestUrgency,
          preferredDate: requestPreferredDate || null,
          budgetEstimated: budget ? Number(budget) : null,
        },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(String(data?.message || 'Error'));

      setRequestServices([]);
      setRequestDescription('');
      setRequestPreferredDate('');
      setRequestBudgetEstimated('');
      setRequestHistoryPage(1);
      fetchRequestHistory({ propertyId: selectedPropertyId, page: 1 });
    } catch (e: any) {
      alert(String(e?.message || 'Error'));
    } finally {
      setRequestSubmitting(false);
    }
  };
  
  // Login states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const authError = window.sessionStorage.getItem('ihs-auth-error');
    if (authError) {
      setError(authError);
      window.sessionStorage.removeItem('ihs-auth-error');
    }

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (isSessionOlderThan24h()) {
        await supabase.auth.signOut();
        clearSessionStartedAt();
        checkUserAccess(null);
        return;
      }
      checkUserAccess(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      checkUserAccess(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkUserAccess = async (currentUser: SupabaseUser | null) => {
    if (!currentUser) {
      setUser(null);
      setLoading(false);
      return;
    }

    try {
      const { data: row } = await supabase
        .from('users')
        .select('role')
        .eq('id', currentUser.id)
        .maybeSingle();
      const r = String((row as any)?.role || '');
      if (r === 'contractor') {
        setLoading(false);
        navigate('/portal-contratistas');
        return;
      }
    } catch {
      // ignore
    }

    // Here we would typically check against a 'profiles' or 'whitelist' table
    // For now, since we want to restrict access to ONLY invited/registered users:
    // We will simulate this check. In a real scenario, you'd do:
    // const { data } = await supabase.from('profiles').select('role').eq('id', currentUser.id).single();
    // if (!data || data.role !== 'owner') { await supabase.auth.signOut(); window.location.href = '/no-autorizado'; }
    
    // For this MVP step: we allow the login but logically we should disable "Sign Up" in Supabase Dashboard
    setUser(currentUser);
    setLoading(false);
  };

  const [isRegistering, setIsRegistering] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    setError(null);
    
    try {
      if (isRegistering) {
        if (password !== confirmPassword) {
          throw new Error(t('passwordsDoNotMatch'));
        }
        
        // Sign Up
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              name: fullName
            }
          }
        });

        if (error) throw error;
        
        if (data.user) {
           alert(t('registrationSuccess'));
           setIsRegistering(false); // Switch back to login
        }
      } else {
        // Login
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;
      }
    } catch (err: any) {
      setError(err.message || t('authErrorGeneric'));
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
      // Legacy handler redirected to unified handleAuth
      handleAuth(e);
  };


  const handleSocialLogin = async (provider: 'google') => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: buildPublicUrl('/auth'),
          queryParams: {
            access_type: 'offline', // Requests a refresh token
            prompt: 'consent', // Force consent screen to ensure refresh token
          },
        },
      });
      if (error) throw error;
    } catch (err: any) {
      setError(err.message || `${t('socialLoginErrorPrefix')}${provider}`);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    navigate('/'); // Redirect to Home Page to show Navbar/Footer again
  };

  const handleStripePortal = async () => {
    try {
      const { supabaseUrl, supabaseAnonKey } = getPublicSupabaseConfig();
      const functionUrl = `${supabaseUrl}/functions/v1/create-stripe-session`;
      if (!supabaseUrl || supabaseUrl.includes('placeholder')) {
        alert(t('configMissingSupabaseUrl'));
        return;
      }
      if (!supabaseAnonKey || supabaseAnonKey.includes('placeholder')) {
        alert(t('configMissingSupabaseAnonKey'));
        return;
      }

      try {
        const host = new URL(supabaseUrl).host;
        const ref = host.split('.')[0];
        const anonKeyRef = (window as any)?.IHS_PUBLIC_CONFIG?.anonKeyRef;
        if (ref && anonKeyRef && ref !== anonKeyRef) {
          alert(
            `${t('configInvalidHeader')}\n` +
              `${t('configInvalidProjectUrl')}${ref}\n` +
              `${t('configInvalidProjectAnonKey')}${anonKeyRef}\n\n` +
              t('configInvalidFix')
          );
          return;
        }
      } catch {
        // ignore
      }

      const { data: sessionData } = await supabase.auth.getSession();
      let accessToken = sessionData?.session?.access_token ?? '';
      accessToken = accessToken.trim();
      if (accessToken.toLowerCase().startsWith('bearer ')) {
        accessToken = accessToken.slice(7).trim();
      }
      if (!accessToken) {
        alert(t('sessionExpired'));
        return;
      }

      const tokenDebug: Record<string, unknown> = {
        tokenLooksJwt: false,
      };

      try {
        const parts = accessToken.split('.');
        tokenDebug.tokenLooksJwt = parts.length === 3;
        tokenDebug.headerLen = parts[0]?.length ?? 0;
        tokenDebug.payloadLen = parts[1]?.length ?? 0;

        if (parts.length === 3) {
          const payloadJson = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
          const payload = JSON.parse(payloadJson);
          tokenDebug.iss = payload?.iss;
          tokenDebug.aud = payload?.aud;
          tokenDebug.exp = payload?.exp;
        }
      } catch {
        // ignore
      }

      try {
        const iss = typeof tokenDebug.iss === 'string' ? String(tokenDebug.iss) : '';
        if (iss && !iss.includes(new URL(supabaseUrl).host)) {
          await supabase.auth.signOut();
          alert(t('sessionIssuerMismatch'));
          return;
        }
      } catch {
        // ignore
      }

      const authCheckRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          apikey: supabaseAnonKey,
        },
      });

      if (!authCheckRes.ok) {
        let body = '';
        try {
          body = await authCheckRes.text();
        } catch {
          body = '';
        }
        await supabase.auth.signOut();
        alert(
          `${t('invalidSessionAuthUserPrefix')}${authCheckRes.status}${t('invalidSessionAuthUserSuffix')}` +
            (body ? `${t('invalidSessionDetailPrefix')}${body}` : '')
        );
        return;
      }

      tokenDebug.authUserStatus = authCheckRes.status;

      const res = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          apikey: supabaseAnonKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });

      const requestId = res.headers.get('sb-request-id');

      if (!res.ok) {
        let errorMessage = '';
        try {
          const json = await res.json();
          errorMessage = String(json?.error || json?.message || JSON.stringify(json));
        } catch {
          try {
            errorMessage = String(await res.text());
          } catch {
            errorMessage = '';
          }
        }

        const suffix = requestId ? ` (request_id: ${requestId})` : '';
        throw new Error(`HTTP ${res.status}: ${errorMessage || 'Edge Function error'}${suffix}\nTokenDebug: ${JSON.stringify(tokenDebug)}`);
      }

      const data = await res.json();
      if (data?.url) {
        window.location.href = data.url;
        return;
      }

      alert(t('stripeSessionCreateFailed'));
    } catch (err: any) {
      console.error(err);
      const msg = String(err?.message || 'Error desconocido');
      const notFound = msg.toLowerCase().includes('not found') || msg.toLowerCase().includes('requested function was not found');
      if (notFound) {
        alert(t('stripeNotAvailable'));
        return;
      }

      const invalidJwt = msg.toLowerCase().includes('invalid jwt');
      if (invalidJwt) {
        const supabaseUrlConfigured = (window as any)?.IHS_PUBLIC_CONFIG?.supabaseUrl;
        const ref = (window as any)?.IHS_PUBLIC_CONFIG?.supabaseProjectRef;
        const anonKeyRef = (window as any)?.IHS_PUBLIC_CONFIG?.anonKeyRef;
        const mismatch = ref && anonKeyRef && ref !== anonKeyRef;

        const extra = supabaseUrlConfigured ? `${t('supabaseUrlConfiguredLabel')}${supabaseUrlConfigured}` : '';
        const extra2 = ref ? `${t('projectRefDetectedLabel')}${ref}` : '';
        const extra3 = anonKeyRef ? `${t('anonKeyRefDetectedLabel')}${anonKeyRef}` : '';
        const extra4 = mismatch ? t('anonKeyMismatchError') : '';

        if (!mismatch) {
          try {
            await supabase.auth.signOut();
          } catch {
            // ignore
          }

          try {
            const fallbackUrl = getPublicSupabaseConfig().supabaseUrl;
            const url = String(supabaseUrlConfigured || fallbackUrl || '');
            const host = new URL(url).host;
            const r = host.split('.')[0];
            const key = `sb-${r}-auth-token`;
            localStorage.removeItem(key);
            sessionStorage.removeItem(key);
          } catch {
            // ignore
          }
        }

        alert(
          t('invalidJwtTitle') +
            t('invalidJwtFixHint') +
            extra +
            extra2 +
            extra3 +
            extra4 +
            `${t('detailPrefix')}${msg}`
        );
        return;
      }

      alert(`${t('stripeConnectErrorPrefix')}${msg}`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Dashboard View (Logged In)
  if (user) {
    const isAdmin = ADMIN_EMAILS.includes(user.email || '');

    if (isAdmin) {
      return (
        <div>
          <Suspense fallback={<LoadingSpinner />}>
            <AdminDashboard user={user} properties={properties} setProperties={setProperties} onLogout={handleLogout} />
          </Suspense>
        </div>
      );
    }

    // Filter properties for current user
    // We try to match email strictly, but if user has NO properties and this is the first login,
    // we might want to auto-assign the 'demo' one for better UX? 
    // For now, let's stick to strict matching to demonstrate the "Create Property" flow.
    const myProperties = properties.filter((p: any) => p.owner === user.email);
    const filteredProperties = myProperties.filter((p: any) => {
      const q = propertySearch.trim().toLowerCase();
      const matchesQuery =
        !q ||
        String(p.title ?? '').toLowerCase().includes(q) ||
        String(p.address ?? '').toLowerCase().includes(q);

      const rawStatus = String(p.contract_status ?? p.status ?? 'active').toLowerCase();
      const normalizedStatus =
        rawStatus.includes('pending') ? 'pending' : rawStatus.includes('inactive') ? 'inactive' : 'active';
      const matchesStatus = propertyStatusFilter === 'all' || normalizedStatus === propertyStatusFilter;

      return matchesQuery && matchesStatus;
    });

    const totalPages = Math.max(1, Math.ceil(filteredProperties.length / pageSize));
    const clampedPage = Math.min(propertyPage, totalPages);
    const startIdx = (clampedPage - 1) * pageSize;
    const pageItems = filteredProperties.slice(startIdx, startIdx + pageSize);
    const selectedProperty = myProperties.find((p: any) => p.id === selectedPropertyId) || null;
    
    // Filter documents from properties
    const myDocuments = myProperties.flatMap((p: any) => p.documents || []);

    return (
      <div className="min-h-screen bg-gray-50 flex">
        {/* SIDEBAR NAVIGATION */}
        <aside className="w-64 bg-white border-r border-gray-200 hidden md:flex flex-col fixed h-full z-20">
          <div className="p-6 border-b border-gray-100">
            <h2 className="text-xl font-bold text-primary flex items-center gap-2">
              <Home className="text-primary" />
              IHS Portal
            </h2>
            <p className="text-xs text-gray-500 mt-1 truncate" title={user.email}>{user.email}</p>
          </div>
          
          <nav className="flex-1 p-4 space-y-2">
            <button 
              onClick={() => setActiveTab('dashboard')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors font-medium ${activeTab === 'dashboard' ? 'bg-primary/10 text-primary' : 'hover:bg-gray-50 text-gray-600'}`}
            >
              <Home size={20} />
              {t('dashboardTab')}
            </button>
            <button 
              onClick={() => setActiveTab('documents')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors font-medium ${activeTab === 'documents' ? 'bg-primary/10 text-primary' : 'hover:bg-gray-50 text-gray-600'}`}
            >
              <FileText size={20} />
              {t('docHistory')}
            </button>
            <button 
              onClick={() => setActiveTab('contractor')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors font-medium ${activeTab === 'contractor' ? 'bg-primary/10 text-primary' : 'hover:bg-gray-50 text-gray-600'}`}
            >
              <Archive size={20} />
              {t('requestContractorTab')}
            </button>
          </nav>

          <div className="p-4 border-t border-gray-100">
             {/* Settings Controls (Mini) */}
             <div className="flex gap-2 mb-4 justify-center">
                <button 
                  onClick={() => setLanguage(language === 'es' ? 'en' : 'es')}
                  className="p-2 text-gray-500 hover:text-primary rounded-full hover:bg-gray-100 transition-colors"
                  title={t('switchLanguage')}
                >
                  <Globe size={18} />
                </button>
                <button 
                  onClick={() => setCurrency(currency === 'USD' ? 'MXN' : 'USD')}
                  className="p-2 text-gray-500 hover:text-green-600 rounded-full hover:bg-gray-100 transition-colors font-bold text-xs flex items-center"
                  title={t('switchCurrency')}
                >
                  {currency}
                </button>
              </div>

            <button 
              onClick={() => setActiveTab('settings')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors font-medium mb-2 ${activeTab === 'settings' ? 'bg-primary/10 text-primary' : 'hover:bg-gray-50 text-gray-600'}`}
            >
              <CreditCard size={20} />
              {t('settings')}
            </button>

            <button 
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors hover:bg-red-50 text-gray-500 hover:text-red-600"
            >
              <LogOut size={20} />
              {t('logout')}
            </button>
          </div>
        </aside>

        {/* MAIN CONTENT AREA */}
        <main className="flex-1 md:ml-64 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          {/* Desktop Header */}
          <div className="hidden md:flex justify-between items-center mb-8">
            <h2 className="text-2xl font-bold text-gray-800">
              {activeTab === 'dashboard' && t('welcome')}
              {activeTab === 'documents' && t('docHistory')}
              {activeTab === 'contractor' && t('requestContractorTab')}
              {activeTab === 'settings' && t('settings')}
            </h2>
            <div className="flex items-center gap-4">
               <NotificationCenter />
               <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-white font-bold">
                    {user.email?.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-sm font-medium text-gray-700">{user.email}</span>
               </div>
            </div>
          </div>

          {/* Mobile Header (Only visible on small screens) */}
          <div className="md:hidden flex justify-between items-center gap-3 mb-6">
            <h1 className="text-xl font-bold text-primary">IHS Portal</h1>
            <div className="flex gap-2 items-center overflow-x-auto max-w-[75vw]">
              <div className="flex-shrink-0">
                <NotificationCenter />
              </div>
              <button onClick={() => setActiveTab('dashboard')} className="flex-shrink-0 p-2 bg-white rounded shadow-sm"><Home size={20}/></button>
              <button onClick={() => setActiveTab('documents')} className="flex-shrink-0 p-2 bg-white rounded shadow-sm"><FileText size={20}/></button>
              <button onClick={() => setActiveTab('contractor')} className="flex-shrink-0 p-2 bg-white rounded shadow-sm"><Archive size={20}/></button>
              <button onClick={() => setActiveTab('settings')} className="flex-shrink-0 p-2 bg-white rounded shadow-sm"><CreditCard size={20}/></button>
              <button onClick={handleLogout} className="flex-shrink-0 p-2 bg-white rounded shadow-sm text-red-500"><LogOut size={20}/></button>
            </div>
          </div>

          {activeTab === 'dashboard' && (
            <div className="max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
              {/* Removed redundant title since it's in header now, or keep it? 
                  The design had a Welcome title. I'll keep the grid layout but maybe remove the duplicate H1 if I added a header.
                  Let's check the original code. It had <h1 ...>{t('welcome')}</h1> at line 399.
                  I will remove it to avoid duplication if I added it to header.
              */}
              
              <div className="space-y-6">
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">{t('myPropertiesTitle')}</h3>
                    <p className="text-sm text-gray-500">
                      {t('myPropertiesCountPrefix')} <span className="font-bold text-gray-800">{myProperties.length}</span>
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                    <input
                      value={propertySearch}
                      onChange={(e) => setPropertySearch(e.target.value)}
                      placeholder={t('propertiesSearchPlaceholder')}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white w-full sm:w-64"
                    />
                    <select
                      value={propertyStatusFilter}
                      onChange={(e) => setPropertyStatusFilter(e.target.value as any)}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                    >
                      <option value="all">{t('filterAll')}</option>
                      <option value="active">{t('filterActive')}</option>
                      <option value="pending">{t('filterPending')}</option>
                      <option value="inactive">{t('filterInactive')}</option>
                    </select>
                  </div>
                </div>

                {filteredProperties.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {pageItems.map((property: any) => {
                      const isSelected = property.id === selectedPropertyId;
                      const rawStatus = String(property.contract_status ?? property.status ?? 'active').toLowerCase();
                      const status =
                        rawStatus.includes('pending') ? 'pending' : rawStatus.includes('inactive') ? 'inactive' : 'active';
                      return (
                        <button
                          key={property.id}
                          type="button"
                          onClick={() => setSelectedPropertyId(property.id)}
                          className={`text-left bg-white rounded-xl shadow-sm border overflow-hidden transition-colors ${
                            isSelected ? 'border-primary ring-2 ring-primary/20' : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <div className="relative h-40">
                            {property.image ? (
                              <img src={property.image} alt={property.title} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full bg-gray-100 flex items-center justify-center text-gray-400">
                                <Home className="h-8 w-8" />
                              </div>
                            )}
                            <div
                              className={`absolute top-3 right-3 px-3 py-1 rounded-full text-xs font-bold shadow ${
                                status === 'active'
                                  ? 'bg-green-500 text-white'
                                  : status === 'pending'
                                    ? 'bg-amber-500 text-white'
                                    : 'bg-gray-500 text-white'
                              }`}
                            >
                              {status === 'active' ? t('activeProperty') : status === 'pending' ? t('pending') : t('inactive')}
                            </div>
                          </div>
                          <div className="p-4">
                            <h4 className="text-base font-bold text-gray-900 line-clamp-1">{property.title}</h4>
                            <div className="flex items-start text-gray-500 mt-1 text-sm gap-2">
                              <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                              <span className="line-clamp-2">{property.address}</span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="bg-white rounded-xl shadow-sm p-12 text-center border border-gray-200">
                    <div className="bg-gray-100 p-4 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                      <Home className="h-8 w-8 text-gray-400" />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900">{t('noProperties')}</h3>
                    <p className="text-gray-500 mt-2 max-w-md mx-auto">
                      {t('contactAdmin')} <span className="font-bold text-gray-800">{user.email}</span>
                    </p>
                  </div>
                )}

                {filteredProperties.length > pageSize && (
                  <div className="flex items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => setPropertyPage((p) => Math.max(1, p - 1))}
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
                      onClick={() => setPropertyPage((p) => Math.min(totalPages, p + 1))}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white hover:bg-gray-50"
                      disabled={clampedPage >= totalPages}
                    >
                      {t('next')}
                    </button>
                  </div>
                )}

                {selectedProperty && (
                  <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-100">
                    <div className="relative h-64 sm:h-80 group">
                      <img src={selectedProperty.image} alt={selectedProperty.title} className="w-full h-full object-cover" />

                      {selectedProperty.gallery && selectedProperty.gallery.length > 1 && (
                        <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-2">
                          {selectedProperty.gallery.map((_: any, idx: number) => (
                            <div key={idx} className={`w-2 h-2 rounded-full ${idx === 0 ? 'bg-white' : 'bg-white/50'}`} />
                          ))}
                        </div>
                      )}
                      {selectedProperty.gallery && selectedProperty.gallery.length > 1 && (
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-between px-4 opacity-0 group-hover:opacity-100">
                          <span className="text-white text-xs font-bold bg-black/50 px-2 py-1 rounded">
                            +{selectedProperty.gallery.length} Fotos
                          </span>
                        </div>
                      )}

                      <div className="absolute top-4 right-4 bg-green-500 text-white px-3 py-1 rounded-full text-sm font-bold shadow-lg">
                        {t('activeProperty')}
                      </div>
                    </div>
                    <div className="p-6">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h2 className="text-2xl font-bold text-gray-900">{selectedProperty.title}</h2>
                          <div className="flex items-center text-gray-500 mt-1">
                            <MapPin className="h-4 w-4 mr-1" />
                            {selectedProperty.address}
                          </div>
                        </div>
                        {(selectedProperty.contract_path || selectedProperty.contract_url) ? (
                          <button
                            type="button"
                            onClick={() => openPropertyContract(selectedProperty)}
                            className="bg-primary/10 text-primary px-3 py-1 rounded-full text-sm font-medium hover:bg-primary hover:text-white transition-colors flex items-center gap-1"
                          >
                            <FileText size={14} />
                            {t('accessContract')}
                          </button>
                        ) : (
                          <span className="text-xs text-gray-400 flex items-center gap-1 bg-gray-50 px-2 py-1 rounded">
                            <FileText size={14} />
                            {t('contract')}: {t('pending')}
                          </span>
                        )}
                      </div>

                      {selectedProperty.services && (
                        <div className="flex flex-wrap gap-2 mb-6">
                          {Object.entries(selectedProperty.services).map(([key, value]) => (
                            value && (
                              <span
                                key={key}
                                className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-xs font-bold uppercase border border-gray-200 flex items-center gap-1"
                              >
                                {key === 'hvac'
                                  ? `❄️ ${t('hvac')}`
                                  : key === 'pool'
                                    ? `🏊 ${t('pool')}`
                                    : key === 'gardening'
                                      ? `🌿 ${t('gardening')}`
                                      : key === 'pestControl'
                                        ? `🐛 ${t('pestControl')}`
                                        : key === 'cleaning'
                                          ? `🧹 ${t('cleaning')}`
                                          : `🛎️ ${t('concierge')}`}
                              </span>
                            )
                          ))}
                        </div>
                      )}

                      {selectedProperty.assigned_admin ? (
                        <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
                          <div className="flex gap-3">
                            <div className="flex-shrink-0">
                              <User className="h-5 w-5 text-blue-600" />
                            </div>
                            <div>
                              <h3 className="text-sm font-bold text-blue-900">{t('adminProfessional')}</h3>
                              <p className="text-sm text-blue-800 font-medium">{selectedProperty.assigned_admin.name}</p>
                              <div className="mt-2 space-y-1">
                                <div className="flex items-center text-xs text-blue-700">
                                  <span className="w-5 flex-shrink-0">
                                    <Settings size={12} />
                                  </span>
                                  {selectedProperty.assigned_admin.email}
                                </div>
                                {selectedProperty.assigned_admin.phone && (
                                  <div className="flex items-center text-xs text-blue-700">
                                    <span className="w-5 flex-shrink-0">
                                      <Phone size={12} />
                                    </span>
                                    {selectedProperty.assigned_admin.phone}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                          <div className="flex items-center gap-3">
                            <div className="bg-gray-200 p-2 rounded-full">
                              <User className="h-4 w-4 text-gray-400" />
                            </div>
                            <div>
                              <p className="text-sm text-gray-500 italic">{t('assigningAdminTitle')}</p>
                              <p className="text-xs text-gray-400">{t('assigningAdminSubtitle')}</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'documents' && (
             <div className="max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
               {myProperties.length === 0 ? (
                 <div className="bg-white rounded-xl shadow-sm p-10 text-center border border-gray-200">
                   <FileText className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                   <p className="text-gray-600">{t('noDocumentsNoProperties')}</p>
                 </div>
               ) : (
                 <div className="space-y-4">
                   <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                     <div>
                      <h2 className="text-lg font-bold text-gray-900">{t('documentsByPropertyTitle')}</h2>
                      <p className="text-sm text-gray-500">{t('documentsByPropertySubtitle')}</p>
                     </div>

                     <div className="flex items-center gap-2">
                      <label className="text-sm text-gray-600">{t('documentsPropertyLabel')}</label>
                       <select
                         className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                         value={selectedPropertyId}
                         onChange={(e) => setSelectedPropertyId(e.target.value)}
                       >
                         {myProperties.map((p: any) => (
                           <option key={p.id} value={p.id}>
                             {p.title}
                           </option>
                         ))}
                       </select>
                     </div>
                   </div>

                   {selectedPropertyId && (
                     <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                       <DocumentManager propertyId={selectedPropertyId} />
                     </div>
                   )}
                 </div>
               )}
             </div>
          )}

          {activeTab === 'contractor' && (
            <div className="max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
              {myProperties.length === 0 ? (
                <div className="bg-white rounded-xl shadow-sm p-10 text-center border border-gray-200">
                  <Archive className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-600">{t('requestContractorNoProperties')}</p>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-lg font-bold text-gray-900">{t('requestContractorTitle')}</h2>
                      <p className="text-sm text-gray-500">{t('requestContractorSubtitle')}</p>
                    </div>

                    <div className="flex items-center gap-2">
                      <label className="text-sm text-gray-600">{t('requestContractorPropertyLabel')}</label>
                      <select
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                        value={selectedPropertyId}
                        onChange={(e) => setSelectedPropertyId(e.target.value)}
                      >
                        {myProperties.map((p: any) => (
                          <option key={p.id} value={p.id}>
                            {p.title}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <form onSubmit={handleSubmitRequest} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-5">
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-2">{t('requestContractorServicesLabel')}</label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {contractorServiceOptions.map((opt) => (
                          <label
                            key={opt.value}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm cursor-pointer ${
                              requestServices.includes(opt.value) ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-gray-300'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={requestServices.includes(opt.value)}
                              onChange={() => toggleRequestService(opt.value)}
                            />
                            {t(opt.labelKey as any)}
                          </label>
                        ))}
                      </div>
                      {requestServices.length === 0 && (
                        <p className="text-xs text-red-600 mt-2">{t('requestContractorServicesRequired')}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-2">{t('requestContractorDescriptionLabel')}</label>
                      <textarea
                        value={requestDescription}
                        onChange={(e) => setRequestDescription(e.target.value)}
                        maxLength={2000}
                        rows={5}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder={t('requestContractorDescriptionPlaceholder')}
                        required
                      />
                      <p className="text-xs text-gray-400 mt-1">
                        {requestDescription.length}/2000
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">{t('requestContractorUrgencyLabel')}</label>
                        <select
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                          value={requestUrgency}
                          onChange={(e) => setRequestUrgency(e.target.value as any)}
                        >
                          <option value="low">{t('urgencyLow')}</option>
                          <option value="medium">{t('urgencyMedium')}</option>
                          <option value="high">{t('urgencyHigh')}</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">{t('requestContractorPreferredDateLabel')}</label>
                        <input
                          type="date"
                          value={requestPreferredDate}
                          onChange={(e) => setRequestPreferredDate(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-2">{t('requestContractorBudgetLabel')}</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={requestBudgetEstimated}
                        onChange={(e) => setRequestBudgetEstimated(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                        placeholder={t('requestContractorBudgetPlaceholder')}
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={requestSubmitting || requestServices.length === 0}
                      className="w-full bg-primary text-white py-3 rounded-lg font-bold hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {requestSubmitting && <Loader2 className="animate-spin h-4 w-4" />}
                      {t('requestContractorSubmit')}
                    </button>
                  </form>

                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
                      <div>
                        <h3 className="font-bold text-gray-900">{t('requestContractorHistoryTitle')}</h3>
                        <p className="text-sm text-gray-500">{t('requestContractorHistorySubtitle')}</p>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <select
                          value={requestStatusFilter}
                          onChange={(e) => {
                            setRequestHistoryPage(1);
                            setRequestStatusFilter(e.target.value as any);
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
                            setRequestHistoryPage(1);
                            setRequestFrom(e.target.value);
                          }}
                          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                        />
                        <input
                          type="date"
                          value={requestTo}
                          onChange={(e) => {
                            setRequestHistoryPage(1);
                            setRequestTo(e.target.value);
                          }}
                          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                        />
                      </div>
                    </div>

                    {requestHistoryLoading ? (
                      <div className="flex justify-center items-center p-8">
                        <Loader2 className="animate-spin h-6 w-6 text-primary" />
                      </div>
                    ) : requestHistory.length > 0 ? (
                      <div className="space-y-3">
                        {requestHistory.map((r: any) => (
                          <div key={r.id} className="border border-gray-200 rounded-lg p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-sm font-bold text-gray-900">{t('requestLabel')} #{String(r.id).slice(0, 8)}</p>
                                <p className="text-xs text-gray-500 mt-1 whitespace-pre-line">{r.description}</p>
                                {Array.isArray(r.services) && r.services.length > 0 && (
                                  <p className="text-xs text-gray-500 mt-2">
                                    {t('servicesLabel')}: {r.services.join(', ')}
                                  </p>
                                )}
                              </div>
                              <span className="px-3 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-700 whitespace-nowrap">
                                {r.status === 'pending'
                                  ? t('statusPending')
                                  : r.status === 'in_review'
                                    ? t('statusInReview')
                                    : r.status === 'assigned'
                                      ? t('statusAssigned')
                                      : r.status === 'in_progress'
                                        ? t('statusInProgress')
                                        : r.status === 'completed'
                                          ? t('statusCompleted')
                                          : t('statusCancelled')}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center text-gray-500 py-8">{t('requestContractorNoHistory')}</div>
                    )}

                    {requestHistoryTotal > 10 && (
                      <div className="flex items-center justify-center gap-3 mt-6">
                        <button
                          type="button"
                          onClick={() => setRequestHistoryPage((p) => Math.max(1, p - 1))}
                          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white hover:bg-gray-50"
                          disabled={requestHistoryPage <= 1}
                        >
                          {t('prev')}
                        </button>
                        <span className="text-sm text-gray-600">
                          {t('page')} {requestHistoryPage} {t('of')} {Math.max(1, Math.ceil(requestHistoryTotal / 10))}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setRequestHistoryPage((p) => Math.min(Math.ceil(requestHistoryTotal / 10), p + 1))
                          }
                          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white hover:bg-gray-50"
                          disabled={requestHistoryPage >= Math.ceil(requestHistoryTotal / 10)}
                        >
                          {t('next')}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
              <h1 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                <CreditCard className="text-primary" />
                {t('settings')}
              </h1>

              {/* Stripe Payment Method Section */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-8">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                  <h3 className="font-bold text-lg text-gray-800">{t('paymentMethodTitle')}</h3>
                  <div className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1">
                    <Lock size={12} /> {t('stripeSecureBadge')}
                  </div>
                </div>
                
                <div className="p-6">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="bg-slate-800 text-white p-4 rounded-xl shadow-md w-16 h-10 flex items-center justify-center">
                      <CreditCard />
                    </div>
                    <div>
                      <p className="font-bold text-gray-900">{t('cardEnding')}</p>
                      <p className="text-sm text-gray-500">{t('cardExpires')}</p>
                    </div>
                    <button className="ml-auto text-primary hover:text-primary/80 text-sm font-medium underline">
                      {t('edit')}
                    </button>
                  </div>

                  <button 
                    className="w-full bg-slate-900 text-white py-3 rounded-lg font-bold hover:bg-slate-800 transition-colors flex items-center justify-center gap-2"
                    onClick={handleStripePortal}
                  >
                    <Settings size={18} />
                    {t('manageStripePayments')}
                  </button>
                  <p className="text-xs text-center text-gray-400 mt-3">
                    {t('stripeRedirectNote')}
                  </p>
                </div>
              </div>

              {/* Active Subscription Section */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-6 border-b border-gray-100 bg-gray-50">
                   <h3 className="font-bold text-lg text-gray-800">{t('subscriptionTitle')}</h3>
                   <p className="text-xs text-gray-500">{t('subscriptionSubtitle')}</p>
                </div>
                <div className="p-6">
                  {/* Property Cost Breakdown */}
                  {myProperties.map((p: any) => (
                    <div key={p.id} className="flex justify-between items-center mb-4 pb-4 border-b border-gray-100 last:border-0 last:mb-0 last:pb-0">
                      <div>
                        <h4 className="font-bold text-base text-gray-900">{p.title}</h4>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-xs px-2 py-0.5 rounded font-bold uppercase ${
                            (p.contract_status === 'signed' || p.contract_status === 'active') ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                          }`}>
                            {t('contractPrefix')}
                            {p.contract_status === 'signed'
                              ? t('contractSigned')
                              : p.contract_status === 'active'
                                ? t('contractActive')
                                : t('contractPending')}
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-lg text-primary">{formatCurrency(parseFloat(p.monthly_fee) || 0)}</p>
                        <p className="text-xs text-gray-400">{t('perMonth')}</p>
                      </div>
                    </div>
                  ))}

                  <div className="mt-6 bg-gray-50 p-4 rounded-lg flex justify-between items-center">
                    <span className="font-bold text-gray-700">{t('totalMonthlyEstimate')}</span>
                    <span className="font-bold text-xl text-gray-900">
                      {formatCurrency(myProperties.reduce((acc: number, curr: any) => acc + (parseFloat(curr.monthly_fee) || 0), 0))}
                    </span>
                  </div>
                  
                  <div className="mt-4 bg-blue-50 p-3 rounded text-xs text-blue-700">
                    <p>{t('billingNote')}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    );

  }

  // Login View (Logged Out)
  return (
    <div className="min-h-screen bg-background flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-6 bg-white p-8 rounded-xl shadow-lg border border-border text-center">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-primary">{t('loginTitle')}</h2>
          <p className="mt-2 text-sm text-text-secondary">{t('loginSubtitle')}</p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-700 p-4 rounded-md text-sm text-center">
            {error}
          </div>
        )}

        <Link
          to="/auth"
          className="inline-flex w-full items-center justify-center gap-2 bg-primary text-white font-bold py-3 rounded-md hover:bg-opacity-90 transition-colors"
        >
          {t('loginButton')}
        </Link>
      </div>
    </div>
  );
}
