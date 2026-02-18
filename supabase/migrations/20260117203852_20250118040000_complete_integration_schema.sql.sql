-- Create documents table
CREATE TABLE IF NOT EXISTS public.documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id UUID REFERENCES public.properties(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL, -- 'contract', 'invoice', 'report', 'other'
    current_version INT DEFAULT 1,
    created_by UUID REFERENCES public.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    is_archived BOOLEAN DEFAULT FALSE
);

-- Create document_versions table
CREATE TABLE IF NOT EXISTS public.document_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES public.documents(id) ON DELETE CASCADE,
    version_number INT NOT NULL,
    file_path TEXT NOT NULL,
    file_size BIGINT,
    mime_type TEXT,
    uploaded_by UUID REFERENCES public.users(id),
    change_log TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(document_id, version_number)
);

-- Create document_permissions table for granular access
CREATE TABLE IF NOT EXISTS public.document_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES public.documents(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    permission_level TEXT NOT NULL CHECK (permission_level IN ('view', 'edit', 'admin')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(document_id, user_id)
);

-- Create app_settings table for Super Admin
CREATE TABLE IF NOT EXISTS public.app_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    category TEXT DEFAULT 'general',
    updated_by UUID REFERENCES public.users(id),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create audit_logs table
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID,
    details JSONB,
    ip_address TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT DEFAULT 'info' CHECK (type IN ('info', 'warning', 'success', 'error')),
    link TEXT,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on all new tables
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Documents: 
-- Admins can do everything
-- Owners can view/edit if they are the owner of the property or have permission
-- Users with specific permissions can access

CREATE POLICY "Admins have full access to documents" ON public.documents
    FOR ALL USING (public.is_admin());

CREATE POLICY "Users can view documents they have permission for" ON public.documents
    FOR SELECT USING (
        public.is_admin() OR
        EXISTS (
            SELECT 1 FROM public.document_permissions 
            WHERE document_id = public.documents.id AND user_id = auth.uid()
        ) OR
        (property_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.properties 
            WHERE id = property_id AND owner_id = auth.uid()
        ))
    );

-- Document Versions: similar to documents
CREATE POLICY "Admins have full access to document_versions" ON public.document_versions
    FOR ALL USING (public.is_admin());

CREATE POLICY "Users can view versions of documents they have access to" ON public.document_versions
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.documents d
            LEFT JOIN public.document_permissions dp ON dp.document_id = d.id
            LEFT JOIN public.properties p ON p.id = d.property_id
            WHERE d.id = document_versions.document_id 
            AND (
                public.is_admin() OR 
                dp.user_id = auth.uid() OR 
                p.owner_id = auth.uid()
            )
        )
    );

-- Document Permissions
CREATE POLICY "Admins have full access to permissions" ON public.document_permissions
    FOR ALL USING (public.is_admin());

CREATE POLICY "Users can view their own permissions" ON public.document_permissions
    FOR SELECT USING (user_id = auth.uid());

-- App Settings
CREATE POLICY "Admins have full access to settings" ON public.app_settings
    FOR ALL USING (public.is_admin());

CREATE POLICY "Authenticated users can view public settings" ON public.app_settings
    FOR SELECT USING (auth.role() = 'authenticated'); -- Or maybe restrict to only admins? Let's allow read for now.

-- Audit Logs
CREATE POLICY "Admins can view all audit logs" ON public.audit_logs
    FOR SELECT USING (public.is_admin());

CREATE POLICY "Users can view their own audit logs" ON public.audit_logs
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "System can insert audit logs" ON public.audit_logs
    FOR INSERT WITH CHECK (true);

-- Notifications
CREATE POLICY "Users can view and update their own notifications" ON public.notifications
    FOR ALL USING (user_id = auth.uid());

-- Add Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.documents;
ALTER PUBLICATION supabase_realtime ADD TABLE public.app_settings;
;
