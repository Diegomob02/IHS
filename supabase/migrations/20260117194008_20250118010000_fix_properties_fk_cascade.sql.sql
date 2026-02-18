-- Change properties.owner_id FK to point to public.users instead of auth.users
ALTER TABLE public.properties DROP CONSTRAINT IF EXISTS properties_owner_id_fkey;

ALTER TABLE public.properties
  ADD CONSTRAINT properties_owner_id_fkey
  FOREIGN KEY (owner_id)
  REFERENCES public.users(id)
  ON UPDATE CASCADE
  ON DELETE SET NULL;

-- Also ensure leads FK has cascade update
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_assigned_to_fkey;
ALTER TABLE public.leads
  ADD CONSTRAINT leads_assigned_to_fkey
  FOREIGN KEY (assigned_to)
  REFERENCES public.users(id)
  ON UPDATE CASCADE
  ON DELETE SET NULL;

-- Also ensure financial_records FK has cascade update (if it exists)
ALTER TABLE public.financial_records DROP CONSTRAINT IF EXISTS financial_records_owner_id_fkey;
ALTER TABLE public.financial_records
  ADD CONSTRAINT financial_records_owner_id_fkey
  FOREIGN KEY (owner_id)
  REFERENCES public.users(id)
  ON UPDATE CASCADE
  ON DELETE SET NULL;
;
