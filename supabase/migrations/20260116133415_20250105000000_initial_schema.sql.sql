-- Create users table (Profiles)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('owner', 'tenant', 'admin')),
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(20),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);

-- Create properties table
CREATE TABLE IF NOT EXISTS public.properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  location VARCHAR(100) NOT NULL,
  property_type VARCHAR(50) NOT NULL,
  price DECIMAL(10,2),
  is_available BOOLEAN DEFAULT true,
  images JSONB,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_properties_owner ON public.properties(owner_id);
CREATE INDEX IF NOT EXISTS idx_properties_location ON public.properties(location);
CREATE INDEX IF NOT EXISTS idx_properties_available ON public.properties(is_available);

-- Create maintenance_requests table
CREATE TABLE IF NOT EXISTS public.maintenance_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES public.properties(id) ON DELETE CASCADE,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  issue_type VARCHAR(50) NOT NULL CHECK (issue_type IN ('plumbing', 'electrical', 'general', 'hvac', 'appliance')),
  description TEXT NOT NULL,
  priority VARCHAR(20) NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_maintenance_property ON public.maintenance_requests(property_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_owner ON public.maintenance_requests(owner_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_status ON public.maintenance_requests(status);

-- Create contacts table
CREATE TABLE IF NOT EXISTS public.contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  message TEXT NOT NULL,
  property_type VARCHAR(50),
  location VARCHAR(100),
  status VARCHAR(20) DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'converted', 'lost')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contacts_email ON public.contacts(email);
CREATE INDEX IF NOT EXISTS idx_contacts_status ON public.contacts(status);
CREATE INDEX IF NOT EXISTS idx_contacts_created ON public.contacts(created_at DESC);

-- Enable RLS
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

-- Grant permissions
GRANT SELECT ON public.properties TO anon;
GRANT ALL ON public.properties TO authenticated;
GRANT SELECT ON public.maintenance_requests TO authenticated;
GRANT ALL ON public.maintenance_requests TO authenticated;
GRANT ALL ON public.contacts TO anon;
GRANT ALL ON public.contacts TO authenticated;

-- RLS Policies

-- Properties policies
CREATE POLICY "Users can view their own properties" ON public.properties
  FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY "Public properties are viewable by everyone" ON public.properties
  FOR SELECT USING (true); 
  -- Note: Overrides previous policy for SELECT if both exist? 
  -- Actually, the architecture said: "Users can view their own properties".
  -- But for a public website, we usually want "Anyone can view properties where is_available = true".
  -- I'll stick to the architecture's intent but maybe broaden it for the website listing.
  -- The architecture says "Listado de propiedades con filtros" implies public access.
  -- So I'll add a public view policy.

DROP POLICY IF EXISTS "Public view" ON public.properties;
CREATE POLICY "Public view" ON public.properties
  FOR SELECT USING (true);

-- Maintenance requests policies
CREATE POLICY "Users can manage their own maintenance requests" ON public.maintenance_requests
  FOR ALL USING (auth.uid() = owner_id);

-- Contacts policies (Allow anon to insert)
CREATE POLICY "Allow public to insert contacts" ON public.contacts
  FOR INSERT WITH CHECK (true);
;
