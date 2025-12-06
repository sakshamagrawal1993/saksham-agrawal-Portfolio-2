# Ticketflow Supabase Setup

To fully enable the backend for Ticketflow, please execute the **ENTIRE** following SQL script in your Supabase SQL Editor. 
This includes tables, policies, AND the user creation.

```sql
-- 1. Create the tickets table
CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  customer_name TEXT,
  status TEXT NOT NULL,
  created_at BIGINT,
  updated_at BIGINT
);

-- 2. Create the remarks table (for comments AND actions)
CREATE TABLE IF NOT EXISTS remarks (
  id TEXT PRIMARY KEY,
  ticket_id TEXT REFERENCES tickets(id) ON DELETE CASCADE,
  author TEXT,
  text TEXT,
  timestamp BIGINT,
  type TEXT
);

-- 3. Create Users Table (Simple Auth)
CREATE TABLE IF NOT EXISTS users (
  username TEXT PRIMARY KEY,
  password TEXT NOT NULL,
  role TEXT DEFAULT 'operator'
);

-- 4. Insert Default User (admin / admin123)
INSERT INTO users (username, password, role) 
VALUES ('admin', 'admin123', 'operator')
ON CONFLICT (username) DO NOTHING;

-- 5. Enable Row Level Security (RLS)
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE remarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- 6. Create Policies (Allows open access for this demo app - secure for production later)
CREATE POLICY "Public tickets access" ON tickets FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public remarks access" ON remarks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public users read" ON users FOR SELECT USING (true); -- Read-only for users table

-- 7. Enable Realtime
alter publication supabase_realtime add table tickets;
alter publication supabase_realtime add table remarks;
```

Once this is run, you can log in with:
*   **Username**: `admin`
*   **Password**: `admin123`
