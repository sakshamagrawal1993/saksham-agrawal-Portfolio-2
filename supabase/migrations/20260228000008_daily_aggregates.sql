-- Migration: 20260228000008_daily_aggregates.sql
-- Description: Create a table for rolling daily aggregates of wearable data and a trigger to automatically update it.

-- 1. Create the aggregate table
CREATE TABLE IF NOT EXISTS public.health_daily_aggregates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    twin_id UUID NOT NULL REFERENCES public.health_twins(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    parameter_name TEXT NOT NULL REFERENCES public.health_parameter_definitions(name),
    aggregate_value NUMERIC NOT NULL DEFAULT 0,
    unit TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    UNIQUE(twin_id, date, parameter_name) -- Ensure only one row per parameter per day per twin
);

-- Enable RLS
ALTER TABLE public.health_daily_aggregates ENABLE ROW LEVEL SECURITY;

-- Allow public read access (for simplicity in this portfolio prototype, matching other tables)
DROP POLICY IF EXISTS "Enable read access for all users" ON public.health_daily_aggregates;
CREATE POLICY "Enable read access for all users" ON public.health_daily_aggregates FOR SELECT USING (true);

DROP POLICY IF EXISTS "Enable insert access for all users" ON public.health_daily_aggregates;
CREATE POLICY "Enable insert access for all users" ON public.health_daily_aggregates FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Enable update access for all users" ON public.health_daily_aggregates;
CREATE POLICY "Enable update access for all users" ON public.health_daily_aggregates FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Enable delete access for all users" ON public.health_daily_aggregates;
CREATE POLICY "Enable delete access for all users" ON public.health_daily_aggregates FOR DELETE USING (true);

-- Enable realtime subscriptions
begin;
  drop publication if exists supabase_realtime;
  create publication supabase_realtime;
commit;
alter publication supabase_realtime add table public.health_daily_aggregates;


-- 2. Create the PL/pgSQL function to update the aggregate table
CREATE OR REPLACE FUNCTION update_daily_aggregate()
RETURNS TRIGGER AS $$
DECLARE
    agg_date DATE;
    total_val NUMERIC;
    target_twin_id UUID;
    target_param_name TEXT;
    target_unit TEXT;
    param_type TEXT;
    row_count INT;
BEGIN
    -- Determine the parameters based on operation type
    IF TG_OP = 'DELETE' THEN
        target_twin_id := OLD.twin_id;
        target_param_name := OLD.parameter_name;
        target_unit := OLD.unit;
        -- Use the date of the recorded timestamp, handle nulls gracefully
        IF OLD.recorded_at IS NOT NULL THEN
            agg_date := DATE(OLD.recorded_at);
        ELSE
            -- Try to extract date from created_at or skip
            RETURN NULL;
        END IF;
    ELSE
        target_twin_id := NEW.twin_id;
        target_param_name := NEW.parameter_name;
        target_unit := NEW.unit;
        -- Use the date of the recorded timestamp
        IF NEW.recorded_at IS NOT NULL THEN
            agg_date := DATE(NEW.recorded_at);
        ELSE
            RETURN NULL;
        END IF;
    END IF;

    -- Look up the parameter type to see if we should sum or average
    -- Currently assuming most wearable parameters are cumulative (Steps, Calories, Macros)
    -- or point-in-time that we want to average (Heart Rate, Temp) over the day.
    -- For simplicity, we will calculate both SUM and AVG and decide based on a heuristic here.
    
    -- Heuristic: Assume parameters containing "Total", "Step Count", "Distance", "Calories" are sums.
    -- Everything else is an average.
    IF target_param_name ILIKE '%Total%' OR target_param_name ILIKE '%Step Count%' OR target_param_name ILIKE '%Calories%' OR target_param_name ILIKE '%Energy%' OR target_param_name ILIKE '%Distance%' OR target_param_name ILIKE '%Duration%' OR target_param_name ILIKE '%Minutes%' THEN
        -- Calculate SUM for the specific date
        SELECT SUM(parameter_value) INTO total_val
        FROM public.health_wearable_parameters
        WHERE twin_id = target_twin_id 
          AND parameter_name = target_param_name 
          AND DATE(recorded_at) = agg_date;
    ELSE
        -- Calculate AVG for the specific date
        SELECT AVG(parameter_value) INTO total_val
        FROM public.health_wearable_parameters
        WHERE twin_id = target_twin_id 
          AND parameter_name = target_param_name 
          AND DATE(recorded_at) = agg_date;
    END IF;

    -- Check if there are any records left for this day
    SELECT COUNT(*) INTO row_count
    FROM public.health_wearable_parameters
    WHERE twin_id = target_twin_id 
        AND parameter_name = target_param_name 
        AND DATE(recorded_at) = agg_date;

    IF row_count = 0 THEN
        -- If no records left, delete the aggregate row
        DELETE FROM public.health_daily_aggregates
        WHERE twin_id = target_twin_id 
          AND date = agg_date 
          AND parameter_name = target_param_name;
    ELSE
        -- Upsert the calculated value into the aggregates table
        -- Use COALESCE to handle nulls if all values were null (though schema enforces numeric)
        total_val := COALESCE(total_val, 0);

        INSERT INTO public.health_daily_aggregates (twin_id, date, parameter_name, aggregate_value, unit, updated_at)
        VALUES (target_twin_id, agg_date, target_param_name, total_val, target_unit, NOW())
        ON CONFLICT (twin_id, date, parameter_name) 
        DO UPDATE SET 
            aggregate_value = EXCLUDED.aggregate_value,
            unit = EXCLUDED.unit,
            updated_at = NOW();
    END IF;

    RETURN NULL; -- AFTER triggers can return NULL
END;
$$ LANGUAGE plpgsql;

-- 3. Attach the trigger to the wearable parameters table
DROP TRIGGER IF EXISTS trg_update_daily_aggregate ON public.health_wearable_parameters;

CREATE TRIGGER trg_update_daily_aggregate
AFTER INSERT OR UPDATE OR DELETE ON public.health_wearable_parameters
FOR EACH ROW
EXECUTE FUNCTION update_daily_aggregate();

-- 4. Initial Population: Seed the aggregates table with existing data
-- Calculate for typical cumulative params (Sums)
INSERT INTO public.health_daily_aggregates (twin_id, date, parameter_name, aggregate_value, unit, updated_at)
SELECT 
    twin_id, 
    DATE(recorded_at), 
    parameter_name, 
    SUM(parameter_value), 
    MAX(unit), 
    NOW()
FROM public.health_wearable_parameters
WHERE recorded_at IS NOT NULL
  AND (parameter_name ILIKE '%Total%' OR parameter_name ILIKE '%Step Count%' OR parameter_name ILIKE '%Calories%' OR parameter_name ILIKE '%Energy%' OR parameter_name ILIKE '%Distance%' OR parameter_name ILIKE '%Duration%' OR parameter_name ILIKE '%Minutes%')
GROUP BY twin_id, DATE(recorded_at), parameter_name
ON CONFLICT (twin_id, date, parameter_name) DO UPDATE SET
    aggregate_value = EXCLUDED.aggregate_value,
    unit = EXCLUDED.unit,
    updated_at = EXCLUDED.updated_at;

-- Calculate for typical point-in-time params (Averages)
INSERT INTO public.health_daily_aggregates (twin_id, date, parameter_name, aggregate_value, unit, updated_at)
SELECT 
    twin_id, 
    DATE(recorded_at), 
    parameter_name, 
    AVG(parameter_value), 
    MAX(unit), 
    NOW()
FROM public.health_wearable_parameters
WHERE recorded_at IS NOT NULL
  AND NOT (parameter_name ILIKE '%Total%' OR parameter_name ILIKE '%Step Count%' OR parameter_name ILIKE '%Calories%' OR parameter_name ILIKE '%Energy%' OR parameter_name ILIKE '%Distance%' OR parameter_name ILIKE '%Duration%' OR parameter_name ILIKE '%Minutes%')
GROUP BY twin_id, DATE(recorded_at), parameter_name
ON CONFLICT (twin_id, date, parameter_name) DO UPDATE SET
    aggregate_value = EXCLUDED.aggregate_value,
    unit = EXCLUDED.unit,
    updated_at = EXCLUDED.updated_at;
