# Temporal Dev Room

A temporary, real-time workspace where developers dump anything from a debugging session (errors, logs, JSON, code, SQL, shell commands, URLs) and see it instantly on any device. 

**Dump it. Debug it. Forget it.**

## Features
- **No accounts:** Anyone with the room URL can read and write.
- **Auto-expiring:** Rooms expire after 1h, 24h, or 7 days and are permanently deleted.
- **Smart detection:** Automatically detects and formats JSON, SQL, shell commands, errors, URLs, environment variables, and code in multiple languages.
- **Secret detection:** Warns you before you accidentally share API keys or credentials.
- **Real-time:** Instantly syncs across all devices.
- **Offline support:** Queues items while offline and syncs when reconnected.

## Architecture

```text
[ Browser A ] <----(Realtime Broadcast)----> [ Browser B ]
      |                                           |
      v                                           v
[ Next.js API/RPC ] <--------------------> [ Supabase (Postgres) ]
                                                  |
                                             [ pg_cron ]
                                          (Hourly Cleanup)
```

## Security Model
- **Capability URL:** The room ID is a 16-character cryptographically random string. Knowing the URL grants full read/write access.
- **No RLS Policies:** The Postgres tables (`rooms`, `items`) have no access policies, meaning they cannot be read or written to directly via the standard Supabase API.
- **Security Definer Functions:** All data access goes through strict Postgres functions (`create_room`, `add_item`, etc.) which enforce rate limits, payload sizes, and expiry rules.
- **Limitation:** Anyone with the URL can view or delete the room and its contents. Do not share sensitive production data.

## Setup Instructions

1. **Create Supabase Project:**
   Create a new project at [Supabase](https://supabase.com).

2. **Run Migrations:**
   Copy the contents of `supabase/migrations/0001_init.sql` and run it in the Supabase SQL Editor. 
   *(Note: This creates the tables and security definer functions.)*

3. **Enable pg_cron (Optional but Recommended):**
   In the Supabase dashboard, go to Database > Extensions and enable `pg_cron`. Then run the `cron.schedule` block at the bottom of the migration file.

4. **Environment Variables:**
   Rename `.env.example` to `.env.local` and add your Supabase credentials.

5. **Run Locally:**
   ```bash
   npm install
   npm run dev
   ```

## Roadmap
- Client-side encryption (E2EE)
- File and screenshot uploads
- Markdown cards for richer documentation
