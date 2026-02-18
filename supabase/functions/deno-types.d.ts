declare module "https://deno.land/std@0.168.0/http/server.ts" {
  export function serve(handler: (req: Request) => Response | Promise<Response>): void;
}

declare module "https://esm.sh/@supabase/supabase-js@2.0.0" {
  export function createClient(url: string, key: string, options?: any): any;
}

declare module "https://esm.sh/@supabase/supabase-js@2.45.0" {
  export function createClient(url: string, key: string, options?: any): any;
}

declare module "https://esm.sh/stripe@12.0.0?target=deno" {
  const Stripe: any;
  export default Stripe;
}

declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};
