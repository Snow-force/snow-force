grant insert, update on public.merchant_profiles to authenticated;

create policy "Merchant owners can create own profile"
  on public.merchant_profiles
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "Merchant owners can update own profile"
  on public.merchant_profiles
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create function public.save_event_aggregate(
  p_core jsonb,
  p_questions jsonb,
  p_modules jsonb,
  p_merchant_booth_program jsonb
)
returns public.events
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_event public.events%rowtype;
  v_program_id uuid;
  v_event_slug text;
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'event aggregate saves require the service role';
  end if;

  if jsonb_typeof(p_core) <> 'object' then
    raise exception 'event core row must be a JSON object';
  end if;

  if jsonb_typeof(p_questions) <> 'array' or jsonb_typeof(p_modules) <> 'array' then
    raise exception 'event question and module rows must be JSON arrays';
  end if;

  v_event_slug := p_core ->> 'slug';
  if v_event_slug is null or btrim(v_event_slug) = '' then
    raise exception 'event core row requires a slug';
  end if;

  insert into public.events (
    slug,
    status,
    registration_state,
    title_zh,
    title_en,
    event_date,
    meet_time,
    meet_location_zh,
    meet_location_en,
    activity_location_zh,
    activity_location_en,
    location_url,
    cover_image,
    capacity,
    registration_close_at,
    requires_approval,
    allow_waitlist,
    allow_cancellation,
    fee_amount,
    payment_model,
    deposit_amount,
    deposit_currency,
    full_payment_amount,
    payment_instructions_zh,
    payment_instructions_en,
    waiver_text_en,
    waiver_text_sha,
    seo_title_zh,
    seo_title_en,
    seo_description_zh,
    seo_description_en
  )
  select
    core.slug,
    core.status,
    core.registration_state,
    core.title_zh,
    core.title_en,
    core.event_date,
    core.meet_time,
    core.meet_location_zh,
    core.meet_location_en,
    core.activity_location_zh,
    core.activity_location_en,
    core.location_url,
    core.cover_image,
    core.capacity,
    core.registration_close_at,
    core.requires_approval,
    core.allow_waitlist,
    core.allow_cancellation,
    core.fee_amount,
    core.payment_model,
    core.deposit_amount,
    core.deposit_currency,
    core.full_payment_amount,
    core.payment_instructions_zh,
    core.payment_instructions_en,
    core.waiver_text_en,
    core.waiver_text_sha,
    core.seo_title_zh,
    core.seo_title_en,
    core.seo_description_zh,
    core.seo_description_en
  from jsonb_to_record(p_core) as core(
    slug text,
    status text,
    registration_state text,
    title_zh text,
    title_en text,
    event_date date,
    meet_time time,
    meet_location_zh text,
    meet_location_en text,
    activity_location_zh text,
    activity_location_en text,
    location_url text,
    cover_image text,
    capacity integer,
    registration_close_at timestamptz,
    requires_approval boolean,
    allow_waitlist boolean,
    allow_cancellation boolean,
    fee_amount text,
    payment_model text,
    deposit_amount numeric,
    deposit_currency text,
    full_payment_amount numeric,
    payment_instructions_zh text,
    payment_instructions_en text,
    waiver_text_en text,
    waiver_text_sha text,
    seo_title_zh text,
    seo_title_en text,
    seo_description_zh text,
    seo_description_en text
  )
  on conflict (slug) do update
    set status = excluded.status,
        registration_state = excluded.registration_state,
        title_zh = excluded.title_zh,
        title_en = excluded.title_en,
        event_date = excluded.event_date,
        meet_time = excluded.meet_time,
        meet_location_zh = excluded.meet_location_zh,
        meet_location_en = excluded.meet_location_en,
        activity_location_zh = excluded.activity_location_zh,
        activity_location_en = excluded.activity_location_en,
        location_url = excluded.location_url,
        cover_image = excluded.cover_image,
        capacity = excluded.capacity,
        registration_close_at = excluded.registration_close_at,
        requires_approval = excluded.requires_approval,
        allow_waitlist = excluded.allow_waitlist,
        allow_cancellation = excluded.allow_cancellation,
        fee_amount = excluded.fee_amount,
        payment_model = excluded.payment_model,
        deposit_amount = excluded.deposit_amount,
        deposit_currency = excluded.deposit_currency,
        full_payment_amount = excluded.full_payment_amount,
        payment_instructions_zh = excluded.payment_instructions_zh,
        payment_instructions_en = excluded.payment_instructions_en,
        waiver_text_en = excluded.waiver_text_en,
        waiver_text_sha = excluded.waiver_text_sha,
        seo_title_zh = excluded.seo_title_zh,
        seo_title_en = excluded.seo_title_en,
        seo_description_zh = excluded.seo_description_zh,
        seo_description_en = excluded.seo_description_en
  returning * into v_event;

  delete from public.event_registration_questions
  where event_slug = v_event.slug;

  delete from public.event_detail_modules
  where event_slug = v_event.slug;

  insert into public.event_registration_questions (
    event_slug,
    question_key,
    type,
    required,
    sort_order,
    label_zh,
    label_en,
    help_zh,
    help_en,
    options_zh,
    options_en
  )
  select
    v_event.slug,
    question.question_key,
    question.type,
    question.required,
    question.sort_order,
    question.label_zh,
    question.label_en,
    question.help_zh,
    question.help_en,
    question.options_zh,
    question.options_en
  from jsonb_to_recordset(p_questions) as question(
    question_key text,
    type text,
    required boolean,
    sort_order integer,
    label_zh text,
    label_en text,
    help_zh text,
    help_en text,
    options_zh jsonb,
    options_en jsonb
  );

  insert into public.event_detail_modules (
    event_slug,
    module_type,
    display_mode,
    sort_order,
    title_zh,
    title_en,
    content_zh,
    content_en,
    items_zh,
    items_en
  )
  select
    v_event.slug,
    module.module_type,
    module.display_mode,
    module.sort_order,
    module.title_zh,
    module.title_en,
    module.content_zh,
    module.content_en,
    module.items_zh,
    module.items_en
  from jsonb_to_recordset(p_modules) as module(
    module_type text,
    display_mode text,
    sort_order integer,
    title_zh text,
    title_en text,
    content_zh text,
    content_en text,
    items_zh jsonb,
    items_en jsonb
  );

  if p_merchant_booth_program is null or jsonb_typeof(p_merchant_booth_program) = 'null' then
    update public.merchant_booth_programs
    set enabled = false,
        updated_at = now()
    where event_slug = v_event.slug;
  else
    if jsonb_typeof(p_merchant_booth_program) <> 'object'
      or jsonb_typeof(p_merchant_booth_program -> 'program') <> 'object'
      or jsonb_typeof(p_merchant_booth_program -> 'plans') <> 'array'
      or jsonb_typeof(p_merchant_booth_program -> 'booths') <> 'array' then
      raise exception 'merchant booth program rows are invalid';
    end if;

    if (p_merchant_booth_program -> 'program' ->> 'event_slug') is distinct from v_event.slug then
      raise exception 'merchant booth program belongs to another event';
    end if;

    insert into public.merchant_booth_programs (
      event_slug,
      enabled,
      payment_instructions_en,
      payment_instructions_zh
    )
    select
      v_event.slug,
      program.enabled,
      program.payment_instructions_en,
      program.payment_instructions_zh
    from jsonb_to_record(p_merchant_booth_program -> 'program') as program(
      enabled boolean,
      payment_instructions_en text,
      payment_instructions_zh text
    )
    on conflict (event_slug) do update
      set enabled = excluded.enabled,
          payment_instructions_en = excluded.payment_instructions_en,
          payment_instructions_zh = excluded.payment_instructions_zh,
          updated_at = now()
    returning id into v_program_id;

  insert into public.merchant_booth_plans (
    id,
    booth_program_id,
    name_en,
    name_zh,
    description_en,
    description_zh,
    price_amount,
    price_currency
  )
  select
    plan.id,
    v_program_id,
    plan.name_en,
    plan.name_zh,
    plan.description_en,
    plan.description_zh,
    plan.price_amount,
    plan.price_currency
  from jsonb_to_recordset(p_merchant_booth_program -> 'plans') as plan(
    id uuid,
    name_en text,
    name_zh text,
    description_en text,
    description_zh text,
    price_amount numeric,
    price_currency text
  )
  on conflict (id) do update
    set name_en = excluded.name_en,
        name_zh = excluded.name_zh,
        description_en = excluded.description_en,
        description_zh = excluded.description_zh,
        price_amount = excluded.price_amount,
        price_currency = excluded.price_currency,
        updated_at = now()
  where merchant_booth_plans.booth_program_id = excluded.booth_program_id;

  if (
    select count(*)
      from public.merchant_booth_plans
      where booth_program_id = v_program_id
      and id in (
        select id
        from jsonb_to_recordset(p_merchant_booth_program -> 'plans') as plan(id uuid)
      )
  ) <> jsonb_array_length(p_merchant_booth_program -> 'plans') then
    raise exception 'merchant booth plan belongs to another program';
  end if;

  insert into public.merchant_physical_booths (
    id,
    booth_program_id,
    booth_plan_id,
    booth_code
  )
  select booth.id, v_program_id, booth.booth_plan_id, booth.booth_code
  from jsonb_to_recordset(p_merchant_booth_program -> 'booths') as booth(
    id uuid,
    booth_plan_id uuid,
    booth_code text
  )
  on conflict (id) do update
    set booth_plan_id = excluded.booth_plan_id,
        booth_code = excluded.booth_code,
        updated_at = now()
  where merchant_physical_booths.booth_program_id = excluded.booth_program_id;

  if (
    select count(*)
      from public.merchant_physical_booths
      where booth_program_id = v_program_id
      and id in (
        select id
        from jsonb_to_recordset(p_merchant_booth_program -> 'booths') as booth(id uuid)
      )
  ) <> jsonb_array_length(p_merchant_booth_program -> 'booths') then
    raise exception 'merchant physical booth belongs to another program';
  end if;

  delete from public.merchant_physical_booths as existing_booth
  where existing_booth.booth_program_id = v_program_id
    and not exists (
      select 1
      from jsonb_to_recordset(p_merchant_booth_program -> 'booths') as submitted_booth(id uuid)
      where submitted_booth.id = existing_booth.id
    );

  delete from public.merchant_booth_plans as existing_plan
  where existing_plan.booth_program_id = v_program_id
    and not exists (
      select 1
      from jsonb_to_recordset(p_merchant_booth_program -> 'plans') as submitted_plan(id uuid)
      where submitted_plan.id = existing_plan.id
    );
  end if;

  return v_event;
end;
$$;

revoke all on function public.save_event_aggregate(jsonb, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.save_event_aggregate(jsonb, jsonb, jsonb, jsonb) to service_role;
