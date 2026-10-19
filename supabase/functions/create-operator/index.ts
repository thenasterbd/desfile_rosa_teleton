import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.118.0';
import { createOperatorHandler } from './handler.js';

Deno.serve(createOperatorHandler({
  createClient,
  url: Deno.env.get('SUPABASE_URL'),
  serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
  allowedOrigins: (Deno.env.get('ALLOWED_ORIGINS') || 'https://thenasterbd.github.io')
    .split(',').map(value => value.trim()).filter(Boolean)
}));
