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
    and exists (
      select 1
      from regexp_split_to_table(q.value, '\s+') as query_term
      where length(query_term) >= 3
    )
    and not exists (
      select 1
      from regexp_split_to_table(q.value, '\s+') as query_term
      where length(query_term) >= 3
        and not (
          p.normalized_name ilike '%' || query_term || '%'
          or exists (
            select 1 from public.product_aliases a
            where a.product_id = p.id
              and a.normalized_alias ilike '%' || query_term || '%'
          )
        )
    )
    and not exists (
      select 1
      from regexp_split_to_table(q.value, '\s+') as query_token
      where (query_token ~ '^[0-9]+$' or query_token in ('pp','p','m','g','gg','xg','xgg','xggg'))
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
    (
      select count(*)
      from regexp_split_to_table(q.value, '\s+') as query_term
      where length(query_term) >= 3
        and (
          p.normalized_name ilike '%' || query_term || '%'
          or exists (
            select 1 from public.product_aliases a
            where a.product_id = p.id
              and a.normalized_alias ilike '%' || query_term || '%'
          )
        )
    ) desc,
    case when p.normalized_name like q.value || '%' then 0 else 1 end,
    p.name
  limit least(greatest(coalesce(result_limit, 20), 1), 50);
$$;
revoke all on function public.search_product_catalog(text, integer) from public;
grant execute on function public.search_product_catalog(text, integer) to authenticated, service_role;