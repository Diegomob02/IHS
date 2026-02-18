ALTER TABLE public.properties 
ADD COLUMN IF NOT EXISTS services JSONB DEFAULT '{"hvac": false, "pool": false, "gardening": false, "pestControl": false, "cleaning": false, "concierge": false}'::jsonb;
;
