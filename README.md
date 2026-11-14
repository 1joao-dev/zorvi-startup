# ZORVI

**Tudo se conecta. Tudo se descobre.**

A ZORVI é uma experiência social mobile-first para descobrir pessoas, estabelecimentos, produtos, preços, promoções e experiências em um só lugar.

## Experiência atual

- **Início:** feed da comunidade, publicações demonstrativas, curtidas, favoritos e criação de post.
- **Mapa:** base vetorial escura, geolocalização, filtros por categoria, marcadores agrupados e pesquisa de preços.
- **ZORVI AI:** interface de chat com sugestões de perguntas e respostas de demonstração.
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

## Próximas integrações

1. Persistência de publicações, curtidas e comentários no Supabase.
2. Ampliar a cobertura de geocodificação e a precisão das coordenadas dos estabelecimentos.
3. Gateway seguro de IA para o chat ZORVI AI.
4. Fontes verificadas para preços, estabelecimentos e promoções.

**Importante:** locais, distâncias, publicações e respostas exibidos na versão inicial são demonstrativos e não representam ofertas ou informações verificadas.
