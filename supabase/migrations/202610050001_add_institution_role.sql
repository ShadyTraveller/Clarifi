-- Add "institution" as a supported client type (Google Form page 2 + native intake parity).
-- Apply with: supabase db push (or run in the Supabase SQL editor).
do $$ begin
  alter type client_relationship add value 'institution';
exception when duplicate_object then null;
end $$;
