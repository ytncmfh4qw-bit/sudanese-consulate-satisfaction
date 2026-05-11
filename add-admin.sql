-- إضافة حساب المدير إلى قائمة المصرح لهم في منصة قياس رضا المواطن السوداني
-- نفّذ هذا الملف داخل Supabase SQL Editor بعد إنشاء المستخدم من Authentication.

insert into public.survey_admins (email, full_name)
values ('engmhi126@gmail.com', 'مدير النظام')
on conflict (email) do update set full_name = excluded.full_name;

select * from public.survey_admins where lower(email) = 'engmhi126@gmail.com';
