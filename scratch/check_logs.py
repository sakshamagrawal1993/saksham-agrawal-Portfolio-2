import requests
import os
import json

# Read .env from portfolio
env_vars = {}
with open('.env', 'r') as f:
    for line in f:
        if '=' in line and not line.startswith('#'):
            k, v = line.strip().split('=', 1)
            env_vars[k] = v

URL = env_vars.get('VITE_SUPABASE_URL')
KEY = env_vars.get('VITE_SUPABASE_ANON_KEY')

if not URL or not KEY:
    print("Missing Supabase config")
    exit(1)

# Query latest logs
headers = {
    "apikey": KEY,
    "Authorization": f"Bearer {KEY}"
}

# Get last 10 logs
url = f"{URL}/rest/v1/trading_logs?select=*&order=created_at.desc&limit=10"
response = requests.get(url, headers=headers)

if response.status_code == 200:
    print(json.dumps(response.json(), indent=2))
else:
    print(f"Error: {response.status_code} - {response.text}")
