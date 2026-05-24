# Requirements: ClínicaFlow

**Defined:** 2026-05-23
**Core Value:** Transformar a base de pacientes inativos em faturamento recorrente de forma automática — o cliente vê em R$ quanto recuperou no mês

---

## v1 Requirements

### Foundation (Infraestrutura)

- [x] **FOUND-01**: Sistema inicializa como monorepo pnpm + Turborepo com apps/api, apps/web, apps/worker, packages/db, packages/shared, packages/ai, packages/whatsapp, packages/billing ✓ 2026-05-24 (Plan 01-01)
- [ ] **FOUND-02**: Toda query ao banco é filtrada automaticamente por tenant_id via Prisma $extends + AsyncLocalStorage, sem possibilidade de cross-tenant query acidental
- [ ] **FOUND-03**: Suite de testes de isolamento multi-tenant roda em CI e bloqueia merge se detectar query sem tenant_id
- [ ] **FOUND-04**: Usuário pode criar conta, fazer login e permanecer autenticado via JWT + refresh token httpOnly cookie
- [ ] **FOUND-05**: Usuário pode fazer logout e ter sessão invalidada imediatamente
- [ ] **FOUND-06**: Toda operação de leitura e escrita de dados de paciente gera entrada em audit_log com action, entity, entity_id, user_id, tenant_id e metadata sem PII

### Importação de Pacientes

- [ ] **IMPORT-01**: Usuário pode fazer upload de arquivo CSV ou Excel (até 50k linhas) de base de pacientes
- [ ] **IMPORT-02**: Sistema apresenta wizard de mapeamento de colunas com sugestão automática baseada em nomes comuns (Celular, Tel. Celular, FONE CEL, Nome, Paciente, etc.)
- [ ] **IMPORT-03**: Sistema normaliza telefones para E.164 (+55DDXXXXXXXXX) e deduplica por telefone normalizado dentro do tenant
- [ ] **IMPORT-04**: Sistema detecta e converte encoding Windows-1252 e BOM Excel automaticamente
- [ ] **IMPORT-05**: Usuário pode reimportar CSV sem sobrescrever dados de pacientes já ativos (merge por telefone normalizado)
- [ ] **IMPORT-06**: Importação de 50k linhas conclui em menos de 2 minutos

### Segmentação

- [ ] **SEG-01**: Sistema segmenta automaticamente pacientes em inativos 3-6m, 6-12m, 12-24m e 24m+ baseado em last_visit_at
- [ ] **SEG-02**: Sistema segmenta automaticamente aniversariantes do mês corrente baseado em birth_date
- [ ] **SEG-03**: Sistema segmenta automaticamente pacientes com tratamento em aberto (treatment.status = in_progress sem visita recente)
- [ ] **SEG-04**: Sistema segmenta automaticamente pacientes com última limpeza odonto há mais de 6 meses baseado em tipo de procedimento
- [ ] **SEG-05**: Usuário vê o tamanho de cada segmento antes de criar uma campanha

### Configuração de IA por Clínica

- [ ] **AICONF-01**: Usuário pode editar o prompt base da IA com preview em tempo real de como a IA responderia a uma mensagem de teste
- [ ] **AICONF-02**: Usuário pode selecionar tom de voz (formal, informal, regional)
- [ ] **AICONF-03**: Usuário pode fazer upload ou editar FAQ da clínica (preços, convênios, endereço, horário) que a IA usa como fonte primária
- [ ] **AICONF-04**: Usuário pode configurar horário de atendimento da IA (fora do horário, IA informa e não tenta qualificar)
- [ ] **AICONF-05**: Usuário pode configurar lista de palavras-gatilho que forçam transferência imediata para humano (dor forte, sangramento, emergência, etc.)
- [ ] **AICONF-06**: Seção de restrições clínicas é somente leitura para o usuário (não pode remover guardrails)

### Campanhas

- [ ] **CAMP-01**: Usuário pode criar campanha selecionando segmento, template e configurações de disparo
- [ ] **CAMP-02**: Sistema oferece 6 templates prontos para odontologia: recall de limpeza, inativo gentil, inativo com oferta, aniversário, tratamento em aberto, reativação anual
- [ ] **CAMP-03**: Usuário pode usar variáveis dinâmicas ({{nome}}, {{ultima_visita}}, {{tratamento}}) com fallback inteligente quando campo é nulo
- [ ] **CAMP-04**: IA reescreve cada mensagem com variação única por paciente antes do envio
- [ ] **CAMP-05**: Usuário pode configurar janela de disparo (padrão 9h-20h, sem domingo, sem feriado nacional)
- [ ] **CAMP-06**: Usuário pode criar teste A/B com duas variações de mensagem e comparar taxa de resposta
- [ ] **CAMP-07**: Usuário pode pausar e cancelar campanha em andamento sem perder estado dos jobs já enfileirados

### Disparo WhatsApp

- [ ] **WA-01**: Sistema respeita rate limit de 20 msgs/min por número com typing indicator antes de cada mensagem e delay aleatório de 3-15s
- [ ] **WA-02**: Sistema exibe status de entrega por mensagem (enviado/entregue/lido/falhou) atualizado via webhook Evolution API
- [ ] **WA-03**: Sistema implementa aquecimento gradual de 7 dias para números novos antes de permitir campanha em massa
- [ ] **WA-04**: Webhook da Evolution API retorna 200 imediatamente após verificação HMAC e processa de forma assíncrona na fila
- [ ] **WA-05**: Jobs de disparo são idempotentes — reprocessamento de job não envia mensagem duplicada

### IA Conversacional

- [ ] **AICONV-01**: Quando paciente responde campanha, IA responde em menos de 30 segundos
- [ ] **AICONV-02**: IA usa FAQ da clínica como fonte primária, cache Redis para respostas frequentes (TTL 1h)
- [ ] **AICONV-03**: Toda resposta da IA passa por filtro pós-geração em código antes de ser enviada — mensagens com diagnóstico, promessa de resultado ou preço sem fallback são bloqueadas e escaladas para humano
- [ ] **AICONV-04**: IA usa Claude Haiku para triagem (primeiro turno) e Claude Sonnet para conversas qualificadas
- [ ] **AICONV-05**: Após 8 turnos sem agendamento, IA transfere para humano automaticamente
- [ ] **AICONV-06**: Conversa idle por 24h é encerrada automaticamente
- [ ] **AICONV-07**: Quando palavra-gatilho é detectada, IA transfere imediatamente para humano com resumo do contexto
- [ ] **AICONV-08**: Se paciente não responde em 3 dias, sistema dispara follow-up automático; se continuar sem resposta, segundo follow-up em 7 dias

### Inbox (Equipe da Clínica)

- [ ] **INBOX-01**: Usuário da clínica vê lista de conversas ativas com indicador visual: gerenciada pela IA vs aguardando humano
- [ ] **INBOX-02**: Usuário da clínica vê histórico completo da conversa incluindo mensagens da IA antes de assumir
- [ ] **INBOX-03**: Usuário da clínica pode assumir conversa da IA e depois devolver de volta para a IA
- [ ] **INBOX-04**: Painel lateral no chat mostra perfil do paciente: histórico de visitas, tratamentos, valor gasto, tags

### Confirmação de Consultas

- [ ] **CONF-01**: Sistema dispara mensagem de confirmação 48h antes de cada consulta agendada
- [ ] **CONF-02**: Sistema dispara lembrete final 3h antes de consulta confirmada
- [ ] **CONF-03**: Se paciente diz que não pode comparecer, IA oferece horários alternativos para reagendamento
- [ ] **CONF-04**: Falta a consulta registra no-show e dispara mensagem de recuperação no dia seguinte

### Dashboard de ROI

- [ ] **DASH-01**: Dashboard exibe R$ de faturamento recuperado estimado no mês em destaque (agendamentos confirmados × ticket médio do tenant)
- [ ] **DASH-02**: Dashboard exibe funil por campanha: enviadas → entregues → lidas → respondidas → agendadas
- [ ] **DASH-03**: Dashboard exibe comparativo mês a mês lado a lado
- [ ] **DASH-04**: Usuário pode exportar relatório mensal em PDF para enviar ao contador/sócio

### Onboarding e Billing

- [ ] **ONBOARD-01**: Novo tenant passa por checklist de ativação gamificado com progresso visível: conectar WhatsApp, importar base, configurar IA, disparar 1ª campanha
- [ ] **ONBOARD-02**: Trial de 14 dias sem cartão, com aviso por email 3 dias antes do encerramento
- [ ] **ONBOARD-03**: Tenant pode assinar plano (Starter/Pro/Multi) via Pagar.me com cartão recorrente ou Pix
- [ ] **ONBOARD-04**: Sistema envia notificações de ativação por email (D+1, D+3, D+7) se tenant não completou o checklist de onboarding

---

## v2 Requirements

### Integrações Nativas

- **INT-01**: Integração nativa com Clinicorp via API ou export automatizado
- **INT-02**: Integração nativa com Easy Dental
- **INT-03**: Agendamento direto via Google Calendar com OAuth flow
- **INT-04**: Integração com Doctoralia (somente agenda)

### Funcionalidades Avançadas

- **ADV-01**: Análise preditiva de risco de abandono de paciente (requer 6+ meses de dados)
- **ADV-02**: Pesquisa de satisfação automática pós-consulta + pedido de avaliação no Google
- **ADV-03**: Programa de indicação automatizado
- **ADV-04**: Multi-unidade com relatórios consolidados (plano Multi já previsto, mas consolidação avançada é v2)
- **ADV-05**: Módulo financeiro (cobrança via WhatsApp)

### Plataforma

- **PLAT-01**: App mobile nativo para dono acompanhar conversas
- **PLAT-02**: White label para agências/implantadores
- **PLAT-03**: API pública para integrações externas

---

## Out of Scope

| Feature | Reason |
|---------|--------|
| Prontuário eletrônico | Regulação CFO/CFM — fora do escopo de recuperação de pacientes |
| Teleconsulta | Regulado pelo CFM |
| Pagamento online de consulta | Regulado no contexto de saúde |
| Captação de paciente novo via ads | Foco é base existente, não captação |
| Multi-idioma | Só PT-BR no MVP |
| Atendimento de hospital/rede grande (>10 unidades) | ICP diferente, complexidade operacional |
| OpenAI como IA | Custo + LGPD — Claude é o padrão |
| MongoDB ou NoSQL para dados de paciente | PostgreSQL é obrigatório para dados de saúde |
| Normalização de telefone e deduplicação (v1 não selecionado) | Adiado pelo owner — risco de dados duplicados; recomendar incluir antes de piloto real |

---

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| FOUND-01 | Phase 1 | Complete — Plan 01-01 (2026-05-24) |
| FOUND-02 | Phase 1 | Pending |
| FOUND-03 | Phase 1 | Pending |
| FOUND-04 | Phase 1 | Pending |
| FOUND-05 | Phase 1 | Pending |
| FOUND-06 | Phase 1 | Pending |
| IMPORT-01 | Phase 2 | Pending |
| IMPORT-02 | Phase 2 | Pending |
| IMPORT-03 | Phase 2 | Pending |
| IMPORT-04 | Phase 2 | Pending |
| IMPORT-05 | Phase 2 | Pending |
| IMPORT-06 | Phase 2 | Pending |
| SEG-01 | Phase 2 | Pending |
| SEG-02 | Phase 2 | Pending |
| SEG-03 | Phase 2 | Pending |
| SEG-04 | Phase 2 | Pending |
| SEG-05 | Phase 2 | Pending |
| AICONF-01 | Phase 2 | Pending |
| AICONF-02 | Phase 2 | Pending |
| AICONF-03 | Phase 2 | Pending |
| AICONF-04 | Phase 2 | Pending |
| AICONF-05 | Phase 2 | Pending |
| AICONF-06 | Phase 2 | Pending |
| CAMP-01 | Phase 3 | Pending |
| CAMP-02 | Phase 3 | Pending |
| CAMP-03 | Phase 3 | Pending |
| CAMP-04 | Phase 3 | Pending |
| CAMP-05 | Phase 3 | Pending |
| CAMP-06 | Phase 3 | Pending |
| CAMP-07 | Phase 3 | Pending |
| WA-01 | Phase 3 | Pending |
| WA-02 | Phase 3 | Pending |
| WA-03 | Phase 3 | Pending |
| WA-04 | Phase 3 | Pending |
| WA-05 | Phase 3 | Pending |
| AICONV-01 | Phase 4 | Pending |
| AICONV-02 | Phase 4 | Pending |
| AICONV-03 | Phase 4 | Pending |
| AICONV-04 | Phase 4 | Pending |
| AICONV-05 | Phase 4 | Pending |
| AICONV-06 | Phase 4 | Pending |
| AICONV-07 | Phase 4 | Pending |
| AICONV-08 | Phase 4 | Pending |
| INBOX-01 | Phase 4 | Pending |
| INBOX-02 | Phase 4 | Pending |
| INBOX-03 | Phase 4 | Pending |
| INBOX-04 | Phase 4 | Pending |
| CONF-01 | Phase 5 | Pending |
| CONF-02 | Phase 5 | Pending |
| CONF-03 | Phase 5 | Pending |
| CONF-04 | Phase 5 | Pending |
| DASH-01 | Phase 5 | Pending |
| DASH-02 | Phase 5 | Pending |
| DASH-03 | Phase 5 | Pending |
| DASH-04 | Phase 5 | Pending |
| ONBOARD-01 | Phase 6 | Pending |
| ONBOARD-02 | Phase 6 | Pending |
| ONBOARD-03 | Phase 6 | Pending |
| ONBOARD-04 | Phase 6 | Pending |

**Coverage:**
- v1 requirements: 54 total
- Mapped to phases: 54
- Unmapped: 0 ✓

---
*Requirements defined: 2026-05-23*
*Last updated: 2026-05-23 after initial definition*
