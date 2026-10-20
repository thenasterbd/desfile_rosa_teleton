-- Conserva usuarios y aportes. Ejecutar completo desde SQL Editor.
begin;
alter table public.operators add column if not exists is_active boolean not null default true;
grant select, insert, update, delete on public.operators to service_role;
drop policy if exists operator_self_read on public.operators;
create policy operator_self_read on public.operators for select to authenticated
  using (user_id = (select auth.uid()) and is_active);

create or replace function public.register_donation(
  p_id uuid, p_event_id uuid, p_amount_cents bigint, p_donor_name text, p_message text
) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare active_event uuid; item public.donations%rowtype;
begin
  if auth.uid() is null or not exists(select 1 from public.operators where user_id = auth.uid() and is_active) then
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
  if auth.uid() is null or not exists(select 1 from public.operators where user_id = auth.uid() and is_active) then
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
  if auth.uid() is null or not exists(select 1 from public.operators where user_id = auth.uid() and is_active) then
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

create or replace function public.edit_donation(
  p_id uuid, p_event_id uuid, p_amount_cents bigint, p_donor_name text, p_message text, p_expected jsonb
) returns void language plpgsql security definer set search_path = public, pg_temp
as $$
declare active_event uuid; item public.donations%rowtype; previous_amount bigint; desired jsonb; current_value jsonb;
begin
  if auth.uid() is null or not exists(select 1 from public.operators where user_id = auth.uid() and is_active) then
    raise exception 'Operador no autorizado' using errcode = '42501';
  end if;
  if p_id is null or p_event_id is null or p_amount_cents is null or p_amount_cents not between 1 and 10000000000 then
    raise exception 'Monto o identificador no válido' using errcode = '22023';
  end if;
  if char_length(coalesce(p_donor_name,'')) > 80 or char_length(coalesce(p_message,'')) > 240 then
    raise exception 'Nombre o mensaje demasiado largo' using errcode = '22023';
  end if;
  -- Mismo bloqueo que registro y reinicio: el total siempre cambia de forma atómica.
  select current_event_id into active_event from public.app_settings where id = 1 for update;
  if active_event is null or active_event <> p_event_id then
    raise exception 'El evento cambió. Vuelve a abrir el aporte.' using errcode = '22023';
  end if;
  select * into item from public.donations where id = p_id and event_id = active_event for update;
  if not found then
    raise exception 'El aporte ya no está disponible.' using errcode = '22023';
  end if;
  desired := jsonb_build_object('amountCents',p_amount_cents,'name',coalesce(nullif(btrim(p_donor_name),''),'Anónimo'),'message',coalesce(p_message,''));
  current_value := jsonb_build_object('amountCents',item.amount_cents,'name',item.donor_name,'message',item.message);
  -- Reintentar una edición ya confirmada no vuelve a modificar el total.
  if current_value = desired then return; end if;
  if p_expected is null or current_value <> p_expected then
    raise exception 'Otro operador modificó este aporte. Ciérralo y vuelve a abrirlo para ver los cambios.' using errcode = '22023';
  end if;
  previous_amount := item.amount_cents;
  update public.donations set amount_cents = p_amount_cents,
    donor_name = desired->>'name', message = desired->>'message'
    where id = p_id returning * into item;
  update public.events set total_cents = total_cents + item.amount_cents - previous_amount,
    last_donation = case when last_donation->>'id' = item.id::text then
      jsonb_build_object('id',item.id,'amountCents',item.amount_cents,'name',item.donor_name,'message',item.message,'createdAt',item.created_at)
      else last_donation end
    where id = active_event;
end $$;

create or replace function public.delete_donation(p_id uuid, p_event_id uuid, p_expected jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
declare active_event uuid; item public.donations%rowtype; latest public.donations%rowtype;
begin
  if auth.uid() is null or not exists(select 1 from public.operators where user_id = auth.uid() and is_active) then
    raise exception 'Operador no autorizado' using errcode = '42501';
  end if;
  if p_id is null or p_event_id is null then
    raise exception 'Identificador no válido' using errcode = '22023';
  end if;
  select current_event_id into active_event from public.app_settings where id = 1 for update;
  if active_event is null or active_event <> p_event_id then
    raise exception 'El evento cambió. Vuelve a abrir el aporte.' using errcode = '22023';
  end if;
  select * into item from public.donations where id = p_id and event_id = active_event for update;
  -- Un reintento de una eliminación confirmada no vuelve a descontar el monto.
  if not found then return; end if;
  if p_expected is null or p_expected <> jsonb_build_object('amountCents',item.amount_cents,'name',item.donor_name,'message',item.message) then
    raise exception 'El aporte fue modificado. Cierra esta ventana y vuelve a abrirlo antes de eliminarlo.' using errcode = '22023';
  end if;
  delete from public.donations where id = item.id;
  select * into latest from public.donations where event_id = active_event order by created_at desc, id desc limit 1;
  update public.events set total_cents = total_cents - item.amount_cents,
    donation_count = donation_count - 1,
    last_donation = case when latest.id is null then null else
      jsonb_build_object('id',latest.id,'amountCents',latest.amount_cents,'name',latest.donor_name,'message',latest.message,'createdAt',latest.created_at) end
    where id = active_event;
end $$;
revoke all on function public.delete_donation(uuid, uuid, jsonb) from public, anon;
grant execute on function public.delete_donation(uuid, uuid, jsonb) to authenticated;
commit;
