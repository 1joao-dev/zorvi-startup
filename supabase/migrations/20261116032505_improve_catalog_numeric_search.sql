
create or replace function public.normalize_product_text(input text)
returns text
language sql
immutable
parallel safe
set search_path = pg_catalog, public
as $$
  select trim(regexp_replace(
    regexp_replace(
      regexp_replace(
        translate(lower(coalesce(input, '')),
          'áàâãäéèêëíìîïóòôõöúùûüçñ',
          'aaaaaeeeeiiiiooooouuuucn'),
        '([0-9])([a-z])', '\1 \2', 'g'
      ),
      '([a-z])([0-9])', '\1 \2', 'g'
    ),
    '\s+', ' ', 'g'
  ));
$$;
