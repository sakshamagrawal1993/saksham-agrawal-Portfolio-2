# Supabase OAuth Setup Guide for InsightsLM

To enable Google and GitHub login, you need to configure them in your Supabase Dashboard.

## 1. Prerequisites
- **Supabase Project**: [https://supabase.com/dashboard/project/cbxzbwugycdqiokyvvid](https://supabase.com/dashboard/project/cbxzbwugycdqiokyvvid)
- **Callback URL**: You will need this for both Google and GitHub:
  `https://cbxzbwugycdqiokyvvid.supabase.co/auth/v1/callback`

## 2. GitHub Authentication
1. Go to [GitHub Developer Settings](https://github.com/settings/developers).
2. Click **"New OAuth App"**.
3. Fill in the form:
   - **Application Name**: InsightsLM
   - **Homepage URL**: `https://saksham-experiments.clouds` (Use `http://localhost:5173` for local testing if needed, but production domain is better if you have it)
   - **Authorization callback URL**: Paste the **Callback URL** from step 1: `https://cbxzbwugycdqiokyvvid.supabase.co/auth/v1/callback`
4. Click **Register application**.
5. Copy the **Client ID** and generate a new **Client Secret**.
6. Go to **Supabase Dashboard** -> **Authentication** -> **Providers** -> **GitHub**.
7. Enable "GitHub Enabled".
8. Paste the **Client ID** and **Client Secret**.
9. Click **Save**.

## 3. Google Authentication
1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (or select an existing one).
3. Search for "OAuth consent screen" and configure it (User Type: External).
4. Go to **Credentials** -> **Create Credentials** -> **OAuth client ID**.
5. Application type: **Web application**.
6. **Authorized JavaScript origins** (Add both):
   - `http://localhost:5173`
   - `https://saksham-experiments.clouds`
7. **Authorized redirect URIs**: Paste the **Callback URL** from step 1: 
   `https://cbxzbwugycdqiokyvvid.supabase.co/auth/v1/callback`
8. Click **Create**.
9. Copy the **Client ID** and **Client Secret**.
10. Go to **Supabase Dashboard** -> **Authentication** -> **Providers** -> **Google**.
11. Enable "Google Enabled".
12. Paste the **Client ID** and **Client Secret**.
13. Click **Save**.

## 4. Final Security Step (URL Whitelist)
1. In Supabase Dashboard, go to **Authentication** -> **URL Configuration**.
2. Under **Redirect URLs**, add the following URLs to allow successful login redirects:
   - `http://localhost:5173/insightslm` (Local Dev)
   - `https://saksham-experiments.clouds/insightslm` (Production)
   - `http://localhost:5173`
   - `https://saksham-experiments.clouds`
3. Click **Save**.
