# ZORVI

**Tudo se conecta. Tudo se descobre.**

A ZORVI é uma experiência social mobile-first para descobrir pessoas, estabelecimentos, produtos, preços, promoções e experiências em um só lugar.

## Experiência atual

- **Início:** feed da comunidade, publicações demonstrativas, curtidas, favoritos e criação de post.
- **Mapa:** base vetorial escura, geolocalização, filtros por categoria, marcadores agrupados e pesquisa de preços.
- **ZORVI AI:** chat conectado à Edge Function `zorvi-ai`, com consulta ao catálogo real e aos preços verificados; usa o Lovable AI Gateway no servidor quando a chave do projeto está disponível e mantém busca direta do catálogo como fallback.
- **Explorar:** categorias e atalhos para descobertas.
- **Perfil:** perfil demonstrativo, itens salvos e alternância entre tema escuro e claro.

## Stack

- React 19 + TypeScript
- TanStack Start / Router
- Vite
- Tailwind CSS v4
- Lucide React
- Leaflet + MapLibre GL Leaflet + OpenFreeMap para o mapa vetorial.

## Desenvolvimento local

Requer Node.js e npm (ou Bun).

```sh
git clone https://github.com/joaosystemss/startup-em-movimento.git
cd startup-em-movimento
npm install
npm run dev
```

Comandos úteis:

```sh
npm run build
npm run lint
npm test
```

## Supabase: autenticação e perfis

A primeira integração está preparada para Supabase Auth e perfis.

1. Crie um projeto em https://supabase.com.
2. No SQL Editor, execute `supabase/schema.sql`.
3. Copie `.env.example` para `.env.local` e preencha a URL e a chave pública (anon/publishable) do projeto.
4. Reinicie `npm run dev`. Com as variáveis configuradas, o app passa a exigir login e oferece cadastro e recuperação de senha.
5. Em Authentication > URL Configuration, adicione a URL local e a URL publicada à lista de Redirect URLs.

Nunca coloque a `service_role` key no frontend. Use somente a chave pública anon/publishable; a proteção dos dados é feita por RLS no banco.


## Catálogo central de produtos

O catálogo de produtos é separado dos preços por estabelecimento: cadastrar um produto não significa que uma loja o venda, tenha estoque ou pratique determinado preço.

- **Catálogo de referência ZORVI:** inclui produtos comuns de mercearia, hortifruti, limpeza, higiene e cuidados pessoais para melhorar o reconhecimento de buscas.
- **Open Food Facts:** a ZORVI AI pode procurar alimentos que ainda não estejam no catálogo e importar metadados públicos associados a produtos do Brasil. A fonte não fornece preço local nem estoque. A base é colaborativa e licenciada sob ODbL; consulte a atribuição e os termos antes de redistribuir os dados.
- **ANVISA:** o importador local permite carregar a base oficial de medicamentos registrados. O registro regulatório não é uma cotação nem confirma comercialização em uma farmácia.

### Sincronizar as bases públicas

Os dois comandos precisam de acesso administrativo ao Supabase. Use as variáveis somente no terminal local; **nunca** coloque a chave service role no navegador, em código frontend ou no GitHub.

Depois de clonar o repositório e instalar as dependências com `npm install`, execute no PowerShell:

```powershell
$env:SUPABASE_URL="https://SEU-PROJETO.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="SUA_CHAVE_SERVICE_ROLE"
npm run catalog:sync:all

# Ou execute separadamente:
npm run catalog:sync:open-food-facts
npm run catalog:sync:anvisa
```

O sincronizador do Open Food Facts consulta termos comuns do Brasil e respeita uma pausa entre requisições para observar o limite público da API. O importador da ANVISA baixa o arquivo oficial atualizado mensalmente e importa os registros em lotes.

Fontes:
- Open Food Facts API: https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/
- ANVISA — dados abertos: https://dados.anvisa.gov.br/dados/
- ANVISA — dicionário de dados de medicamentos: https://dados.anvisa.gov.br/dados/Documentacao_e_Dicionario_de_Dados_MEDICAMENTOS.pdf

## Próximas integrações

1. Persistência de publicações, curtidas e comentários no Supabase.
2. Ampliar a cobertura de geocodificação e a precisão das coordenadas dos estabelecimentos.
3. Ampliar o catálogo com fontes verificadas de preços, estabelecimentos e promoções.
4. Adicionar histórico persistente de conversas da ZORVI AI, com controles de privacidade.

**Importante:** o chat ZORVI AI consulta o catálogo e só utiliza preços verificados dos últimos 30 dias. Quando não há preço confirmado, o agente informa a limitação. O histórico de conversa ainda fica apenas na sessão atual. Alguns conteúdos de feed e elementos de demonstração ainda não representam dados comerciais verificados.

## Google Places: referência de estabelecimentos

A função `geocode-stores` usa o Places API (New) para associar cada unidade a um `place_id` do Google. Somente o Place ID e o estado operacional da verificação são persistidos. Os nomes, endereços e coordenadas retornados pelo Google não são armazenados.

O mapa principal continua usando MapLibre/OpenStreetMap; suas coordenadas são obtidas pelo Photon ou por correção manual. O Place ID gera um link que abre a unidade correspondente no Google Maps.

Para habilitar a associação:

1. Ative **Places API (New)** no Google Cloud e configure o faturamento e limites de uso.
2. Crie uma chave restrita à Places API (New).
3. Cadastre a chave como Secret de Edge Functions no Supabase, com o nome `GOOGLE_MAPS_API_KEY`.
4. Nunca coloque essa chave no frontend, no arquivo `.env` público ou no GitHub.
5. Antes de disponibilizar a integração ao público, publique Termos de Uso e Política de Privacidade compatíveis com os requisitos do Google Maps Platform.

A verificação é executada em lotes de cinco unidades e evita repetir consultas por 30 dias.

## Coleta automática de preços — cidade-piloto

A primeira região de coleta é **Teresina, PI**.

- A função `catalog-import` consulta diariamente a fonte comunitária Open Prices.
- A execução agendada ocorre às 06:00 no horário de Teresina (09:00 UTC).
- Somente estabelecimentos verificados e geolocalizados da cidade-piloto entram na correspondência.
- São importados apenas preços recentes em BRL, com correspondência exata de código de barras, estabelecimento/localização e evidência de etiqueta ou recibo.
- Duplicatas são descartadas e disponibilidade/estoque nunca é inferida.
- Observações comunitárias novas continuam pendentes para revisão; a coleta é automática, mas isso não transforma relatos comunitários em preços oficiais.
- A expansão para outra cidade exige habilitar a nova região no escopo de coleta após a validação do piloto.

## Moderação administrativa de preços

O painel de moderação fica em **Perfil → Moderação de preços** e permite revisar observações antes de elas aparecerem nas comparações.

- Entre com uma conta autenticada e informe o mesmo token administrativo validado pelo RPC `verify_catalog_import_token` usado pelo importador do catálogo.
- O token é enviado somente ao Edge Function `price-review`; não é gravado no navegador nem no repositório.
- O painel exibe produto, apresentação, estabelecimento, valor, data, disponibilidade e link da fonte.
- A aprovação só é permitida quando o produto está ativo e o estabelecimento está verificado. A disponibilidade não é alterada pela aprovação.
- Registros rejeitados permanecem no banco com status `rejected`, mas não entram nas comparações.
- Preços aprovados continuam sujeitos à janela de atualização de 30 dias usada pela busca e pelo mapa.

A função `price-review` exige JWT de uma sessão autenticada e valida o token administrativo no servidor. Nenhuma chave de serviço é enviada ao frontend.

