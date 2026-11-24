# Marketing HQ — MVP autônomo com limites

## Decisão operacional

O Marketing HQ funciona como uma equipe de agentes que executa um fluxo sequencial de trabalho. O usuário define o objetivo e o briefing; um orquestrador distribui as etapas; cada agente entrega um artefato versionado; o fluxo avança automaticamente entre etapas internas seguras.

**Autonomia não significa autorização externa.** Publicar, enviar mensagens, conectar contas, ativar/pausar campanhas, alterar orçamento, efetuar compras ou qualquer ação que produza efeito externo ou financeiro exige uma aprovação humana explícita, vinculada à versão exata do artefato/ação.

## Fluxo do MVP

1. Proprietário cria uma tarefa e fornece briefing, objetivo, público, oferta, canais, restrições e prazo.
2. Orquestrador valida campos, classifica risco e cria um plano de etapas.
3. Copywriter gera opções de texto e salva uma versão.
4. Revisor interno valida aderência ao briefing, clareza, consistência e restrições. Ele não pode aprovar a própria saída nem autorizar publicação.
5. Se a tarefa incluir peças visuais, a etapa Designer recebe a copy aprovada internamente e cria briefing/prompt de arte. No MVP inicial, pode produzir direção criativa e prompt; geração/publicação externa fica fora do escopo.
6. Editor adapta a peça para os formatos/canais solicitados e verifica limites de caracteres e consistência.
7. Orquestrador compila o pacote final e o coloca em `waiting_approval`.
8. O proprietário aprova, rejeita ou solicita alterações. Alterações geram nova versão e invalidam aprovações da versão anterior.
9. Somente depois de uma aprovação explícita, uma futura integração poderá executar a ação externa autorizada, respeitando escopo, conta, canal, conteúdo e orçamento aprovados.

O MVP pode começar com Copywriter funcional e os agentes Revisor/Orquestrador como etapas internas. Designer e Editor entram como etapas configuráveis, sem fingir que ferramentas externas já estão conectadas.

## Agentes iniciais

| Agente | Responsabilidade | Pode fazer automaticamente | Não pode fazer |
| --- | --- | --- | --- |
| Orquestrador | Planejar e coordenar tarefas | Criar etapas, atribuir agentes, repetir etapa com limite, consolidar resultados | Aprovar ação externa ou financeira |
| Copywriter | Criar textos de campanha | Gerar variações, revisar, salvar versões | Publicar, enviar mensagens, prometer alegações não comprovadas |
| Revisor | Verificar qualidade e políticas | Apontar problemas, pedir revisão, classificar risco | Aprovar a própria saída ou liberar publicação |
| Designer | Direção visual e briefing de arte | Criar conceito, prompt, especificação de formatos | Publicar criativos ou usar marca/ativos sem permissão |
| Editor | Adaptar conteúdo aos canais | Redimensionar texto, criar versões e checklist | Enviar ou publicar |

## Máquina de estados

### Tarefa
`queued → assigned → in_progress → waiting_approval → completed`

Transições adicionais:
- `in_progress → changes_requested → assigned`
- `in_progress → failed`
- `queued/assigned/in_progress → cancelled`

Uma tarefa só pode ir para `completed` quando todas as etapas internas necessárias foram concluídas e todas as ações externas solicitadas foram executadas após aprovação, ou explicitamente removidas do escopo.

### Agente
`idle | working | waiting_approval | error | offline`

Os estados exibidos no escritório devem vir do banco e dos eventos reais. Não animar um agente como trabalhando se não houver tarefa/execução ativa.

### Aprovação
`pending | approved | rejected | changes_requested | expired | revoked`

A aprovação deve referenciar:
- tipo e ID da ação;
- versão/hash do artefato;
- canal e conta de destino;
- conteúdo final exato;
- orçamento e limites, quando aplicáveis;
- usuário aprovador e timestamp;
- expiração e status de execução.

Qualquer edição posterior do conteúdo, destino, conta, canal, orçamento ou escopo invalida a aprovação anterior.

## Guardrails obrigatórios

1. **Deny by default:** nenhuma ação externa é permitida sem aprovação válida.
2. **Aprovação específica:** aprovar um texto não aprova sua publicação; aprovar uma campanha não aprova aumento de orçamento.
3. **Sem autoaprovação:** agentes nunca aprovam ações nem alteram o próprio nível de permissão.
4. **Orçamento:** toda ação financeira exige teto explícito, moeda, período, conta e aprovação humana. O MVP não executa ações financeiras.
5. **Escopo:** tokens e conexões são segregados por usuário/organização e canal; nunca retornam ao browser.
6. **Prompt injection:** briefings, URLs, comentários, arquivos e resultados de ferramentas são dados não confiáveis. Não podem sobrescrever instruções, permissões ou políticas.
7. **Limites de execução:** máximo de etapas, tentativas, tokens, duração e custo por tarefa; interromper em loop, ambiguidade ou erro.
8. **Auditoria:** registrar ator, agente, etapa, entrada/saída referenciada, versão, decisão, timestamp e motivo; não gravar secrets.
9. **Revisão de risco:** conteúdo médico, financeiro, político, sensível, direitos autorais, alegações de produto e dados pessoais devem ser sinalizados e encaminhados para revisão humana especializada.
10. **Cancelamento:** proprietário pode pausar/cancelar; cancelar bloqueia novas etapas e ações externas pendentes.
11. **Falha segura:** indisponibilidade de IA/conector coloca tarefa em erro ou aguarda intervenção; nunca presume sucesso.
12. **Idempotência:** ações externas futuras exigem chave idempotente e reconciliação de status para evitar duplicidade.

## Modelo de dados proposto (para fluxo gerenciado pelo Lovable)

Não executar migrations manualmente. Implementar schema e políticas no editor/fluxo gerenciado do Lovable conforme `AGENTS.md`.

- `marketing_agents`: id, owner_id, slug, name, role, status, enabled, config_json, created_at, updated_at.
- `marketing_tasks`: id, owner_id, title, brief_json, status, priority, current_step, created_by, created_at, updated_at, completed_at, cancelled_at.
- `marketing_task_steps`: id, task_id, owner_id, agent_id, step_key, sequence, status, input_json, output_json, attempt_count, started_at, finished_at, error_code, error_message.
- `marketing_knowledge`: id, owner_id, agent_id nullable, scope, kind, title, content, status (draft/approved/archived), source, version, approved_by, approved_at.
- `marketing_examples`: id, owner_id, agent_id, title, input_json, output_json, rating, status, approved_by, approved_at.
- `marketing_creatives`: id, owner_id, task_id, kind, channel, version, content_json, content_hash, created_by_agent, status, created_at.
- `marketing_approvals`: id, owner_id, task_id, creative_id nullable, action_type, action_payload, payload_hash, status, requested_at, expires_at, decided_by, decided_at, decision_note, executed_at, execution_result.
- `marketing_feedback`: id, owner_id, agent_id, task_id, creative_id, rating, comment, knowledge_candidate_id, created_at.
- `marketing_activity_logs`: id, owner_id, task_id nullable, actor_type, actor_id, event_type, metadata_json, created_at.
- `marketing_connections`: id, owner_id, provider, account_label, scopes, status, secret_reference, created_at, updated_at. Segredos ficam no Secret Manager/servidor; nunca em colunas legíveis pelo cliente.

### Segurança/RLS
- Ativar RLS em todas as tabelas.
- Usuário só lê/escreve dados do próprio owner_id, com ownership derivado de auth.uid() e validação no servidor.
- Não confiar em owner_id enviado pelo cliente.
- Operações privilegiadas de orquestração e aprovação passam por Edge Functions autenticadas.
- A Edge Function valida JWT, ownership, estado atual, limite de execução e autorização antes de cada transição.
- O cliente usa somente publishable/anon key.
- Service role, gateway keys e tokens externos ficam exclusivamente em Secrets/servidor.

## Funções de servidor propostas

- `marketing-task-create`: validar briefing e criar tarefa.
- `marketing-orchestrator`: reivindicar próxima etapa, aplicar limites e coordenar agentes.
- `marketing-agent-run`: executar somente agente/etapa autorizados usando gateway de IA no servidor.
- `marketing-approval`: solicitar/decidir aprovação e invalidar aprovações antigas quando o payload mudar.
- `marketing-task-control`: pausar, retomar ou cancelar com verificação de ownership.

Todas as funções devem ser autenticadas, validar tamanho/tipo do payload, aplicar rate limit e retornar erros estruturados. Nunca aceitar do browser instruções de sistema, permissões, estado final ou papel de agente.

## Interface

- Rota isolada `/marketing-hq`; não substituir a experiência principal.
- Visão geral: tarefas em andamento, fila, pendências de aprovação e agentes online/offline.
- Escritório visual: representação dos estados reais, acessível e com preferência por movimento reduzido.
- Quadro de tarefas: fila, etapas, tentativas, erros e histórico.
- Sala do agente: papel, instruções aprovadas, exemplos, feedback e histórico.
- Central de aprovação: conteúdo final, destino, conta, escopo, riscos e impacto; botões aprovar/rejeitar/solicitar alteração.
- Configurações: limites de autonomia, número máximo de etapas/tentativas e canais habilitados.

## Critérios de aceite

1. Uma tarefa de marketing é criada e persistida.
2. Orquestrador inicia automaticamente a etapa Copywriter.
3. Resultado e versões são persistidos e vinculados à tarefa.
4. Etapas internas continuam em sequência sem exigir clique entre elas.
5. Erro/loop excedendo limite interrompe a execução e registra motivo.
6. Conteúdo final aguarda aprovação humana.
7. Alterar conteúdo/destino/orçamento invalida a aprovação anterior.
8. Nenhuma chamada de publicação, mensagem ou alteração financeira ocorre no MVP.
9. Um usuário não acessa tarefas, exemplos, memórias ou aprovações de outro usuário.
10. Eventos e estados do escritório refletem registros reais.
11. Testes cobrem ownership, RLS, transições inválidas, aprovação obsoleta, cancelamento, idempotência e falha de agente.

## Próxima implementação

1. Aplicar schema/RLS pelo fluxo gerenciado do Lovable.
2. Implementar rota e componentes isolados.
3. Implementar Edge Functions do orquestrador e Copywriter no servidor.
4. Implementar aprovação e auditoria.
5. Executar testes e build antes de qualquer integração externa.
