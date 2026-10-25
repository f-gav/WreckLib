-- Cover nullable entries.deleted_by foreign key lookups for retention and audit.
create index if not exists entries_deleted_by_idx on public.entries(deleted_by) where deleted_by is not null;
