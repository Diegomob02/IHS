# IHS - Integrated Home Solutions

Plataforma de gestión de propiedades y servicios de mantenimiento.

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Estilos**: Tailwind CSS
- **Backend**: Supabase (Auth, Database, Storage, Edge Functions)
- **Pagos**: Stripe
- **Despliegue**: Vercel

## Variables de Entorno

Copia `.env.example` a `.env` y configura:

```
VITE_SUPABASE_URL=tu_supabase_url
VITE_SUPABASE_ANON_KEY=tu_supabase_anon_key
```

## Desarrollo Local

```bash
npm install
npm run dev
```

## Despliegue

El proyecto se despliega automáticamente a Vercel desde la rama `main`.
