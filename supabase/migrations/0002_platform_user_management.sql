ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS phone varchar(40),
  ADD COLUMN IF NOT EXISTS "emailVerified" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS disabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "deletionPending" boolean NOT NULL DEFAULT false;
ALTER TABLE public.institutions
  ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;

UPDATE public.users AS app_user
SET "emailVerified" = true
WHERE app_user."emailVerified" = false
  AND EXISTS (
    SELECT 1 FROM auth.users AS auth_user
    WHERE auth_user.id::text = app_user."openId"
      AND auth_user.email_confirmed_at IS NOT NULL
  );

CREATE TABLE IF NOT EXISTS public.user_preferences (
  "userId" integer PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  "emailNotifications" boolean NOT NULL DEFAULT true,
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.platform_settings (
  key varchar(80) PRIMARY KEY,
  value jsonb NOT NULL,
  "updatedBy" integer REFERENCES public.users(id),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

INSERT INTO public.platform_settings (key, value)
VALUES ('invitation_expiry_days', '{"days":7}'::jsonb)
ON CONFLICT (key) DO NOTHING;
