-- Ejecutar completo en Supabase > SQL Editor. No borra datos existentes.
-- Las cuentas se crean aparte en Authentication y se autorizan en operators.
begin;

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  goal_cents bigint not null default 10000000 check (goal_cents between 1 and 10000000000),
  total_cents bigint not null default 0 check (total_cents between 0 and 9007199254740991),
  donation_count integer not null default 0 check (donation_count >= 0),
  last_donation jsonb,
  created_at timestamptz not null default now()
);
create table if not exists public.app_settings (
  id integer primary key check (id = 1),
  current_event_id uuid not null references public.events(id)
);
create table if not exists public.donations (
  id uuid primary key,
  event_id uuid not null references public.events(id),
  amount_cents bigint not null check (amount_cents between 1 and 10000000000),
  donor_name text not null check (char_length(donor_name) between 1 and 80),
  message text not null default '' check (char_length(message) <= 240),
  created_at timestamptz not null default now()
);
create index if not exists donations_event_recent_idx on public.donations(event_id, created_at desc, id desc);
create table if not exists public.operators (
  user_id uuid primary key references auth.users(id) on delete cascade
);

-- Inicialización idempotente: repetir este archivo conserva el evento actual.
do $$
declare new_event uuid;
begin
  if not exists (select 1 from public.app_settings where id = 1) then
    insert into public.events default values returning id into new_event;
    insert into public.app_settings(id, current_event_id) values (1, new_event);
  end if;
end $$;

alter table public.events enable row level security;
alter table public.app_settings enable row level security;
alter table public.donations enable row level security;
alter table public.operators enable row level security;

-- Revocar escrituras directas: incluso los operadores usan funciones atómicas.
revoke all on public.events, public.app_settings, public.donations, public.operators from anon, authenticated;
grant select on public.events, public.app_settings, public.donations to anon, authenticated;
grant select on public.operators to authenticated;

drop policy if exists event_public_read on public.events;
create policy event_public_read on public.events for select to anon, authenticated using (true);
drop policy if exists settings_public_read on public.app_settings;
create policy settings_public_read on public.app_settings for select to anon, authenticated using (true);
drop policy if exists donation_public_read on public.donations;
create policy donation_public_read on public.donations for select to anon, authenticated using (true);
drop policy if exists operator_self_read on public.operators;
create policy operator_self_read on public.operators for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.register_donation(
  p_id uuid, p_event_id uuid, p_amount_cents bigint, p_donor_name text, p_message text
) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare active_event uuid; item public.donations%rowtype;
begin
  if auth.uid() is null or not exists(select 1 from public.operators where user_id = auth.uid()) then
    raise exception 'Operador no autorizado' using errcode = '42501';
  end if;
  if p_id is null or p_event_id is null or p_amount_cents is null or p_amount_cents not between 1 and 10000000000 then
    raise exception 'Monto o identificador no válido' using errcode = '22023';
  end if;
  if char_length(coalesce(p_donor_name,'')) > 80 or char_length(coalesce(p_message,'')) > 240 then
    raise exception 'Nombre o mensaje demasiado largo' using errcode = '22023';
  end if;
  select current_event_id into active_event from public.app_settings where id = 1 for update;
  -- El mismo ID solo puede contabilizarse una vez, incluso después de un reinicio.
  select * into item from public.donations where id = p_id;
  if found then
    if item.event_id <> p_event_id or item.amount_cents <> p_amount_cents
      or item.donor_name <> coalesce(nullif(btrim(p_donor_name),''),'Anónimo')
      or item.message <> coalesce(p_message,'') then
      raise exception 'El identificador ya corresponde a otro aporte' using errcode = '22023';
    end if;
    return;
  end if;
  if active_event is null or active_event <> p_event_id then
    raise exception 'El evento cambió. Recarga los datos antes de enviar.' using errcode = '22023';
  end if;
  insert into public.donations(id,event_id,amount_cents,donor_name,message)
    values (p_id,active_event,p_amount_cents,coalesce(nullif(btrim(p_donor_name),''),'Anónimo'),coalesce(p_message,''))
    returning * into item;
  update public.events set total_cents = total_cents + item.amount_cents,
    donation_count = donation_count + 1,
    last_donation = jsonb_build_object('id',item.id,'amountCents',item.amount_cents,'name',item.donor_name,'message',item.message,'createdAt',item.created_at)
    where id = active_event;
end $$;

create or replace function public.set_event_goal(p_event_id uuid, p_goal_cents bigint)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
declare active_event uuid;
begin
  if auth.uid() is null or not exists(select 1 from public.operators where user_id = auth.uid()) then
    raise exception 'Operador no autorizado' using errcode = '42501';
  end if;
  if p_goal_cents is null or p_goal_cents not between 1 and 10000000000 then
    raise exception 'Meta no válida' using errcode = '22023';
  end if;
  select current_event_id into active_event from public.app_settings where id = 1 for update;
  if active_event is null or p_event_id is null or active_event <> p_event_id then
    raise exception 'El evento cambió. Recarga los datos.' using errcode = '22023';
  end if;
  update public.events set goal_cents = p_goal_cents where id = active_event;
end $$;

create or replace function public.reset_event(p_event_id uuid)
returns uuid language plpgsql security definer set search_path = public, pg_temp
as $$
declare active_event uuid; new_event uuid; current_goal bigint;
begin
  if auth.uid() is null or not exists(select 1 from public.operators where user_id = auth.uid()) then
    raise exception 'Operador no autorizado' using errcode = '42501';
  end if;
  select current_event_id into active_event from public.app_settings where id = 1 for update;
  if active_event is null or p_event_id is null or active_event <> p_event_id then
    raise exception 'El evento cambió. Recarga los datos.' using errcode = '22023';
  end if;
  select goal_cents into current_goal from public.events where id = active_event;
  insert into public.events(goal_cents) values (current_goal) returning id into new_event;
  update public.app_settings set current_event_id = new_event where id = 1;
  return new_event;
end $$;

revoke all on function public.register_donation(uuid, uuid, bigint, text, text) from public, anon;
revoke all on function public.set_event_goal(uuid, bigint) from public, anon;
revoke all on function public.reset_event(uuid) from public, anon;
grant execute on function public.register_donation(uuid, uuid, bigint, text, text) to authenticated;
grant execute on function public.set_event_goal(uuid, bigint) to authenticated;
grant execute on function public.reset_event(uuid) to authenticated;

-- Una sola consulta devuelve total e historial del mismo snapshot de PostgreSQL.
create or replace function public.get_event_snapshot()
returns jsonb language sql stable security invoker set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'event', to_jsonb(e),
    'donations', coalesce((select jsonb_agg(to_jsonb(d) order by d.created_at desc, d.id desc)
      from (select * from public.donations where event_id = e.id order by created_at desc, id desc limit 30) d), '[]'::jsonb)
  ) from public.app_settings s join public.events e on e.id = s.current_event_id where s.id = 1;
$$;
revoke all on function public.get_event_snapshot() from public;
grant execute on function public.get_event_snapshot() to anon, authenticated;

-- Sincronización: solo las tablas cuyo cambio requiere refrescar el proyector.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'events') then
    alter publication supabase_realtime add table public.events;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'app_settings') then
    alter publication supabase_realtime add table public.app_settings;
  end if;
end $$;
commit;
