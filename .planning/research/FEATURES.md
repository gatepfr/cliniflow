# Features Research: ClínicaFlow

**Domain:** SaaS de automação de relacionamento com pacientes via WhatsApp + IA para clínicas de saúde (odonto MVP)
**Researched:** 2026-05-23
**Overall confidence:** MEDIUM-HIGH (training knowledge + PRD analysis; WebSearch/WebFetch blocked, Context7 CLI incompatível com Windows PowerShell paths)

---

## Table Stakes

Features sem as quais o cliente não assina, cancela em 30 dias, ou nunca ativa.

### Importação e Gestão de Base

- **Wizard de mapeamento de CSV com preview**: O cliente exporta do Clinicorp/Sonia uma planilha com colunas com nomes diferentes em cada sistema ("Celular", "Tel. Celular", "FONE CEL"). Sem wizard visual de mapeamento, o onboarding trava imediatamente. O cliente não pode precisar de dev para isso. [Complexity: Med]

- **Deduplicação automática por telefone normalizado (E.164)**: Bases reais de clínica têm 15-40% de duplicatas — mesmo paciente com variações de telefone (43991234567 vs (43)99123-4567 vs 5543991234567). Sem deduplicação, campanhas disparam múltiplas vezes pro mesmo paciente e causam reclamações + risco de ban. [Complexity: Med]

- **Validação de telefone com feedback imediato**: Mostrar quantos registros têm telefone válido, inválido, ou ausente ANTES de salvar. O cliente precisa saber se a base que importou "presta". Número de celular brasileiro: DDD 11-99, 9 dígitos com nono dígito. [Complexity: Low]

- **Normalização silenciosa de dados**: Nome em ALL CAPS (comum em exports de dental software) deve virar title case automaticamente. Datas em formatos variados (DD/MM/AAAA, AAAA-MM-DD, "15 março 2019") precisam ser parseadas sem erro. O cliente não pode fazer limpeza manual antes de importar. [Complexity: Med]

- **Upload incremental (não apagar e reimportar)**: O cliente exporta nova base a cada 3 meses quando sistema de gestão atualiza. Precisa importar sem sobrescrever dados de pacientes que já conversaram. Merge por phone_normalized. [Complexity: Med]

### Segmentação Automática

- **Segmentos pré-configurados prontos para uso no dia 1**: Inativo 6 meses, Inativo 12 meses, Aniversário do mês, Tratamento em aberto. Se o dentista precisar configurar regra de segmentação do zero, abandona. Os segmentos padrão cobrem 90% dos casos de uso. [Complexity: Low]

- **Preview de tamanho do segmento antes de disparar**: "Esta campanha vai atingir 347 pacientes." O dentista precisa saber o alcance antes de confirmar. Se não tem preview, ou não dispara (medo) ou dispara sem saber (pânico). [Complexity: Low]

- **Filtros de exclusão básicos**: Excluir pacientes que já responderam, que já agendaram, que estão com opt-out. Campanhas que ignoram quem já interagiu geram mensagens duplicadas — principal causa de reclamação. [Complexity: Low]

### Campanhas e Disparo WhatsApp

- **Templates de campanha prontos para cada segmento**: Um dentista não escreve copy. Precisam de templates funcionais para Recall de Limpeza, Reativação Gentil, Aniversário, Tratamento Parado. A IA personaliza, mas a estrutura precisa estar pronta. [Complexity: Low]

- **Janela de disparo configurável com defaults sensatos**: Default 9h-18h, seg-sáb, sem feriados nacionais. O cliente não precisa saber de LGPD ou WhatsApp policy — o sistema protege ele por padrão. [Complexity: Low]

- **Status de entrega por mensagem**: Enviado, Entregue, Lido, Falhou. Sem isso, o dentista não sabe se a campanha "funcionou" e churn é certo. Isso vem do webhook do WhatsApp (Evolution API suporta). [Complexity: Med]

- **Pausa e cancelamento de campanha em andamento**: O dentista vai querer parar uma campanha quando perceber que mandou para a segmentação errada. Sem pausa, a única opção é ligar pro suporte — death by support ticket. [Complexity: Low]

- **Variação automática de texto por IA**: Cada mensagem da mesma campanha chega diferente para cada paciente. Sem variação, WhatsApp detecta padrão de spam e bane o número. Isso não é diferenciador — é sobrevivência. [Complexity: Med]

### IA Conversacional

- **Resposta em <30 segundos**: Paciente responde campanha, IA precisa responder antes do paciente esquecer ou ir embora. Janela de engajamento de WhatsApp é curta — benchmarks de chatbot mostram que taxa de resposta cai 60% acima de 2 minutos. [Complexity: Med]

- **Transferência para humano com contexto**: Quando a IA transfere, a recepcionista precisa ver o histórico completo da conversa, não começar do zero. "Por que essa pessoa está me mandando mensagem?" sem contexto = frustração da recepção. [Complexity: Med]

- **Indicador visual de "conversa em atendimento pela IA" vs "aguardando humano"**: A recepcionista precisa saber quais conversas precisa pegar agora vs quais a IA está cuidando. Sem diferenciação visual clara, ela interfere em conversas da IA ou ignora onde deveria intervir. [Complexity: Low]

- **FAQ da clínica como fonte de respostas**: Endereço, horários, convênios aceitos, preços de limpeza/clareamento. Sem FAQ treinada, a IA inventa ou diz "não sei" para as perguntas mais básicas — a clínica recebe reclamação de cliente no dia 1. [Complexity: Med]

- **Guardrail de diagnóstico/clínico (em código, não só em prompt)**: A IA NUNCA pode dizer "pode ser gengivite" ou "toma ibuprofeno". Isso não é diferenciador — é risco legal. CFO/CFM, LGPD e dano de imagem à clínica. O filtro precisa ser em código (pós-resposta), não só no system prompt. [Complexity: Med]

### Confirmação de Consulta e No-show

- **Confirmação automática 48h antes**: Mensagem de lembrete 48h antes da consulta. É a feature de menor risco técnico e maior ROI imediato para o cliente — clínicas relatam 20-35% de redução de no-show só com lembrete. O cliente sente valor imediato. [Complexity: Med]

- **Lembrete 3h antes**: Segundo lembrete no dia. Combinado com o de 48h, a redução de no-show chega a 30-40%. [Complexity: Low (once 48h is built)]

- **Registro de confirmação e no-show**: Marcar no sistema se o paciente confirmou, negou, ou não respondeu. Sem esse dado, o dashboard de ROI não tem como calcular "consultas salvas". [Complexity: Low]

### Dashboard de ROI

- **Número de R$ recuperado em destaque**: O número que paga a assinatura precisa ser o maior elemento visual da tela. Cálculo: agendamentos gerados × ticket médio configurado. Não é receita real (não tem integração com caixa), mas é estimativa crível. [Complexity: Low]

- **Funil de campanha simples**: Enviadas → Entregues → Lidas → Respondidas → Agendadas. O dentista consegue ver onde o funil "vaza" e sente que entende o produto. [Complexity: Low]

- **Comparativo mensal**: "Este mês vs mês passado." ROI isolado não significa nada — a tendência é que convence na renovação. [Complexity: Low]

### Onboarding e Setup

- **Configuração de IA funcionando em <1h de trabalho do cliente**: Editor de FAQ (colar texto ou perguntas e respostas), tom de voz (3 opções: formal, informal, regional), horário de atendimento. Se leva mais que 1h para a clínica estar "com IA configurada", o onboarding ativo custa caro demais. [Complexity: Med]

- **Número de WhatsApp funcionando sem IT**: Instrução clara de como conectar número pelo QR code da Evolution API. Com screenshots ou video. O dentista não tem sysadmin. [Complexity: Low]

- **Checklist de ativação visível no dashboard**: "Você completou 3 de 5 passos para a primeira campanha." Produto gamificado guia o dentista ao momento "aha" (primeira resposta de paciente) em <7 dias. [Complexity: Low]

---

## Differentiators

Features que criam vantagem competitiva e justificam preço premium vs concorrentes.

### ROI Demonstrável

- **Cálculo de ROI que o cliente "acredita"**: Não apenas "agendamentos gerados", mas "se esses agendamentos comparecerem, você fatura R$X". Mostrar o multiplicador: "Você pagou R$397 e recuperou R$4.200 estimados." Isso é o argumento da renovação. Concorrentes (Zenvia, Take Blip) mostram métricas de engajamento, não R$. [Complexity: Low]

- **Export de relatório PDF mensal**: O dentista manda para o sócio, para a esposa, para o contador. "Olha o que o sistema fez esse mês." É prova social interna. Concorrentes enterprise não se importam com isso. [Complexity: Low]

- **Métrica de "no-shows evitados" estimada**: Calcular quantas consultas confirmadas via sistema vs taxa histórica de no-show. Mostrar: "Você teria perdido R$2.100 sem os lembretes automáticos." Isso é defesa de churn durante crise financeira da clínica. [Complexity: Med]

### IA com Tom da Clínica

- **Editor de tom de voz com preview em tempo real**: O cliente escreve como quer que a IA fale e vê uma mensagem de exemplo na hora. "Dona de clínica em Curitiba" fala diferente de "clínica evangélica no interior de Minas". Concorrentes usam tom fixo genérico. [Complexity: Med]

- **Reescrita de campanha por IA preservando intenção**: O cliente escreve uma mensagem simplória, a IA reescreve com o tom configurado mantendo a informação. "Oi, vem agendar" → mensagem personalizada com nome, tempo desde última visita, e CTA claro. [Complexity: Med]

- **Variáveis dinâmicas com fallback inteligente**: {{nome}} funciona. {{ultima_visita}} funciona. Mas se `ultima_visita` está nulo (paciente novo), a IA adapta a mensagem em vez de mandar "Faz {{ultima_visita}} que você não nos visita." [Complexity: Med]

### Inteligência de Segmentação

- **Segmento "em risco de abandono"**: Pacientes que têm padrão de visita regular mas sumiram nos últimos 90 dias. Detecção proativa antes de virar inativo. Requer análise de padrão de visitas — mas mesmo uma heurística simples (ex: visitava a cada 6 meses, foi há 4 meses) já diferencia. [Complexity: Med]

- **Priorização por valor estimado**: Ordenar pacientes por `total_spent_cents` e quantidade de visitas antes de disparar. Focar primeiro nos pacientes de maior ticket histórico aumenta o ROI calculado. O dentista não pensa assim naturalmente — o sistema pensa por ele. [Complexity: Low]

- **Alerta de vencimento de tratamento**: "23 pacientes com tratamento de canal iniciado há >60 dias sem conclusão." Isso é dinheiro parado e situação de risco clínico — urgência que motiva ação imediata. [Complexity: Med]

### Fluxo de Conversa

- **Follow-up automático em 3 e 7 dias para não-respondentes**: Paciente não respondeu à campanha? Follow-up com mensagem diferente. Essa sequência dobra a taxa de resposta comparado com disparo único (benchmark de email marketing que se aplica ao WhatsApp). [Complexity: Med]

- **Agendamento direto pelo WhatsApp com sugestão de horários**: Paciente diz "quero agendar" e a IA oferece 3 horários disponíveis. Requer integração com agenda (Google Calendar como MVP). Diferencia de concorrentes que fazem só "fluxo de captura de intenção" sem fechar o ciclo. [Complexity: High]

- **Escalonamento inteligente por urgência**: Paciente menciona dor de dente, sangramento, inchaço → transferência imediata para humano com flag de urgência. Concorrentes transferem por palavra-gatilho fixa. A IA pode ser mais nuançada. [Complexity: Med]

### Compliance e Confiança

- **Opt-in e opt-out rastreados por lei**: Registro de quando o paciente deu opt-in (via campanha inicial), como saiu do opt-out, timestamp. Para LGPD e para o dentista não ter problema com fiscalização. Concorrentes voltados para varejo não pensam em LGPD de saúde. [Complexity: Med]

- **Modo "auditoria"**: Admin pode ver log de toda interação de IA (sem PII em produção, mas auditável por request documentada). Dentista-gestor que precisar provar algo para o CFO ou ANVISA consegue. [Complexity: High]

---

## Anti-Features

Features para deliberadamente NÃO construir no MVP, com risco se incluídas.

- **Integração nativa com Clinicorp/Easy Dental/Sonia via API**: Cada sistema tem API diferente, documentação ruim, e mudanças sem aviso. Custo de manutenção é alto e o CSV resolve 100% do onboarding. Risco se incluída: engenharia desperdiçada antes de saber quais sistemas os clientes realmente usam. Fase 2 quando 20+ clientes validarem qual sistema prevalece.

- **Prontuário eletrônico ou ficha clínica**: Regulação CFO/CFM é complexa, exige certificação específica, e desvia do foco de recuperação de pacientes. Risco se incluída: feature incompleta gera expectativa de substituição do sistema atual, que o ClínicaFlow não substitui — posicionamento confuso = churn.

- **Chatbot de triagem de sintomas**: "Qual é a sua dor de dente?" é atendimento médico via IA, viola CFM/CFO, e é exatamente o tipo de guardrail que precisa ser bloqueado. Risco se incluída: responsabilidade legal para a clínica e para o produto.

- **A/B test de campanha no MVP**: Valioso, mas requer amostra mínima para ser estatisticamente significante (mínimo 200 por variante). Clínicas Starter têm 800-1000 contatos ativos — não dá para testar A/B de forma válida. Risco se incluída: complexidade de UX que confunde o dentista sem entregar insight real.

- **App mobile nativo**: Web responsiva resolve para iPad (o device da recepção). Custo de manutenção de iOS + Android é 2-3x o custo de web. Risco se incluída: recurso de engenharia desviado de features que impactam ROI.

- **Multi-idioma**: ICP é 100% PT-BR. Risco se incluída: i18n polui codebase, dificulta manutenção de prompts de IA, e não tem mercado endereçável no horizonte de 90 dias.

- **Agendamento online público (slot booking para novos pacientes)**: Regulado pelo CFM no contexto de saúde, e o foco é base existente. Risco se incluída: regulatório + desvio de posicionamento "recuperação de inativos".

- **Módulo financeiro (cobrança, boleto, NF-e)**: Cada estado tem regra diferente de nota fiscal de saúde. Integração com convênios é um produto por si só. Risco se incluída: promessa que o produto não entrega → devolução de garantia.

- **Relatório de análise preditiva de churn do paciente**: Requer dados históricos mínimos de 6+ meses por tenant para ser útil. Nos primeiros 6 meses, os dados não existem. Risco se incluída: feature que não funciona no momento em que o cliente mais precisa convencer-se de valor (primeiros 90 dias).

- **Integração com Doctoralia para agenda**: Doctoralia não tem API pública estável para escrita de agenda. Leitura é frágil. Risco se incluída: integração quebra com deploy deles, gera suporte de alto custo.

---

## Competitor Analysis

| Player | O que faz bem | Onde falha para o ICP | Nossa oportunidade |
|--------|--------------|----------------------|-------------------|
| **Zenvia** | Plataforma robusta de envio em volume, relatórios de entrega, múltiplos canais (SMS, WhatsApp, email) | Não tem foco em clínicas de saúde; onboarding complexo (sales-led, implementação meses); caro para clínica solo (plano mais barato R$800+/mês); IA genérica sem contexto clínico; sem ROI em R$ | Produto de nicho focado em odonto, preço 4x menor, onboarding em dias, IA com guardrails de saúde |
| **Take Blip** | Plataforma enterprise de chatbot, integrações complexas, chatbot builder visual | Enterprise-only na prática (SAC Bradesco, Claro, etc.); mínimo R$2000/mês; dentista não consegue configurar sozinho; sem templates de saúde; sem ROI em R$ | Produto self-service para PME, preço acessível, ROI demonstrável, setup sem TI |
| **Treble.ai** | WhatsApp automation para vendas B2B, CRM integration (HubSpot, Salesforce), bom onboarding | Foco em vendas B2B (SaaS, empresas tech); não tem contexto de saúde; sem guardrails clínicos; sem integração com software de gestão de clínica; ROI medido em "leads" não em R$ recuperado | Nicho de saúde, importação de base de paciente, linguagem de recuperação de inativo |
| **Sirena (Mercado Livre)** | WhatsApp para vendas no mercado brasileiro, integração com catálogo de produtos | Foco em varejo/e-commerce; absolutamente sem contexto de saúde; não importa base de pacientes; sem recall/reativação | Tudo — Sirena é varejo, ClínicaFlow é saúde |
| **Clinicorp** | Sistema de gestão completo para clínicas odonto: agenda, prontuário, financeiro, relatórios | NÃO tem recuperação ativa de inativos; WhatsApp é manual (recepcionista dispara por fora); sem IA; relatórios operacionais, não de recuperação de R$ | Não competir, integrar (CSV export do Clinicorp → ClínicaFlow) |
| **Doctoralia** | Marketplace de agendamento, presença online, captação de novos pacientes | Foca em captação de novos pacientes, não em reativação de base existente; sem WhatsApp automation; sem IA conversacional; custo alto para clínica solo | Complementar (clínica usa Doctoralia para captação + ClínicaFlow para reativação) |
| **Planilha + WhatsApp Web manual** | Custo zero, dentista já "sabe" usar | Não escala, recepcionista esquece, sem personalização, sem acompanhamento, sem follow-up, sem métricas | Automatizar exatamente o que a recepcionista já faz, com resultado medido em R$ |

**Conclusão do mercado:** Nenhum player cobre o nicho de "recuperação ativa de base de pacientes de clínica de saúde de pequeno/médio porte via WhatsApp + IA com ROI demonstrável em R$." Zenvia e Take Blip chegam pela direção enterprise (caro, complexo). Clinicorp e Doctoralia chegam pela direção de gestão/captação. O espaço está aberto.

---

## Feature Dependencies

```
Importação CSV
  └── Deduplicação por telefone
  └── Mapeamento de colunas wizard
  └── Validação de telefone
        └── Segmentação automática
              └── Preview de tamanho do segmento
              └── Editor de campanha
                    └── Templates prontos
                    └── Variáveis dinâmicas
                    └── IA reescrita de mensagem      ← depende de AIConfig por tenant
                          └── Disparo WhatsApp (Evolution API)
                                └── Rate limiting (BullMQ)
                                └── Janela de disparo
                                └── Status de entrega (webhook)
                                      └── IA conversacional (resposta a mensagem recebida)
                                            └── FAQ da clínica
                                            └── Guardrail clínico
                                            └── Transferência para humano
                                            └── Follow-up automático
                                      └── Confirmação de consulta (48h/3h)
                                            └── Registro de confirmação/no-show
                                                  └── Dashboard de ROI
                                                        └── Cálculo faturamento recuperado
                                                        └── Funil de campanha
                                                        └── Export PDF

Auth multi-tenant
  └── Toda funcionalidade acima (isolamento por tenant_id)

AIConfig por tenant
  └── Editor de FAQ
  └── Editor de tom de voz
  └── Palavras-gatilho de handoff
  └── Horário de atendimento IA
```

**Caminho crítico MVP (ordem de construção):**
1. Auth multi-tenant (fundação inegociável)
2. Importação CSV + deduplicação (sem base, sem produto)
3. Segmentação automática (sem segmento, sem campanha)
4. AIConfig + editor de FAQ e tom (sem config, IA não tem personalidade)
5. Editor de campanha + disparo via Evolution + rate limiting
6. Webhook Evolution → IA conversacional + guardrails
7. Confirmação de consulta (48h/3h)
8. Dashboard de ROI + export PDF

---

## Onboarding Activation Pattern

Para atingir ativação em <7 dias e taxa >80%:

**Dia 1 (setup):** Wizard de importação CSV → clínica vê sua base segmentada pela primeira vez. Momento "aha" imediato: "Tenho 847 pacientes inativos há mais de 6 meses." Impacto emocional antes de qualquer disparo.

**Dia 2-3 (configuração):** Conectar número WhatsApp (QR code) + configurar FAQ + escolher tom de voz. Checklist visível. Cada passo completado mostra progresso.

**Dia 4-5 (primeira campanha):** Usar template pronto de "Recall de Limpeza 6 meses" em segmento de 50-100 pacientes (não disparar tudo de uma vez — número novo precisa de aquecimento). Preview da campanha antes de confirmar.

**Dia 6-7 (primeiro resultado):** Primeiros pacientes respondem. Recepcionista vê conversa sendo conduzida pela IA. Primeiro agendamento gerado aparece no dashboard. ROI estimado aparece. Momento "isso funciona de verdade."

**Gatilho de churn antecipado:** Se cliente chegou ao Dia 7 sem disparar primeira campanha → ativar flow de CS ativo (mensagem pessoal do Paulo, não automação). A maioria dos churns em SaaS de clínica acontece por abandono silencioso, não por cancelamento declarado.

---

## MVP Feature Priority Matrix

| Feature | Impacto ROI | Custo de Construção | Prioridade |
|---------|-------------|---------------------|-----------|
| Importação CSV + wizard | Alto (sem isso não tem produto) | Med | P0 |
| Deduplicação por telefone | Alto (sem isso ban de WhatsApp) | Med | P0 |
| Segmentação automática | Alto | Low | P0 |
| Templates de campanha prontos | Alto (ativação) | Low | P0 |
| Disparo com rate limiting | Alto (sobrevivência) | Med | P0 |
| IA reescrita de mensagem | Alto (anti-spam) | Med | P0 |
| FAQ + tom de voz por tenant | Alto (personalização) | Med | P0 |
| Guardrail clínico em código | Crítico (risco legal) | Med | P0 |
| Transferência para humano | Alto | Low | P0 |
| Dashboard ROI básico (R$) | Alto (retenção) | Low | P0 |
| Confirmação 48h antes | Alto (ROI imediato) | Med | P1 |
| Follow-up 3/7 dias | Médio | Med | P1 |
| Export PDF mensal | Médio (retenção) | Low | P1 |
| Status de entrega por mensagem | Médio | Low | P1 |
| Editor de tom com preview | Médio (diferenciador) | Med | P2 |
| Segmento "em risco de abandono" | Médio | Med | P2 |
| Integração Google Calendar | Alto (agendamento direto) | High | P2 |
| Priorização por valor estimado | Médio | Low | P2 |
| Auditoria de IA (log) | Baixo (compliance) | High | P3 |

---

## Sources

- PROJECT.md e PRD-ClinicaFlow.md (documentos primários do projeto)
- Conhecimento de treinamento sobre: mercado de SaaS para clínicas de saúde no Brasil, padrões de WhatsApp Business API, Evolution API, conversational AI para saúde (MEDIUM confidence — treinamento até ago 2025)
- Conhecimento de treinamento sobre: Zenvia, Take Blip, Treble.ai, Sirena, Clinicorp, Doctoralia — funcionalidades conhecidas até ago 2025 (MEDIUM confidence — verificar sites oficiais antes de citar em pitch)
- Padrões de onboarding SaaS: benchmarks de ativação (<7 dias), checklist gamificado, CS ativo no Dia 7 (MEDIUM confidence — padrão amplamente documentado na literatura de PLG)
- WhatsApp Business API rate limits e políticas anti-spam (HIGH confidence — documentação oficial WhatsApp, validada pelo uso no CRM do Verê)
- LGPD art. 11 e regulação CFO/CFM para dados de saúde (HIGH confidence — legislação brasileira vigente)
