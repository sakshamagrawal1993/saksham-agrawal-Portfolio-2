-- Create the analytics_events table
CREATE TABLE IF NOT EXISTS public.analytics_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    event_name TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL,
    properties JSONB, -- Document expected properties
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

-- Allow read access to everyone (public dictionary)
CREATE POLICY "Allow public read access" ON public.analytics_events
    FOR SELECT USING (true);

-- Insert Event Definitions
INSERT INTO public.analytics_events (event_name, description, properties)
VALUES
    (
        'Page View',
        'Triggered whenever the user navigates to a new page or route.',
        '{"path": "The URL path being visited"}'
    ),
    (
        'Login Success',
        'Triggered when a user successfully logs in via OTP.',
        '{"method": "Authentication method used (e.g., otp)"}'
    ),
    (
        'Dashboard View',
        'Triggered when the user lands on the main dashboard.',
        null
    ),
    (
        'Create Notebook Start',
        'Triggered when the user clicks the "Create New Notebook" card.',
        null
    ),
    (
        'Select Notebook',
        'Triggered when the user opens an existing notebook.',
        '{"notebook_id": "ID of the notebook", "title": "Title of the notebook"}'
    ),
    (
        'Workspace View',
        'Triggered when the notebook workspace (chat/sources/studio) interface loads.',
        '{"notebook": "Title of the current notebook"}'
    ),
    (
        'Message Sent',
        'Triggered when the user sends a message in the chat.',
        '{"notebook": "Current notebook title", "length": "Length of the message in characters"}'
    ),
    (
        'Source Added',
        'Triggered when a source is successfully added to the notebook.',
        '{"type": "Type of source (file, link, text)", "fileName": "Name of file (if file)", "linkType": "website/youtube (if link)", "url": "URL (if link)", "length": "Length of text (if paste)"}'
    )
ON CONFLICT (event_name) DO UPDATE 
SET description = EXCLUDED.description,
    properties = EXCLUDED.properties;
