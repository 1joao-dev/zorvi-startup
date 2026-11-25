# ZORVI — instruções do repositório

Este repositório contém o código-fonte da plataforma ZORVI.

## Princípios de desenvolvimento

- Preserve funcionalidades existentes e faça alterações pequenas e verificáveis.
- Use TypeScript e os padrões já adotados pelo projeto.
- Mantenha componentes reutilizáveis em `src/components/`, rotas em `src/routes/` e utilitários em `src/lib/`.
- Não exponha credenciais no frontend, no Git ou em arquivos versionados.
- Segredos de backend devem ser configurados exclusivamente nos ambientes seguros do Supabase/Vercel.
- Não desative Row Level Security (RLS) para contornar problemas de acesso.
- Não publique conteúdo, envie mensagens ou execute ações financeiras sem aprovação humana explícita.
- Atualize testes e documentação quando alterar comportamentos importantes.

## Stack

- React, TypeScript e TanStack Start/Router
- Vite, Tailwind CSS e Radix UI
- Supabase (PostgreSQL, Auth e Edge Functions)
- Vercel para hospedagem
- GitHub Actions para integração contínua

## Fluxo recomendado

1. Crie uma branch para cada alteração.
2. Execute `bun install` quando houver mudanças nas dependências.
3. Execute `bun run lint`, `bun run test` e `bun run build`.
4. Abra um Pull Request com resumo, testes e impactos.
5. Integre na `main` somente após revisão.

## Banco e funções serverless

- Migrações versionadas ficam em `supabase/migrations/`.
- Edge Functions ficam em `supabase/functions/`.
- Revise políticas RLS e validações de autorização antes de alterar operações protegidas.
