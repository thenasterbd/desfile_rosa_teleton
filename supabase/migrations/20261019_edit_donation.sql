-- Ejecutar en Supabase > SQL Editor. Conserva todos los aportes.
begin;
create or replace function public.edit_donation(
  p_id uuid, p_event_id uuid, p_amount_cents bigint, p_donor_name text, p_message text, p_expected jsonb
) returns void language plpgsql security definer set search_path = public, pg_temp
as $$
declare active_event uuid; item public.donations%rowtype; previous_amount bigint; desired jsonb; current_value jsonb;
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
revoke all on function public.edit_donation(uuid, uuid, bigint, text, text, jsonb) from public, anon;
grant execute on function public.edit_donation(uuid, uuid, bigint, text, text, jsonb) to authenticated;
commit;
