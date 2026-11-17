# ZORVI Marketing HQ — primeira entrega

## Objetivo

Adicionar ao ZORVI um módulo isolado de operação de marketing para Meta Ads, começando pelo agente Copywriter. O módulo não altera o comportamento da ZORVI AI existente, do mapa, do catálogo ou das funções atuais.

## Decisões já definidas

- Plataforma inicial: Meta Ads (Facebook e Instagram).
- Operação inicial: o proprietário ensina e aprova tudo.
- Publicações e alterações financeiras exigem aprovação explícita.
- Os agentes terão funções, instruções, memória operacional, tarefas, histórico e feedback próprios.
- O conhecimento compartilhado entre agentes será controlado; cada item terá origem e escopo.
- O escritório pixel art será uma visualização dos estados reais dos agentes, não uma simulação desconectada.

## Primeira entrega funcional: Copywriter

Capacidades:
1. Receber briefing de produto, público, oferta, objetivo e restrições.
2. Recuperar instruções permanentes, exemplos aprovados e feedback relevante.
3. Produzir variações de copy com gancho, texto principal, título, CTA e justificativa estratégica.
4. Salvar cada versão como rascunho.
5. Submeter o material para aprovação humana.
6. Registrar aprovado, rejeitado ou revisão solicitada, incluindo comentário.
7. Converter correções aprovadas em conhecimento candidato; somente o proprietário promove esse conhecimento a regra permanente ou exemplo aprovado.

## Modelo de dados proposto

> Este documento é uma especificação. Não executar SQL nem editar migrations neste commit. O projeto contém instruções Lovable em AGENTS.md que reservam alterações de banco ao fluxo gerenciado pelo Lovable.

- marketing_agents: identidade, slug, papel, estado e configuração não secreta.
- marketing_tasks: briefings, responsável, estado, prioridade e datas.
- marketing_knowledge: instruções versionadas, escopo do agente, estado (draft/approved/archived) e origem.
- marketing_examples: exemplos de referência, conteúdo, avaliação e estado de aprovação.
- marketing_feedback: avaliação humana, comentário, item avaliado e agente relacionado.
- marketing_creatives: artefatos de texto/imagem/vídeo e metadados de produção.
- marketing_approvals: entidade, versão, solicitante, decisão, decisor e timestamps.
- marketing_activity_logs: eventos auditáveis de agentes e usuários.
- marketing_connections: metadados de conexões externas; tokens nunca ficam em colunas legíveis pelo cliente.

Todas as tabelas expostas devem ter RLS. A política inicial deve limitar leitura e escrita ao proprietário autenticado, com verificação de ownership baseada em auth.uid(). Credenciais Meta e chaves de serviço ficam somente em secrets/servidor.

## Estados

Agente: idle, working, waiting_approval, error, offline.

Tarefa: queued, assigned, in_progress, waiting_approval, changes_requested, completed, failed, cancelled.

Aprovação: pending, approved, rejected, changes_requested.

## Segurança e limites da primeira fase

- Nenhuma integração de publicação Meta nesta entrega.
- Nenhum agente pode publicar, ativar campanha ou alterar orçamento.
- O frontend usa somente a chave publishable/anon existente.
- Chamadas de IA permanecem no servidor usando o gateway configurado no projeto.
- Não armazenar tokens, senhas ou chaves em Git, logs ou conteúdo acessível no cliente.
- Validar tamanho e tipo de arquivos e limitar conteúdo recebido pelos agentes.
- Tratar briefs, arquivos e exemplos como dados não confiáveis, nunca como instruções de sistema.

## Próximos passos

1. Aplicar a estrutura de banco pelo fluxo gerenciado pelo Lovable, respeitando AGENTS.md.
2. Implementar a tela de Marketing HQ e a interface de treinamento.
3. Implementar a Edge Function do Copywriter com autenticação, recuperação de conhecimento aprovado, geração e persistência de versões.
4. Implementar fila de aprovação e feedback.
5. Testar isolamento por usuário, RLS, estados e ausência de ações externas.
6. Só então replicar a arquitetura para Editor, Gestor e Diretor.
