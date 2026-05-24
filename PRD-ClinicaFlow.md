# PRD — ClínicaFlow

**Versão:** 1.0
**Data:** 2026-05-23
**Owner:** Paulo
**Status:** Draft inicial — pré-MVP

---

## 1. Visão de produto

### 1.1 One-liner
ClínicaFlow é um SaaS de WhatsApp + IA que recupera pacientes inativos, reduz no-show e automatiza recall em clínicas de odontologia, estética, fisioterapia e nutrição.

### 1.2 Tese
Clínicas pequenas e médias têm uma mina de ouro parada no próprio software de gestão: pacientes inativos. Recuperar 2-3% dessa base ao mês paga o SaaS várias vezes. A dor é universal, o ROI é demonstrável em planilha, e o decisor (dono ou gerente) responde rápido quando o pitch é financeiro.

### 1.3 Por que agora
- WhatsApp Business API barateou e estabilizou via Evolution API
- Custo de IA generativa caiu a ponto de viabilizar atendimento personalizado por R$0,02-0,10 por conversa
- Clínicas saíram da pandemia com base inflada de pacientes que nunca mais voltaram
- Concorrentes existentes (Clinicorp, Doctoralia) focam em gestão, não em recuperação ativa

### 1.4 Não-objetivos (v1)
- NÃO é prontuário eletrônico
- NÃO é sistema de gestão clínica completo
- NÃO substitui agenda existente — integra com ela
- NÃO atende hospitais ou redes grandes (>10 unidades)
- NÃO faz teleconsulta

---

## 2. Mercado e posicionamento

### 2.1 ICP (Ideal Customer Profile)
**Primário:** clínica de odontologia com 1-3 unidades, 2-8 cadeiras, 800-5000 pacientes na base, ticket médio R$150-600, faturamento R$30k-300k/mês.

**Secundário:** clínica de estética (harmonização, depilação a laser, estética facial) com perfil de receita recorrente por pacote.

**Terciário (fase 2):** fisioterapia, nutrição, psicologia (atendimento por sessão, recall semanal/quinzenal).

### 2.2 Persona decisora
**Dr. Renato, 38 anos, dono de clínica odontológica em cidade de 100-500k habitantes.**
- Dentista que virou gestor por necessidade
- Trabalha 6 dias por semana, atende e administra
- Tem recepcionista que faz "o que dá" no WhatsApp
- Já tentou Clinicorp, Doctoralia, planilhas e abandonou
- Compra por ROI claro, paga via Pix ou cartão recorrente
- Decide em 1-3 conversas se confiar na pessoa que apresenta

### 2.3 Concorrentes e posicionamento
| Player | O que faz | Onde falha |
|---|---|---|
| Clinicorp | Gestão completa de clínica | Não tem recuperação ativa de inativos, WhatsApp limitado |
| Doctoralia | Marketplace + agenda | Foca em captação nova, não em base existente |
| Sonia/Mercos | CRM odontológico | Não tem IA, WhatsApp é manual |
| Manual (planilha + WhatsApp Web) | DIY | Não escala, recepcionista esquece |

**Nosso posicionamento:** "O único sistema que transforma sua base de pacientes inativos em faturamento recorrente, automaticamente."

### 2.4 Diferenciação
1. **Foco cirúrgico em recuperação ativa** (não em gestão geral)
2. **IA com tom da clínica** — cada cliente treina a voz da própria recepção
3. **ROI mensurável no painel** — quanto recuperou em R$ no mês
4. **Setup assistido** com importação de base
5. **Integração com agendas existentes** (Google Calendar, Doctoralia, Clinicorp via export)

---

## 3. Funcionalidades core (MVP)

### 3.1 Módulo 1 — Importação e segmentação de base
**O que faz:** importa CSV/Excel da base de pacientes do software atual do cliente (Clinicorp, Sonia, Easy Dental, ou planilha) e segmenta automaticamente.

**Segmentos automáticos:**
- Inativos 3-6 meses
- Inativos 6-12 meses
- Inativos 12-24 meses
- Inativos +24 meses
- Aniversariantes do mês
- Tratamento em aberto (se vier no import)
- Última limpeza > 6 meses (odonto)

**Critério de aceite:**
- Upload de CSV até 50k linhas em <2min
- Mapeamento de colunas guiado por wizard
- Deduplicação automática por telefone normalizado
- Preview antes de salvar

### 3.2 Módulo 2 — Campanhas de recuperação
**O que faz:** dispara mensagens segmentadas via WhatsApp com IA personalizando o texto por paciente.

**Templates iniciais:**
1. Recall de limpeza (6 meses)
2. Recuperação de inativo gentil (6-12 meses)
3. Recuperação com oferta (12+ meses)
4. Aniversário com benefício
5. Tratamento em aberto ("você parou no meio")
6. Reativação anual

**Funcionalidades:**
- Editor visual de campanha
- Variáveis dinâmicas ({{nome}}, {{ultima_visita}}, {{tratamento}})
- IA reescreve cada mensagem com tom configurado
- Janela de disparo (ex: só dispara 9h-18h, não dispara domingo)
- Rate limit anti-banimento (max X msgs/min por número)
- A/B test de mensagem
- Resposta automática inicia conversa com IA

**Critério de aceite:**
- Disparo de 1000 msgs em até 4h respeitando rate limit
- Taxa de entrega >95%
- Taxa de resposta esperada >8% (benchmark de recuperação)

### 3.3 Módulo 3 — IA conversacional
**O que faz:** quando o paciente responde, a IA conversa, qualifica intenção e agenda ou transfere pra humano.

**Fluxos:**
- Paciente quer agendar → IA oferece horários (integra com agenda)
- Paciente tem dúvida → IA responde com base em FAQ configurada
- Paciente quer falar com humano → transfere pra recepção
- Paciente reclama → escala imediato pra dono/gerente
- Paciente não responde → follow-up em 3 e 7 dias

**Configuração por cliente:**
- Editor de prompt base (igual ao CRM do Verê)
- Upload de FAQ da clínica (preços, convênios, endereço, horário)
- Tom de voz (formal/informal/regional)
- Limites de promessa (NÃO pode prometer cura, resultado, diagnóstico)
- Lista de palavras-gatilho pra transferência imediata (dor forte, sangramento, emergência)

**Critério de aceite:**
- Resposta em <30s
- Taxa de agendamento direto pela IA >40% das conversas qualificadas
- Zero promessa de resultado/diagnóstico (validar com guardrails)

### 3.4 Módulo 4 — Confirmação e no-show
**O que faz:** confirma consultas 48h e 3h antes, com reagendamento automático.

**Fluxo:**
1. 48h antes: "Oi {{nome}}, lembrete da sua consulta dia X às Y. Confirma?"
2. Se confirma → marca confirmado
3. Se diz não → IA oferece reagendamento
4. 3h antes: lembrete final
5. Se faltou → registra no-show e dispara mensagem de recuperação no dia seguinte

**Critério de aceite:**
- Integração via webhook com agenda da clínica
- Redução de no-show >30% em 60 dias (benchmark de mercado)

### 3.5 Módulo 5 — Dashboard de ROI
**O que faz:** mostra em R$ quanto o sistema recuperou no mês.

**Métricas exibidas:**
- Mensagens enviadas
- Taxa de resposta
- Conversas iniciadas
- Agendamentos gerados
- Comparecimentos confirmados
- **Faturamento recuperado** (agendamento × ticket médio configurado)
- ROI do mês (faturamento recuperado ÷ mensalidade)

**Critério de aceite:**
- Atualização em tempo real
- Comparativo mês a mês
- Export PDF mensal pra cliente mandar pro contador/sócio

---

## 4. Funcionalidades fase 2 (pós-PMF)

- Integração nativa com Clinicorp, Doctoralia, Sonia via API
- Pesquisa de satisfação automática + pedido de avaliação no Google
- Programa de indicação automatizado
- Multi-unidade com relatórios consolidados
- Módulo financeiro (cobrança de boleto/Pix via WhatsApp)
- App mobile pra dono acompanhar conversas
- White label pra agências/implantadores

---

## 5. Arquitetura técnica

### 5.1 Stack (reaproveitando CRM do Verê)
- **Backend:** Node.js + Fastify (ou Express)
- **DB:** PostgreSQL multi-tenant (schema por cliente OU row-level com tenant_id)
- **Fila:** Redis + BullMQ pra disparos e jobs assíncronos
- **WhatsApp:** Evolution API (containerizada por cliente ou compartilhada)
- **IA:** Anthropic Claude (Haiku pra triagem rápida, Sonnet pra conversas complexas)
- **Frontend:** React + Vite + Tailwind + shadcn/ui
- **Auth:** JWT + refresh token
- **Pagamento:** Stripe ou Pagar.me (cartão recorrente + Pix)
- **Hosting:** Hetzner ou DigitalOcean (igual stack atual)

### 5.2 Modelo de dados (principais entidades)
```
Tenant (clínica)
  └── User (equipe da clínica)
  └── Patient (paciente)
        └── Visit (consulta histórica)
        └── Treatment (tratamento em aberto)
  └── Campaign (campanha de disparo)
        └── Message (mensagens enviadas)
  └── Conversation (conversa WhatsApp)
        └── ChatMessage (mensagens)
  └── Appointment (agendamento)
  └── AIConfig (config de IA da clínica)
```

### 5.3 Reaproveitamento do CRM do Verê
| Componente | Reaproveitamento |
|---|---|
| Auth + multi-tenant | 100% |
| Evolution API wrapper | 100% |
| Editor de prompt IA | 95% (só muda prompt base) |
| Sistema de filas/disparo | 100% |
| Webhook handler WhatsApp | 100% |
| Frontend base (sidebar, login, settings) | 80% |
| Schema de "eleitor" → "paciente" | Renomear + adicionar campos clínicos |
| Dashboard | 70% (métricas diferentes) |
| Editor de campanhas | 90% |

**Estimativa:** 60-90 dias pra MVP partindo do código atual.

### 5.4 Segurança e LGPD
- Dados de saúde são **sensíveis** pela LGPD — atenção redobrada
- Criptografia em repouso (Postgres TDE ou aplicação)
- TLS obrigatório
- Logs de acesso por usuário
- Termo de consentimento explícito no opt-in dos pacientes
- DPO/Encarregado: pode ser o próprio Paulo nos primeiros meses, depois terceirizar
- Política de retenção: 5 anos pós-inatividade conforme CFO/CFM
- Direito ao esquecimento implementado (delete cascata)

### 5.5 Riscos técnicos
| Risco | Mitigação |
|---|---|
| Banimento de número WhatsApp | Rate limit, opt-in real, mensagens não-spam, números aquecidos |
| IA prometer resultado clínico | Guardrails no prompt + filtro de palavras + revisão humana de prompts |
| Vazamento de dados de saúde | Pentest, isolamento por tenant, audit log |
| Evolution API instável | Plan B: WPPConnect, ou migrar pra WhatsApp Cloud API oficial |
| Custo de IA escalar | Cache de respostas comuns, Haiku pra triagem, Sonnet só onde precisa |

---

## 6. Pricing

### 6.1 Planos
| Plano | Preço | Limite | Público |
|---|---|---|---|
| **Starter** | R$197/mês | 1 unidade, 1000 disparos/mês, 1 número WhatsApp | Clínica solo |
| **Pro** | R$397/mês | 1 unidade, disparos ilimitados, 2 números, A/B test | Clínica média |
| **Multi** | R$697/mês | Até 5 unidades, relatórios consolidados | Mini-rede |
| **Enterprise** | Sob consulta | +5 unidades, SLA, integrações custom | Redes |

### 6.2 Setup
- R$497 (Starter) — importação de base + treinamento IA + 1h de onboarding
- R$997 (Pro/Multi) — setup + 3h de consultoria estratégica de campanhas

### 6.3 Trial e garantia
- 14 dias grátis com importação assistida
- Garantia de 30 dias: se não recuperar 3x o valor do plano, devolve dinheiro

### 6.4 Unit economics estimada
- CAC alvo: R$400-600 (via Meta Ads)
- LTV alvo: R$4000+ (churn esperado 5%/mês = 20 meses × R$300 ticket médio ponderado)
- LTV:CAC alvo: 7:1
- Payback: 2 meses
- Margem bruta esperada: 75% (custo de IA + Evolution + infra ~ R$70-90/cliente)

---

## 7. GTM (Go-to-Market)

### 7.1 Fase 0 — Validação (mês 1)
- 5 clínicas piloto em Apucarana/Maringá/Londrina
- Cobrar setup, dar 3 meses grátis em troca de case + depoimento em vídeo
- Objetivo: validar que recuperação real acontece e mensurar números reais de mercado

### 7.2 Fase 1 — Primeiros pagantes (mês 2-4)
- Meta Ads com creative de demonstração ("veja em 90s como funciona")
- Outbound via Instagram DM em raio de 300km
- Parceria com 2-3 contadores especializados em saúde
- Objetivo: 20 clientes pagantes, R$6k MRR

### 7.3 Fase 2 — Escala regional (mês 5-9)
- Patrocínio de evento de odonto regional
- Programa de indicação (15% recorrente vitalício)
- Conteúdo orgânico no Instagram (carrosséis com casos)
- Objetivo: 80 clientes, R$25k MRR

### 7.4 Fase 3 — Nacional + info produto (mês 10+)
- Lançamento do "Implantador ClínicaFlow Certificado"
- Afiliados em todo o Brasil
- Sub-nichos: estética, fisio, nutrição
- Objetivo: 300 clientes, R$100k MRR

### 7.5 Canais priorizados
1. **Meta Ads** (Instagram + Facebook) — principal
2. **Indicação de cliente satisfeito** — maior LTV
3. **Parceria com contadores de saúde** — leads quentes
4. **Outbound personalizado** — Instagram DM e WhatsApp pra clínicas em cidades específicas
5. **Eventos regionais** — credibilidade local

---

## 8. Métricas de sucesso

### 8.1 North Star Metric
**Faturamento recuperado pelos clientes/mês** (soma de todos os tenants).
Se essa métrica cresce, o produto está entregando valor.

### 8.2 KPIs operacionais
- MRR (Monthly Recurring Revenue)
- Churn mensal (<5%)
- NPS (>50)
- Tempo médio de setup (<7 dias)
- Taxa de ativação (cliente que disparou primeira campanha em até 14 dias) >80%

### 8.3 KPIs de produto
- Taxa de resposta média das campanhas (benchmark interno)
- Taxa de agendamento via IA
- % de mensagens com intervenção humana (quanto menor, melhor a IA)
- Tempo médio de resposta da IA

---

## 9. Roadmap 90 dias (MVP)

### Mês 1 — Fundação
- Semana 1: fork do CRM do Verê, renomear entidades, schema novo
- Semana 2: importador de CSV + segmentação
- Semana 3: editor de campanha + disparo via Evolution
- Semana 4: IA conversacional básica + onboarding 1 cliente piloto

### Mês 2 — Conversão e ROI
- Semana 5-6: dashboard de ROI + métricas em tempo real
- Semana 7: confirmação de consulta + integração Google Calendar
- Semana 8: 3 pilotos rodando, ajustes baseados em uso real

### Mês 3 — Polimento e GTM
- Semana 9: landing page + checkout (Stripe/Pagar.me)
- Semana 10: trial de 14 dias automatizado
- Semana 11: lançamento Meta Ads + 5 pagantes
- Semana 12: revisão de unit economics e ajuste de preço

---

## 10. Riscos e premissas críticas

### 10.1 Premissas que precisam ser validadas
1. Clínicas conseguem exportar base do software atual com facilidade
2. Taxa de recuperação real fica em 2-5% (suficiente pra ROI claro)
3. WhatsApp não bane em volume controlado com opt-in
4. Donos de clínica decidem em 1-2 demos
5. Ticket médio R$297-397 é absorvível pelo ICP

### 10.2 Riscos de negócio
| Risco | Probabilidade | Impacto | Plano |
|---|---|---|---|
| WhatsApp endurecer regras | Média | Alto | Migrar pra Cloud API oficial; já preparar arquitetura |
| Concorrente grande copiar | Baixa | Médio | Velocidade de execução + nicho profundo |
| LGPD enforcement em saúde | Média | Alto | Compliance desde o dia 1, DPO terceirizado |
| Churn alto por não-uso | Alta | Alto | Onboarding ativo + customer success nos primeiros 60 dias |

---

## 11. Decisões em aberto

1. **Postgres schema-per-tenant vs row-level tenant_id?** → Recomendo row-level pra simplicidade operacional até 200 clientes
2. **Evolution API compartilhada vs dedicada por cliente?** → Começar compartilhada com pool de números; migrar pra dedicada no plano Pro+
3. **Cobrar por disparo extra ou só por plano?** → Plano com limite + overage simples (R$0,15/msg acima)
4. **Atender estética desde o MVP ou só odonto?** → Começar odonto puro pra ter clareza de mensagem; expandir após 30 clientes
5. **White label desde quando?** → Não antes de 100 clientes diretos pra não fragmentar marca

---

## 12. Próximos passos imediatos

1. Validar este PRD com 3 donos de clínica em entrevista de 30min cada
2. Listar campos exatos exportáveis de Clinicorp e Easy Dental (concorrentes principais)
3. Decidir nome final + comprar domínio + registrar marca no INPI
4. Criar CLAUDE.md no repositório novo pra o Claude Code
5. Definir os 5 pilotos (já tem alguma clínica em mente em Apucarana?)
