\set ON_ERROR_STOP on

COPY (
  SELECT item
  FROM (
    SELECT format('extension|%s|%s', e.extname, e.extversion) AS item
    FROM pg_extension e
    WHERE e.extname IN ('pgcrypto', 'uuid-ossp', 'vector', 'pg_trgm')

    UNION ALL
    SELECT format('enum|%s.%s|%s|%s', n.nspname, t.typname, e.enumsortorder, e.enumlabel)
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'

    UNION ALL
    SELECT format(
      'relation|%s|%s|rls=%s|forcerls=%s', c.relname, c.relkind,
      c.relrowsecurity, c.relforcerowsecurity
    )
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'S')

    UNION ALL
    SELECT format(
      'column|%s|%s|%s|%s|notnull=%s|default=%s',
      c.relname, a.attnum, a.attname, format_type(a.atttypid, a.atttypmod),
      a.attnotnull, COALESCE(regexp_replace(pg_get_expr(d.adbin, d.adrelid), '\s+', ' ', 'g'), '')
    )
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm')
      AND a.attnum > 0 AND NOT a.attisdropped

    UNION ALL
    SELECT format(
      'constraint|%s|%s|%s', c.relname, con.conname,
      regexp_replace(pg_get_constraintdef(con.oid, true), '\s+', ' ', 'g')
    )
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'

    UNION ALL
    SELECT format('index|%s|%s', indexname, regexp_replace(indexdef, '\s+', ' ', 'g'))
    FROM pg_indexes
    WHERE schemaname = 'public'

    UNION ALL
    SELECT format(
      'function|%s(%s)|returns=%s|definer=%s|volatility=%s|config=%s|definition=%s',
      p.proname, pg_get_function_identity_arguments(p.oid),
      pg_get_function_result(p.oid), p.prosecdef, p.provolatile,
      COALESCE(array_to_string(p.proconfig, ','), ''),
      regexp_replace(pg_get_functiondef(p.oid), '\s+', ' ', 'g')
    )
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'

    UNION ALL
    SELECT format(
      'policy|%s|%s|%s|%s|roles=%s|using=%s|check=%s',
      schemaname, tablename, policyname, cmd, array_to_string(roles, ','),
      COALESCE(regexp_replace(qual, '\s+', ' ', 'g'), ''),
      COALESCE(regexp_replace(with_check, '\s+', ' ', 'g'), '')
    )
    FROM pg_policies
    WHERE schemaname IN ('public', 'storage')

    UNION ALL
    SELECT format(
      'function-acl|%s(%s)|grantee=%s|%s|grantable=%s',
      p.proname, pg_get_function_identity_arguments(p.oid), acl.grantee,
      acl.privilege_type, acl.is_grantable
    )
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
    WHERE n.nspname = 'public'

    UNION ALL
    SELECT format(
      'table-acl|%s|grantee=%s|%s|grantable=%s',
      c.relname, acl.grantee, acl.privilege_type, acl.is_grantable
    )
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault(CASE WHEN c.relkind = 'S' THEN 'S'::"char" ELSE 'r'::"char" END, c.relowner))) acl
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'S')

    UNION ALL
    SELECT format(
      'column-acl|%s|%s|grantee=%s|%s|grantable=%s',
      c.relname, a.attname, acl.grantee, acl.privilege_type, acl.is_grantable
    )
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(a.attacl) acl
    WHERE n.nspname = 'public' AND a.attnum > 0 AND NOT a.attisdropped

    UNION ALL
    SELECT format(
      'bucket|%s|public=%s|limit=%s|mime=%s', id, public,
      COALESCE(file_size_limit::text, ''), COALESCE(array_to_string(allowed_mime_types, ','), '')
    )
    FROM storage.buckets
    WHERE id IN ('course-materials', 'report-cards', 'generated-diagrams', 'chat-attachments')

    UNION ALL
    SELECT format('publication|%s|%s.%s', pubname, schemaname, tablename)
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
  ) catalog
  ORDER BY item
) TO STDOUT;
