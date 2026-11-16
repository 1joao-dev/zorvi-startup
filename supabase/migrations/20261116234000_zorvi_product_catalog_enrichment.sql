
alter table public.products
  add column if not exists subcategory text,
  add column if not exists source_provider text not null default 'zorvi_manual',
  add column if not exists source_product_id text,
  add column if not exists source_url text,
  add column if not exists image_url text,
  add column if not exists description text,
  add column if not exists country_code text not null default 'BR',
  add column if not exists source_updated_at timestamptz,
  add column if not exists is_active boolean not null default true;
create unique index if not exists products_source_identity_idx on public.products(source_provider, source_product_id);
create index if not exists products_subcategory_idx on public.products(category, subcategory);
create index if not exists products_source_provider_idx on public.products(source_provider);

create table if not exists public.product_aliases (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  alias text not null,
  normalized_alias text not null,
  source_provider text not null default 'zorvi_curated',
  created_at timestamptz not null default now(),
  constraint product_aliases_product_normalized_unique unique(product_id, normalized_alias),
  constraint product_aliases_alias_length check(char_length(alias) between 1 and 160)
);
create index if not exists product_aliases_normalized_alias_idx on public.product_aliases(normalized_alias);
create index if not exists product_aliases_product_id_idx on public.product_aliases(product_id);
alter table public.product_aliases enable row level security;
grant select on public.product_aliases to authenticated;
grant select, insert, update, delete on public.product_aliases to service_role;
drop policy if exists "Authenticated users can read product aliases" on public.product_aliases;
create policy "Authenticated users can read product aliases" on public.product_aliases for select to authenticated using(true);

create table if not exists public.product_catalog_search_cache (
  query_key text primary key,
  provider text not null,
  fetched_at timestamptz not null default now(),
  result_count integer not null default 0 check(result_count >= 0)
);
alter table public.product_catalog_search_cache enable row level security;
grant select, insert, update, delete on public.product_catalog_search_cache to service_role;

create or replace function public.normalize_product_text(input text)
returns text language sql immutable parallel safe as $$
  select trim(regexp_replace(
    translate(lower(coalesce(input, '')),
      'áàâãäéèêëíìîïóòôõöúùûüçñ',
      'aaaaaeeeeiiiiooooouuuucn'),
    '[^a-z0-9]+', ' ', 'g'
  ));
$$;
revoke all on function public.normalize_product_text(text) from public;
grant execute on function public.normalize_product_text(text) to authenticated, service_role;

create or replace function public.search_product_catalog(search_query text, result_limit integer default 20)
returns setof public.products
language sql stable security invoker set search_path = public as $$
  with q as (select public.normalize_product_text(search_query) as value)
  select p.*
  from public.products p cross join q
  where p.is_active = true and q.value <> ''
    and (
      p.normalized_name ilike '%' || q.value || '%'
      or public.normalize_product_text(p.name) ilike '%' || q.value || '%'
      or exists (select 1 from public.product_aliases a where a.product_id=p.id and a.normalized_alias ilike '%' || q.value || '%')
      or exists (
        select 1 from regexp_split_to_table(q.value, '\\s+') as term
        where length(term)>=2 and (
          p.normalized_name ilike '%' || term || '%'
          or exists (select 1 from public.product_aliases a where a.product_id=p.id and a.normalized_alias ilike '%' || term || '%')
        )
      )
    )
  order by case when p.normalized_name=q.value then 0 when p.normalized_name like q.value || '%' then 1 else 2 end, p.name
  limit least(greatest(coalesce(result_limit,20),1),50);
$$;
revoke all on function public.search_product_catalog(text,integer) from public;
grant execute on function public.search_product_catalog(text,integer) to authenticated, service_role;

insert into public.products(name,normalized_name,brand,variant,unit,category,subcategory,source_provider,source_product_id,description,country_code,is_active)
values
('Arroz tipo 1 5 kg','arroz tipo 1 5 kg',null,'Pacote de 5 kg','5 kg','Mercado','Mercearia','zorvi_curated','market-rice-type1-5kg','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Arroz tipo 1 1 kg','arroz tipo 1 1 kg',null,'Pacote de 1 kg','1 kg','Mercado','Mercearia','zorvi_curated','market-rice-type1-1kg','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Feijão carioca 1 kg','feijao carioca 1 kg',null,'Pacote de 1 kg','1 kg','Mercado','Mercearia','zorvi_curated','market-beans-carioca-1kg','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Feijão preto 1 kg','feijao preto 1 kg',null,'Pacote de 1 kg','1 kg','Mercado','Mercearia','zorvi_curated','market-beans-black-1kg','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Açúcar cristal 1 kg','acucar cristal 1 kg',null,'Pacote de 1 kg','1 kg','Mercado','Mercearia','zorvi_curated','market-sugar-crystal-1kg','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Açúcar refinado 1 kg','acucar refinado 1 kg',null,'Pacote de 1 kg','1 kg','Mercado','Mercearia','zorvi_curated','market-sugar-refined-1kg','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Café torrado e moído 500 g','cafe torrado e moido 500 g',null,'Pacote de 500 g','500 g','Mercado','Mercearia','zorvi_curated','market-coffee-ground-500g','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Óleo de soja 900 ml','oleo de soja 900 ml',null,'Garrafa de 900 ml','900 ml','Mercado','Mercearia','zorvi_curated','market-soy-oil-900ml','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Leite integral UHT 1 L','leite integral uht 1 l',null,'Caixa de 1 litro','1 L','Mercado','Laticínios','zorvi_curated','market-milk-whole-1l','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Leite desnatado UHT 1 L','leite desnatado uht 1 l',null,'Caixa de 1 litro','1 L','Mercado','Laticínios','zorvi_curated','market-milk-skim-1l','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Leite em pó integral 400 g','leite em po integral 400 g',null,'Pacote de 400 g','400 g','Mercado','Laticínios','zorvi_curated','market-milk-powder-400g','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Macarrão espaguete 500 g','macarrao espaguete 500 g',null,'Pacote de 500 g','500 g','Mercado','Mercearia','zorvi_curated','market-pasta-spaghetti-500g','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Farinha de trigo 1 kg','farinha de trigo 1 kg',null,'Pacote de 1 kg','1 kg','Mercado','Mercearia','zorvi_curated','market-wheat-flour-1kg','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Farinha de mandioca 1 kg','farinha de mandioca 1 kg',null,'Pacote de 1 kg','1 kg','Mercado','Mercearia','zorvi_curated','market-cassava-flour-1kg','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Flocão de milho 500 g','flocao de milho 500 g',null,'Pacote de 500 g','500 g','Mercado','Mercearia','zorvi_curated','market-corn-flakes-500g','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Ovos brancos 12 unidades','ovos brancos 12 unidades',null,'Bandeja com 12 unidades','12 un','Mercado','Ovos e laticínios','zorvi_curated','market-eggs-12','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Peito de frango por kg','peito de frango por kg',null,'Preço por quilograma','kg','Mercado','Carnes','zorvi_curated','market-chicken-breast-kg','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Carne bovina acém por kg','carne bovina acem por kg',null,'Preço por quilograma','kg','Mercado','Carnes','zorvi_curated','market-beef-chuck-kg','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Carne moída por kg','carne moida por kg',null,'Preço por quilograma','kg','Mercado','Carnes','zorvi_curated','market-ground-beef-kg','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Batata inglesa por kg','batata inglesa por kg',null,'Preço por quilograma','kg','Mercado','Hortifruti','zorvi_curated','market-potato-kg','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Cebola por kg','cebola por kg',null,'Preço por quilograma','kg','Mercado','Hortifruti','zorvi_curated','market-onion-kg','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Tomate por kg','tomate por kg',null,'Preço por quilograma','kg','Mercado','Hortifruti','zorvi_curated','market-tomato-kg','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Banana prata por kg','banana prata por kg',null,'Preço por quilograma','kg','Mercado','Hortifruti','zorvi_curated','market-banana-kg','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Maçã por kg','maca por kg',null,'Preço por quilograma','kg','Mercado','Hortifruti','zorvi_curated','market-apple-kg','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Laranja por kg','laranja por kg',null,'Preço por quilograma','kg','Mercado','Hortifruti','zorvi_curated','market-orange-kg','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Refrigerante sabor cola 2 L','refrigerante sabor cola 2 l',null,'Garrafa de 2 litros','2 L','Mercado','Bebidas','zorvi_curated','market-cola-soda-2l','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Água mineral sem gás 1,5 L','agua mineral sem gas 1 5 l',null,'Garrafa de 1,5 litro','1,5 L','Mercado','Bebidas','zorvi_curated','market-water-1-5l','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Iogurte natural 170 g','iogurte natural 170 g',null,'Pote de 170 g','170 g','Mercado','Laticínios','zorvi_curated','market-yogurt-170g','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Queijo muçarela por kg','queijo mucarela por kg',null,'Preço por quilograma','kg','Mercado','Frios e laticínios','zorvi_curated','market-mozzarella-kg','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Margarina 500 g','margarina 500 g',null,'Pote de 500 g','500 g','Mercado','Frios e laticínios','zorvi_curated','market-margarine-500g','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Manteiga 200 g','manteiga 200 g',null,'Tablete de 200 g','200 g','Mercado','Frios e laticínios','zorvi_curated','market-butter-200g','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Pão de forma 450 g','pao de forma 450 g',null,'Pacote de 450 g','450 g','Mercado','Padaria','zorvi_curated','market-sliced-bread-450g','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Biscoito cream cracker 350 g','biscoito cream cracker 350 g',null,'Pacote de 350 g','350 g','Mercado','Mercearia','zorvi_curated','market-cracker-350g','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Molho de tomate 300 g','molho de tomate 300 g',null,'Sachê de 300 g','300 g','Mercado','Mercearia','zorvi_curated','market-tomato-sauce-300g','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Sal refinado 1 kg','sal refinado 1 kg',null,'Pacote de 1 kg','1 kg','Mercado','Mercearia','zorvi_curated','market-salt-1kg','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Detergente líquido 500 ml','detergente liquido 500 ml',null,'Frasco de 500 ml','500 ml','Mercado','Limpeza','zorvi_curated','market-dish-detergent-500ml','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Água sanitária 1 L','agua sanitaria 1 l',null,'Frasco de 1 litro','1 L','Mercado','Limpeza','zorvi_curated','market-bleach-1l','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Desinfetante 2 L','desinfetante 2 l',null,'Frasco de 2 litros','2 L','Mercado','Limpeza','zorvi_curated','market-disinfectant-2l','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Sabão em pó 1,6 kg','sabao em po 1 6 kg',null,'Pacote de 1,6 kg','1,6 kg','Mercado','Limpeza','zorvi_curated','market-laundry-powder-1-6kg','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Amaciante de roupas 2 L','amaciante de roupas 2 l',null,'Frasco de 2 litros','2 L','Mercado','Limpeza','zorvi_curated','market-fabric-softener-2l','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Papel higiênico pacote com 12 rolos','papel higienico pacote com 12 rolos',null,'Pacote com 12 rolos','12 rolos','Mercado','Higiene','zorvi_curated','market-toilet-paper-12','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Papel toalha pacote com 2 rolos','papel toalha pacote com 2 rolos',null,'Pacote com 2 rolos','2 rolos','Mercado','Higiene','zorvi_curated','market-paper-towel-2','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Esponja dupla face','esponja dupla face',null,'Unidade','1 un','Mercado','Limpeza','zorvi_curated','market-sponge','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Sabão em barra pacote com 5 unidades','sabao em barra pacote com 5 unidades',null,'Pacote com 5 unidades','5 un','Mercado','Limpeza','zorvi_curated','market-bar-soap-5','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Saco para lixo 30 L','saco para lixo 30 l',null,'Pacote de sacos de 30 litros','30 L','Mercado','Limpeza','zorvi_curated','market-trash-bags-30l','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Shampoo 350 ml','shampoo 350 ml',null,'Frasco de 350 ml','350 ml','Farmácia','Higiene pessoal','zorvi_curated','pharmacy-shampoo-350ml','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Condicionador 350 ml','condicionador 350 ml',null,'Frasco de 350 ml','350 ml','Farmácia','Higiene pessoal','zorvi_curated','pharmacy-conditioner-350ml','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Escova dental adulta','escova dental adulta',null,'Unidade','1 un','Farmácia','Higiene bucal','zorvi_curated','pharmacy-toothbrush-adult','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Desodorante aerosol 150 ml','desodorante aerosol 150 ml',null,'Frasco de 150 ml','150 ml','Farmácia','Higiene pessoal','zorvi_curated','pharmacy-deodorant-150ml','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Fralda descartável tamanho M pacote','fralda descartavel tamanho m pacote',null,'Pacote tamanho M','Pacote','Farmácia','Higiene e bebê','zorvi_curated','pharmacy-diaper-size-m','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Absorvente higiênico pacote','absorvente higienico pacote',null,'Pacote','Pacote','Farmácia','Higiene pessoal','zorvi_curated','pharmacy-sanitary-pads','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Álcool 70% 1 L','alcool 70 1 l',null,'Frasco de 1 litro','1 L','Farmácia','Cuidados pessoais','zorvi_curated','pharmacy-alcohol-70-1l','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Gaze estéril pacote','gaze esteril pacote',null,'Pacote','Pacote','Farmácia','Primeiros socorros','zorvi_curated','pharmacy-sterile-gauze','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Algodão hidrófilo 50 g','algodao hidrofilo 50 g',null,'Pacote de 50 g','50 g','Farmácia','Primeiros socorros','zorvi_curated','pharmacy-cotton-50g','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Sabonete em barra 90 g','sabonete em barra 90 g',null,'Unidade de 90 g','90 g','Farmácia','Higiene pessoal','zorvi_curated','pharmacy-soap-90g','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Hidratante corporal 200 ml','hidratante corporal 200 ml',null,'Frasco de 200 ml','200 ml','Farmácia','Cuidados pessoais','zorvi_curated','pharmacy-body-lotion-200ml','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Lenços umedecidos pacote','lencos umedecidos pacote',null,'Pacote','Pacote','Farmácia','Higiene e bebê','zorvi_curated','pharmacy-wet-wipes','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true),
('Protetor solar FPS 50 200 ml','protetor solar fps 50 200 ml',null,'Embalagem de 200 ml','200 ml','Farmácia','Cuidados pessoais','zorvi_curated','pharmacy-sunscreen-fps50-200ml','Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.','BR',true)
on conflict (source_provider,source_product_id) do update set
  name=excluded.name, normalized_name=excluded.normalized_name, variant=excluded.variant, unit=excluded.unit,
  category=excluded.category, subcategory=excluded.subcategory, description=excluded.description,
  country_code=excluded.country_code, is_active=true;

insert into public.product_aliases(product_id,alias,normalized_alias,source_provider)
select p.id,p.name,public.normalize_product_text(p.name),'zorvi_catalog'
from public.products p where p.is_active
on conflict (product_id,normalized_alias) do nothing;

insert into public.product_aliases(product_id,alias,normalized_alias,source_provider)
select p.id,v.alias,public.normalize_product_text(v.alias),'zorvi_curated'
from (values
('market-rice-type1-5kg','arroz'),
('market-rice-type1-5kg','arroz branco'),
('market-rice-type1-5kg','arroz tipo um'),
('market-rice-type1-5kg','arroz 5kg'),
('market-rice-type1-1kg','arroz 1kg'),
('market-rice-type1-1kg','arroz tipo 1'),
('market-beans-carioca-1kg','feijão'),
('market-beans-carioca-1kg','feijao carioca'),
('market-beans-carioca-1kg','feijão carioca'),
('market-beans-carioca-1kg','feijao'),
('market-beans-black-1kg','feijão preto'),
('market-beans-black-1kg','feijao preto'),
('market-coffee-ground-500g','café'),
('market-coffee-ground-500g','cafe moido'),
('market-coffee-ground-500g','café moído'),
('market-coffee-ground-500g','cafe em pó'),
('market-soy-oil-900ml','óleo'),
('market-soy-oil-900ml','oleo de cozinha'),
('market-soy-oil-900ml','óleo de soja'),
('market-milk-whole-1l','leite'),
('market-milk-whole-1l','leite integral'),
('market-milk-whole-1l','leite de caixa'),
('market-milk-whole-1l','leite longa vida'),
('market-milk-whole-1l','leite uht'),
('market-milk-skim-1l','leite desnatado'),
('market-milk-skim-1l','leite magro'),
('market-milk-powder-400g','leite em pó'),
('market-milk-powder-400g','leite em po'),
('market-pasta-spaghetti-500g','macarrão'),
('market-pasta-spaghetti-500g','macarrao'),
('market-pasta-spaghetti-500g','espaguete'),
('market-eggs-12','ovos'),
('market-eggs-12','dúzia de ovos'),
('market-eggs-12','duzia de ovos'),
('market-chicken-breast-kg','peito de frango'),
('market-chicken-breast-kg','frango'),
('market-ground-beef-kg','carne moída'),
('market-ground-beef-kg','carne moida'),
('market-potato-kg','batata'),
('market-onion-kg','cebola'),
('market-tomato-kg','tomate'),
('market-banana-kg','banana'),
('market-toilet-paper-12','papel higiênico'),
('market-toilet-paper-12','papel higienico'),
('market-dish-detergent-500ml','detergente'),
('market-dish-detergent-500ml','lava louças'),
('market-dish-detergent-500ml','lava loucas'),
('market-laundry-powder-1-6kg','sabão em pó'),
('market-laundry-powder-1-6kg','sabao em po'),
('pharmacy-shampoo-350ml','shampoo'),
('pharmacy-shampoo-350ml','xampu'),
('pharmacy-conditioner-350ml','condicionador'),
('pharmacy-deodorant-150ml','desodorante'),
('pharmacy-diaper-size-m','fralda'),
('pharmacy-diaper-size-m','fralda tamanho m'),
('pharmacy-diaper-size-m','fralda m'),
('pharmacy-sanitary-pads','absorvente'),
('pharmacy-sanitary-pads','absorvente feminino'),
('pharmacy-sunscreen-fps50-200ml','protetor solar'),
('pharmacy-sunscreen-fps50-200ml','protetor solar fps 50')
) as v(source_product_id,alias)
join public.products p on p.source_provider='zorvi_curated' and p.source_product_id=v.source_product_id
where public.normalize_product_text(v.alias)<>''
on conflict (product_id,normalized_alias) do nothing;

grant select, insert, update, delete on public.products to service_role;
