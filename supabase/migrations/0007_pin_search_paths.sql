-- Pin search_path on the text/URL helpers (Supabase advisor 0011). They only use
-- built-ins or schema-qualified calls, so an empty path is safe and stops a
-- caller's search_path from changing what they do. Skips any that don't exist yet.
do $$
declare f text;
begin
  foreach f in array array[
    'private.clean_url(text)', 'private.clean_text(text, integer)', 'private.clean_sectors(jsonb)',
    'private.url_host(text)', 'private.job_url_allowed(text, text, text)'
  ] loop
    if to_regprocedure(f) is not null then
      execute format('alter function %s set search_path = %L', f, '');
    end if;
  end loop;
end $$;
