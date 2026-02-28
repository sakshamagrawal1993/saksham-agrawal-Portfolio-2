-- Create the n8n_readonly role safely
DO
$do$
BEGIN
   IF NOT EXISTS (
      SELECT FROM pg_catalog.pg_roles
      WHERE  rolname = 'n8n_readonly') THEN

      CREATE ROLE n8n_readonly WITH LOGIN PASSWORD 'n8n_readonly_health_twin_2026';
   END IF;
END
$do$;

-- 1. Grant usage on the public schema
GRANT USAGE ON SCHEMA public TO n8n_readonly;

-- 2. Grant SELECT mapping for existing tables to allow the Agent to dynamically read them
GRANT SELECT ON public.health_twins TO n8n_readonly;
GRANT SELECT ON public.health_personal_details TO n8n_readonly;
GRANT SELECT ON public.health_scores TO n8n_readonly;
GRANT SELECT ON public.health_recommendations TO n8n_readonly;
GRANT SELECT ON public.health_sources TO n8n_readonly;
GRANT SELECT ON public.health_wearable_parameters TO n8n_readonly;
GRANT SELECT ON public.health_lab_parameters TO n8n_readonly;
GRANT SELECT ON public.health_parameter_definitions TO n8n_readonly;
GRANT SELECT ON public.health_parameter_ranges TO n8n_readonly;
GRANT SELECT ON public.health_daily_aggregates TO n8n_readonly;
GRANT SELECT ON public.health_chat_sessions TO n8n_readonly;
GRANT SELECT ON public.health_chat_messages TO n8n_readonly;
GRANT SELECT ON public.health_twin_memories TO n8n_readonly;

-- 3. Automatically grant SELECT on any future tables we create
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO n8n_readonly;
