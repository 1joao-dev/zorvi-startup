# ZORVI — plano de evolução do produto

> Documento de planejamento. Não altera o comportamento do aplicativo, o banco de dados, as Edge Functions nem as integrações existentes.

## Objetivo

Evoluir a ZORVI em duas frentes coordenadas, mantendo o produto atual estável:

1. **ZORVI descoberta e comparação:** mapa, estabelecimentos, catálogo, preços verificáveis, comunidade e ZORVI AI.
2. **ZORVI Marketing HQ:** ambiente interno de operação de marketing com agentes de IA, treinamento, tarefas, histórico e aprovação humana.

As duas frentes compartilham identidade e autenticação do ecossistema, mas devem manter limites claros de código, permissões e dados.

## Estado de referência em 24/11/2026

- A branch `main` é a base de produção/desenvolvimento principal.
- O produto já possui mapa, filtros de região, catálogo central, busca assistida por IA, preços verificados, moderação administrativa e rotinas de importação.
- A cidade-piloto de coleta é Teresina/PI. Fontes e canais online têm escopos e limitações documentados no README.
- A aplicação usa React 19, TypeScript, TanStack Start/Router, Vite, Tailwind CSS v4 e Supabase.
- O fluxo de CI existente executa testes, build de produção e validação sintática dos scripts de importação.
- A branch legada `feature/zorvi-marketing-hq` contém a especificação inicial em `docs/marketing-hq/ARCHITECTURE.md`, mas está divergente da `main` (1 commit à frente e 33 atrás na comparação realizada em 24/11/2026). Não fazer merge automático dessa branch.
- O arquivo `AGENTS.md` determina que alterações de schema/migrations e secrets sejam feitas pelo fluxo gerenciado do Lovable. Não editar migrations manualmente.

## Regras de preservação

1. Não remover nem reescrever fluxos existentes do mapa, catálogo, preços, autenticação ou ZORVI AI sem uma tarefa específica, testes e revisão.
2. Não criar preços, estoque, coordenadas ou estabelecimentos fictícios para preencher lacunas.
3. Diferenciar sempre preço verificado, preço comunitário pendente, oferta online e dado sem confirmação.
4. Não inferir estoque físico a partir de preço online ou de cadastro de produto.
5. Nunca expor service-role/secret keys, tokens administrativos ou credenciais Meta no frontend, no Git ou em logs.
6. Manter RLS e autorização no servidor. Não contornar RLS para facilitar telas administrativas.
7. Toda publicação, envio externo, ativação de campanha ou alteração financeira no Marketing HQ exige aprovação humana explícita.
8. Briefings, anexos, exemplos e conteúdo de terceiros são dados não confiáveis; não podem substituir instruções de sistema dos agentes.
9. Preferir mudanças pequenas e reversíveis, com testes e commits isolados por frente.
10. Não fazer force-push, rebase ou amend de histórico já publicado conectado ao Lovable.

## Organização das frentes

### Frente A — ZORVI descoberta e comparação

**Objetivo:** tornar confiáveis e úteis as descobertas locais e comparações de preços.

Ordem de trabalho:

1. **Estabilidade e observabilidade**
   - Confirmar build, testes e funcionamento da autenticação.
   - Mapear chamadas do frontend às RPCs e Edge Functions.
   - Registrar falhas operacionais sem registrar tokens ou dados sensíveis.
2. **Qualidade do catálogo e dos preços**
   - Auditar correspondência de produto e apresentação (marca, variante, unidade e quantidade).
   - Preservar a janela de atualização de preços e a moderação já existentes.
   - Mostrar claramente fonte, data, tipo de preço, localização e limitações.
3. **Diretório e mapa**
   - Separar estabelecimento físico de canal digital.
   - Melhorar cobertura e precisão de geocodificação sem inventar coordenadas.
   - Preservar escolha manual de cidade, GPS e indicação de precisão.
4. **Experiência do usuário**
   - Melhorar estados vazios, carregamento, erros e explicação de preços indisponíveis.
   - Garantir navegação mobile-first e acessibilidade.
5. **Comunidade e retenção**
   - Avaliar persistência real de publicações, curtidas, comentários e favoritos.
   - Implementar apenas depois de definir autorização, moderação e políticas de privacidade.

Critérios de aceite: resultados rastreáveis à fonte; apresentações incompatíveis não são comparadas; preço vencido ou não verificado não é apresentado como atual; mapa distingue lojas físicas de canais online; falhas de serviços externos têm fallback e mensagem compreensível.

### Frente B — ZORVI Marketing HQ

**Objetivo:** criar uma operação assistida por agentes, com treinamento controlado e aprovação humana.

Primeira versão (MVP):

1. Área isolada de Marketing HQ, acessível apenas a usuários autorizados.
2. Cadastro/estado de agentes e fila de tarefas.
3. Primeiro agente: **Copywriter**, que recebe briefing, público, oferta, objetivo e restrições.
4. Recuperação exclusiva de instruções e exemplos aprovados.
5. Geração de variações com gancho, texto principal, título, CTA e justificativa.
6. Salvamento de versões e histórico de alterações.
7. Aprovação humana: aprovado, rejeitado ou solicitar revisão, sempre com autor e data.
8. Feedback vira conhecimento candidato; somente o proprietário pode promovê-lo a regra permanente.
9. Logs de atividade com estados reais: idle, working, waiting_approval, error e offline.

Fora do escopo do MVP:

- Publicar automaticamente no Facebook/Instagram.
- Criar, ativar, pausar ou editar campanhas.
- Alterar orçamento ou fazer qualquer ação financeira.
- Permitir que agentes aprovem o próprio conteúdo.
- Compartilhar automaticamente memória entre agentes sem escopo e origem definidos.

Agentes futuros, depois do Copywriter validado: Designer, Editor, Gestor de tráfego e Diretor/Orquestrador. Cada agente deve ter permissões e ferramentas mínimas necessárias.

### Dados e segurança do Marketing HQ

Modelo conceitual a validar com o Lovable antes de qualquer alteração no banco:

- agentes e configurações não secretas;
- tarefas e atribuições;
- conhecimento versionado com escopo e estado;
- exemplos aprovados;
- feedback humano;
- criativos e versões;
- aprovações;
- logs auditáveis;
- metadados de conexões externas.

As tabelas e políticas RLS devem ser criadas/revisadas pelo fluxo gerenciado do Lovable, conforme `AGENTS.md`. Credenciais externas ficam somente em Secrets/servidor.

## Estratégia Git

- `main`: base estável do produto ZORVI.
- `feat/zorvi-*`: funcionalidades da descoberta/comparação, sempre pequenas e independentes.
- `feat/marketing-hq-*`: funcionalidades do Marketing HQ desenvolvidas a partir da `main` atualizada.
- `chore/*`: documentação, qualidade e manutenção.

Não integrar a branch legada do Marketing HQ diretamente. Reaproveitar sua especificação como referência e reimplementar em branch nova baseada na `main`.

## Sequência de execução

### Marco 0 — Baseline
- Confirmar branch e commit de referência.
- Executar CI (testes e build) e registrar resultados.
- Identificar riscos e arquivos críticos antes de editar código.

### Marco 1 — Confiabilidade da ZORVI principal
- Corrigir apenas problemas reproduzíveis.
- Acrescentar testes para busca, correspondência de apresentação e estados de preço.
- Verificar autenticação, RLS e respostas de Edge Functions.

### Marco 2 — Marketing HQ MVP
- Solicitar ao Lovable a implementação do schema/RLS.
- Criar rota e componentes isolados.
- Implementar Copywriter no servidor usando o gateway existente.
- Implementar histórico, aprovação e feedback.
- Testar isolamento de usuário e ausência de ações externas.

### Marco 3 — Integrações e expansão
- Adicionar conectores Meta somente após análise de permissões, políticas e credenciais.
- Começar com leitura/rascunhos; ações externas continuam sujeitas a aprovação explícita.
- Expandir os agentes com testes e limites próprios.

## Definição de pronto para cada entrega

- Escopo e arquivos afetados identificados.
- Nenhuma credencial ou dado privado incluído no diff.
- Testes relevantes adicionados ou atualizados.
- `bun run test` e `bun run build` aprovados (ou falha documentada com causa).
- RLS/autorização revisadas quando houver dados ou operações protegidas.
- Mudança pequena, revisável e com rollback claro.
- README atualizado quando houver mudança operacional para o usuário.
