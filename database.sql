-- منصة قياس رضا المواطن السوداني — خدمات القنصلية بجازان
-- ملف إنشاء قاعدة البيانات على Supabase مع حماية الإدارة عبر Supabase Auth
-- نفّذ هذا الملف من SQL Editor داخل لوحة Supabase.

create extension if not exists pgcrypto;

-- جدول حسابات المديرين المصرّح لهم بقراءة النتائج وإدارتها.
-- ملاحظة: يجب إنشاء مستخدم المدير من Authentication ثم إضافة بريده هنا.
create table if not exists public.survey_admins (
  email text primary key,
  full_name text,
  created_at timestamp with time zone default now(),
  constraint survey_admins_email_format check (position('@' in email) > 1)
);

comment on table public.survey_admins is 'قائمة البريد الإلكتروني لحسابات الإدارة المصرح لها بالاطلاع على نتائج الاستبيان.';

-- جدول التقييمات.
create table if not exists public.citizen_satisfaction_surveys (
  id uuid primary key default gen_random_uuid(),
  reference_no text unique not null,
  service_type text not null,
  overall_rating int not null check (overall_rating between 1 and 5),
  speed_rating int check (speed_rating between 1 and 5),
  staff_rating int check (staff_rating between 1 and 5),
  clarity_rating int check (clarity_rating between 1 and 5),
  organization_rating int check (organization_rating between 1 and 5),
  communication_rating int check (communication_rating between 1 and 5),
  completed_status text not null check (completed_status in ('نعم', 'جزئياً', 'لا')),
  waiting_time text not null check (waiting_time in ('أقل من 15 دقيقة', 'من 15 إلى 30 دقيقة', 'من 30 إلى 60 دقيقة', 'أكثر من ساعة')),
  notes text,
  phone text,
  user_agent text,
  created_at timestamp with time zone default now()
);

-- فهارس لتحسين سرعة البحث والفرز في لوحة الإدارة.
create index if not exists idx_citizen_surveys_created_at
  on public.citizen_satisfaction_surveys (created_at desc);

create index if not exists idx_citizen_surveys_reference_no
  on public.citizen_satisfaction_surveys (reference_no);

create index if not exists idx_citizen_surveys_service_type
  on public.citizen_satisfaction_surveys (service_type);

create index if not exists idx_citizen_surveys_completed_status
  on public.citizen_satisfaction_surveys (completed_status);

-- دالة آمنة للتحقق من أن المستخدم الحالي مدير.
-- SECURITY DEFINER يجعل التحقق من جدول المديرين مستقلاً عن سياسات القراءة العامة.
create or replace function public.is_survey_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.survey_admins admins
    where lower(admins.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

revoke all on function public.is_survey_admin() from public;
grant execute on function public.is_survey_admin() to anon, authenticated;

-- تفعيل Row Level Security.
alter table public.citizen_satisfaction_surveys enable row level security;
alter table public.survey_admins enable row level security;

-- حذف السياسات القديمة عند إعادة تشغيل الملف لتجنب التعارض.
drop policy if exists "السماح بالإدخال العام للتقييمات" on public.citizen_satisfaction_surveys;
drop policy if exists "السماح بقراءة التقييمات مؤقتاً للإدارة" on public.citizen_satisfaction_surveys;
drop policy if exists "السماح بحذف تقييم محدد مؤقتاً للإدارة" on public.citizen_satisfaction_surveys;
drop policy if exists "السماح للمديرين بقراءة التقييمات" on public.citizen_satisfaction_surveys;
drop policy if exists "السماح للمديرين بحذف التقييمات" on public.citizen_satisfaction_surveys;
drop policy if exists "السماح للمديرين بقراءة قائمة المديرين" on public.survey_admins;

-- المواطن يستطيع إضافة تقييم فقط ولا يستطيع قراءة النتائج أو حذفها.
create policy "السماح بالإدخال العام للتقييمات"
on public.citizen_satisfaction_surveys
for insert
to anon, authenticated
with check (
  reference_no is not null
  and service_type is not null
  and overall_rating between 1 and 5
);

-- المديرون فقط يستطيعون قراءة النتائج بعد تسجيل الدخول عبر Supabase Auth.
create policy "السماح للمديرين بقراءة التقييمات"
on public.citizen_satisfaction_surveys
for select
to authenticated
using (public.is_survey_admin());

-- المديرون فقط يستطيعون حذف تقييم محدد من لوحة الإدارة.
create policy "السماح للمديرين بحذف التقييمات"
on public.citizen_satisfaction_surveys
for delete
to authenticated
using (public.is_survey_admin());

-- يسمح للمدير المسجل فقط برؤية سجل بريده في جدول المديرين للتحقق التشغيلي.
create policy "السماح للمديرين بقراءة قائمة المديرين"
on public.survey_admins
for select
to authenticated
using (public.is_survey_admin());

-- مهم: بعد إنشاء حساب المدير من Authentication > Users، عدّل البريد التالي ثم نفّذ السطر.
-- استبدل admin@example.com ببريد المدير الحقيقي.
insert into public.survey_admins (email, full_name)
values ('admin@example.com', 'مدير النظام')
on conflict (email) do update set full_name = excluded.full_name;

-- ملاحظات تشغيلية:
-- 1) صفحة المواطن عامة وتستخدم مفتاح النشر لإضافة التقييمات فقط.
-- 2) لوحة الإدارة لا تعرض النتائج إلا بعد تسجيل دخول مستخدم موجود في Supabase Auth وبريده موجود في public.survey_admins.
-- 3) غيّر admin@example.com إلى بريدك قبل الاعتماد النهائي.
