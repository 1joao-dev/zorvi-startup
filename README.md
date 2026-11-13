# ZORVI

**Tudo se conecta. Tudo se descobre.**

A ZORVI é uma experiência social mobile-first para descobrir pessoas, estabelecimentos, produtos, preços, promoções e experiências em um só lugar.

## Experiência atual

- **Início:** feed da comunidade, publicações demonstrativas, curtidas, favoritos e criação de post.
- **Mapa:** visualização ilustrativa de locais, filtros por categoria e pesquisa.
- **ZORVI AI:** interface de chat com sugestões de perguntas e respostas de demonstração.
- **Explorar:** categorias e atalhos para descobertas.
- **Perfil:** perfil demonstrativo, itens salvos e alternância entre tema escuro e claro.

## Stack

- React 19 + TypeScript
- TanStack Start / Router
- Vite
- Tailwind CSS v4
- Lucide React

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

## Próximas integrações

A interface atual usa conteúdo de demonstração. Ainda não há autenticação, persistência, dados de preços/ofertas em tempo real, mapa Mapbox ou modelo de IA conectado. Planejamento de integrações futuras:

1. Supabase para autenticação, perfis, publicações e dados.
2. Mapbox para mapas e geolocalização, com consentimento do usuário.
3. Gateway seguro de IA para o chat ZORVI AI.
4. Fontes verificadas para preços, estabelecimentos e promoções.

**Importante:** locais, distâncias, publicações e respostas exibidos na versão inicial são demonstrativos e não representam ofertas ou informações verificadas.
