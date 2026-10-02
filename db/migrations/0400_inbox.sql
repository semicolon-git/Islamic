-- Inbox (B3): who closed a visitor conversation and when; fast "waiting" queries.
alter table threads add column if not exists closed_at timestamptz;
alter table threads add column if not exists closed_by text;            -- 'visitor' or a portal user id
create index if not exists threads_status_last on threads (status, last_message_at desc);
create index if not exists threads_device on threads (device_hash, status);
create index if not exists card_requests_status on card_requests (status, created_at desc);
