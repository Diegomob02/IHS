-- Seed 20 mock properties
-- We will link them to 'admin@ihs.com' via email, but leave owner_id NULL to avoid FK violations with auth.users

DO $$
DECLARE
  v_counter INTEGER := 1;
BEGIN
  -- 2. Insert 20 properties
  FOR v_counter IN 1..20 LOOP
    INSERT INTO public.properties (
      title,
      location,
      owner_id, -- Leave NULL to avoid FK constraint error against auth.users
      owner_email,
      property_type,
      price,
      is_available,
      images,
      services,
      monthly_fee,
      contract_status,
      created_at
    ) VALUES (
      'Propiedad Demo ' || v_counter,
      CASE (v_counter % 5)
        WHEN 0 THEN 'Cabo San Lucas, Centro'
        WHEN 1 THEN 'San José del Cabo, Hotel Zone'
        WHEN 2 THEN 'Corredor Turístico Km ' || (10 + v_counter)
        WHEN 3 THEN 'La Paz, Malecón'
        ELSE 'Todos Santos, Playa'
      END,
      NULL, -- No auth user linked yet
      'admin@ihs.com', -- Default to admin email so you can see them in your "My Properties" view if filtering by email
      'residential',
      (250000 + (v_counter * 10000)), -- Price
      true,
      jsonb_build_array(
        'https://coreva-normal.trae.ai/api/ide/v1/text_to_image?prompt=Luxury%20home%20' || v_counter || '%20architecture&image_size=landscape_16_9'
      ),
      jsonb_build_object(
        'hvac', (v_counter % 2 = 0),
        'pool', (v_counter % 3 = 0),
        'gardening', true,
        'pestControl', (v_counter % 4 = 0),
        'cleaning', true,
        'concierge', (v_counter % 5 = 0)
      ),
      (150 + (v_counter * 10)), -- Monthly Fee
      CASE (v_counter % 3)
        WHEN 0 THEN 'active'
        WHEN 1 THEN 'signed'
        ELSE 'pending'
      END,
      NOW() - (v_counter || ' days')::interval -- Stagger dates
    );
  END LOOP;
END $$;
;
