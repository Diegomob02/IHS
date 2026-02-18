-- Fix RLS policies to allow owners to view documents based on owner_email match as well
-- This is necessary when properties are assigned by email but owner_id is not yet linked

DROP POLICY IF EXISTS "Users can view documents they have permission for" ON public.documents;

CREATE POLICY "Users can view documents they have permission for" ON public.documents
    FOR SELECT USING (
        public.is_admin() OR
        EXISTS (
            SELECT 1 FROM public.document_permissions 
            WHERE document_id = public.documents.id AND user_id = auth.uid()
        ) OR
        (property_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.properties 
            WHERE id = property_id 
            AND (owner_id = auth.uid() OR owner_email = (auth.jwt() ->> 'email'))
        ))
    );

DROP POLICY IF EXISTS "Users can view versions of documents they have access to" ON public.document_versions;

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
                p.owner_id = auth.uid() OR
                p.owner_email = (auth.jwt() ->> 'email')
            )
        )
    );
;
