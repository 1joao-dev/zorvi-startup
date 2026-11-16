
create or replace function public.search_product_catalog(search_query text, result_limit integer default 20)
returns setof public.products
language sql
stable
security invoker
set search_path = public
as $$
  with q as (select public.normalize_product_text(search_query) as value)
  select p.*
  from public.products p
  cross join q
  where p.is_active = true
    and q.value <> ''
    and (
      p.normalized_name ilike '%' || q.value || '%'
      or public.normalize_product_text(p.name) ilike '%' || q.value || '%'
      or exists (
        select 1 from public.product_aliases a
        where a.product_id = p.id and a.normalized_alias ilike '%' || q.value || '%'
      )
      or exists (
        select 1
        from regexp_split_to_table(q.value, '\s+') as term
        where (length(term) >= 3 or term ~ '^[0-9]+$' or term in ('pp','p','m','g','gg','xg','xgg','xggg'))
          and (
            p.normalized_name ilike '%' || term || '%'
            or exists (
              select 1 from public.product_aliases a
              where a.product_id = p.id and a.normalized_alias ilike '%' || term || '%'
            )
          )
      )
    )
    and not exists (
      select 1
      from regexp_split_to_table(q.value, '\s+') as query_token
      where query_token in ('pp','p','m','g','gg','xg','xgg','xggg')
        and not exists (
          select 1
          from regexp_split_to_table(
            public.normalize_product_text(concat_ws(' ', p.normalized_name, p.variant, p.unit)),
            '\s+'
          ) as product_token
          where product_token = query_token
        )
    )
    and not exists (
      select 1
      from regexp_split_to_table(q.value, '\s+') as query_token
      where query_token ~ '^[0-9]+$'
        and not exists (
          select 1
          from regexp_split_to_table(
            public.normalize_product_text(concat_ws(' ', p.normalized_name, p.variant, p.unit)),
            '\s+'
          ) as product_token
          where product_token = query_token
        )
    )
  order by
    case
      when p.normalized_name = q.value then 0
      when p.normalized_name like q.value || '%' then 1
      else 2
    end,
    (
      select count(*)
      from regexp_split_to_table(q.value, '\s+') as term
      where (length(term) >= 3 or term ~ '^[0-9]+$' or term in ('pp','p','m','g','gg','xg','xgg','xggg'))
        and (
          p.normalized_name ilike '%' || term || '%'
          or exists (
            select 1 from public.product_aliases a
            where a.product_id = p.id and a.normalized_alias ilike '%' || term || '%'
          )
        )
    ) desc,
    p.name
  limit least(greatest(coalesce(result_limit, 20), 1), 50);
$$;
revoke all on function public.search_product_catalog(text, integer) from public;
grant execute on function public.search_product_catalog(text, integer) to authenticated, service_role;
