-- Solo una cuenta principal. Ejecutar desde SQL Editor con el rol postgres.
-- No concede permisos de administración a las cuentas nuevas.
begin;
create table if not exists public.user_administration (
  id integer primary key check (id = 1),
  user_id uuid not null unique references public.operators(user_id) on delete cascade
);
alter table public.user_administration enable row level security;
revoke all on public.user_administration from anon, authenticated;
grant select on public.user_administration to authenticated;
drop policy if exists administrator_self_read on public.user_administration;
create policy administrator_self_read on public.user_administration for select to authenticated
  using (user_id = (select auth.uid()));
grant select on public.user_administration to service_role;
grant select, insert, update, delete on public.operators to service_role;
-- Cuenta principal confirmada por la organización. Nunca se toma del formulario web.
do $$
declare principal uuid;
begin
  select id into principal from auth.users where lower(email) = 'bladimirduarte30@gmail.com';
  if principal is null then
    raise exception 'La cuenta principal debe existir en Authentication antes de ejecutar esta actualización.';
  end if;
  insert into public.operators(user_id) values(principal) on conflict do nothing;
  insert into public.user_administration(id, user_id) values(1, principal)
    on conflict(id) do update set user_id = excluded.user_id;
end $$;
commit;
