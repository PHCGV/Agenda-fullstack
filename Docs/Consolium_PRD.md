**CONSOLIUM**

Sistema Web de Agendamento e Gestão de Atendimentos

**Product Requirements Document (PRD)**

| **Informações do Documento** | |
| --- | | --- |
| **Versão** | 1.0 |
| **Data** | Maio de 2025 |
| **Status** | Em revisão |
| **Stack** | Node.js + React + PostgreSQL (Neon) + Vercel |
| **Público-alvo** | Organizações e profissionais que gerenciam horários e atendimentos |

# **1\. Visão Geral do Produto**

O Consolium é um sistema web de agendamento e gestão de atendimentos desenvolvido para organizações e profissionais que necessitam organizar horários, espaços e compromissos de forma prática, visual e eficiente.

A solução elimina a necessidade de contato manual (telefone ou mensagem) para marcação de consultas, reuniões ou atendimentos, centralizando toda a gestão em uma interface responsiva e acessível por computador, tablet e celular.

## **1.1 Problema que o Produto Resolve**

- Dificuldade em centralizar e visualizar a disponibilidade de horários e espaços
- Falhas na comunicação entre organizações e seus clientes (ausências, atrasos, esquecimentos)
- Falta de integração com ferramentas já utilizadas no cotidiano (ex.: Google Agenda)
- Ausência de controle visual sobre o status de cada atendimento
- Conflitos no uso de espaços físicos (salas, consultórios, laboratórios)

## **1.2 Objetivos do Produto**

- Permitir o agendamento online de atendimentos sem intervenção manual
- Reduzir ausências e atrasos por meio de lembretes automáticos
- Oferecer visão clara e colorida do status de cada compromisso
- Controlar a disponibilidade de horários e espaços em tempo real
- Integrar-se ao Google Agenda para sincronização bidirecional
- Ser altamente personalizável para diferentes perfis de negócio

## **1.3 Personas**

### **Profissional Autônomo (ex.: psicólogo, nutricionista, advogado)**

- - **Necessidades:** Gerenciar sua própria agenda, receber confirmações e evitar sobreposição de horários
    - **Dores:** Tempo gasto respondendo mensagens para confirmar ou remarcar atendimentos

### **Gestor de Clínica ou Organização**

- - **Necessidades:** Visão geral de todas as salas e profissionais, relatórios e controle de ocupação
    - **Dores:** Conflito entre salas, falta de visibilidade sobre a agenda da equipe

### **Cliente Final**

- - **Necessidades:** Marcar atendimentos com facilidade, a qualquer hora, sem precisar ligar
    - **Dores:** Horários de atendimento fora do expediente, espera por retorno de mensagens

# **2\. Funcionalidades do Sistema**

| **Funcionalidade**            | **Descrição**                                                                 | **Prioridade** |
| ----------------------------- | ----------------------------------------------------------------------------- | -------------- |
| **Agendamento Online**        | Cliente agenda atendimento diretamente pela plataforma, sem contato manual    | **Alta**       |
| **Lembretes Automáticos**     | Envio de lembretes por e-mail (e outros canais) para reduzir ausências        | **Alta**       |
| **Agenda por Status e Cores** | Visualização por cores conforme status: agendado, confirmado, cancelado, etc. | **Alta**       |
| **Bloqueio de Horários**      | Bloqueio de períodos indisponíveis (férias, reuniões, manutenção)             | **Alta**       |
| **Gestão de Espaços**         | Associação de atendimentos a salas/consultórios e controle de ocupação        | **Média**      |
| **Integração Google Agenda**  | Sincronização bidirecional com Google Calendar                                | **Média**      |
| **Personalização da Agenda**  | Configuração de horários de funcionamento, intervalos, cores e visualizações  | **Média**      |
| **Painel Administrativo**     | Acesso protegido por autenticação para gestores do sistema                    | **Alta**       |

## **2.1 Agendamento Online**

O cliente poderá acessar a interface pública do Consolium, visualizar os horários disponíveis e realizar a marcação de um atendimento sem necessidade de contato manual.

### **Requisitos Funcionais**

- Exibição do calendário público com disponibilidade em tempo real
- Seleção de data, horário e tipo de atendimento (se aplicável)
- Preenchimento de dados básicos pelo cliente (nome, e-mail, telefone)
- Confirmação do agendamento via e-mail (para o cliente e o profissional)
- Prevenção de duplo agendamento no mesmo horário

## **2.2 Lembretes Automáticos**

O sistema enviará lembretes automáticos para clientes antes de seus atendimentos, reduzindo ausências e atrasos.

### **Requisitos Funcionais**

- Envio de lembrete por e-mail com antecedência configurável (ex.: 24h e 1h antes)
- Conteúdo do lembrete: data, hora, local e dados do profissional
- Opção de confirmação ou cancelamento via link no e-mail
- Registro de status da notificação (enviado, lido, confirmado)

## **2.3 Agenda por Status e Cores**

A interface de agenda exibirá cada compromisso com uma cor correspondente ao seu status atual, facilitando a leitura visual e a tomada de decisão.

### **Status e Cores Sugeridos**

- - **Agendado:** Azul - compromisso registrado mas não confirmado
    - **Confirmado:** Verde - cliente confirmou presença
    - **Cancelado:** Vermelho - cancelado pelo cliente ou pelo profissional
    - **Concluído:** Cinza - atendimento já realizado
    - **Pendente:** Amarelo - aguardando informações ou retorno

## **2.4 Bloqueio de Horários**

Profissionais e gestores poderão bloquear períodos específicos para impedir novos agendamentos, como feriados, recessos ou intervalos.

### **Requisitos Funcionais**

- Bloqueio manual de data/horário específico ou faixa de datas
- Definição de motivo do bloqueio (exibição opcional ao cliente)
- Bloqueios recorrentes (ex.: intervalo de almoço diário)
- Notificação automática a clientes com agendamentos afetados

## **2.5 Gestão de Espaços**

O sistema permitirá cadastrar e gerenciar os espaços físicos onde os atendimentos ocorrem, controlando a ocupação e evitando conflitos.

### **Requisitos Funcionais**

- Cadastro de espaços com nome, capacidade e descrição
- Associação de um espaço a cada agendamento
- Verificação automática de disponibilidade do espaço no horário solicitado
- Visualização de ocupação por espaço (diária/semanal)

## **2.6 Integração com Google Agenda**

O Consolium se integrará ao Google Calendar para sincronizar compromissos bidirecionalmente, permitindo que o usuário visualize todos os eventos em um único lugar.

### **Requisitos Funcionais**

- Autenticação OAuth 2.0 com conta Google
- Exportação de agendamentos do Consolium para o Google Calendar
- Importação de eventos do Google Calendar para evitar conflitos
- Atualização automática ao alterar ou cancelar agendamentos

## **2.7 Personalização da Agenda**

A plataforma permitirá que gestores configurem a agenda de acordo com as particularidades de cada negócio.

### **Opções de Personalização**

- Definição de horários de funcionamento (dias e horas)
- Configuração de duração padrão e intervalo entre atendimentos
- Cores personalizadas por categoria ou tipo de atendimento
- Seleção de modo de visualização: diário, semanal ou mensal
- Campos personalizáveis no formulário de agendamento

# **3\. Stack Tecnológica**

| **Camada**         | **Tecnologia**          | **Justificativa**                                                                                           |
| ------------------ | ----------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Front-end**      | **React.js**            | Biblioteca amplamente adotada, ecossistema maduro, suporte a PWA e componentes reutilizáveis                |
| **Back-end**       | **Node.js + Express**   | Alta performance para APIs REST, grande ecossistema de pacotes (npm), compatível com o Vercel Serverless    |
| **Banco de Dados** | **PostgreSQL (Neon)**   | Banco relacional robusto; Neon oferece plano gratuito com suporte a serverless, ideal para deploy no Vercel |
| **ORM**            | **Prisma**              | Facilita o acesso ao banco, migrations automáticas, tipagem forte com TypeScript                            |
| **Autenticação**   | **JWT + bcrypt**        | Tokens stateless seguros para sessões; bcrypt para hash de senhas                                           |
| **Deploy**         | **Vercel**              | Plano gratuito generoso, CI/CD nativo com GitHub, edge network global                                       |
| **E-mail**         | **Nodemailer / Resend** | Envio de lembretes e confirmações por e-mail; Resend oferece tier gratuito                                  |
| **Integração**     | **Google Calendar API** | SDK oficial do Google para sincronização de calendário via OAuth 2.0                                        |
| **Estilização**    | **Tailwind CSS**        | Classes utilitárias para criação rápida de interfaces responsivas e consistentes                            |

## **3.1 Banco de Dados - Neon PostgreSQL (Gratuito)**

O Neon é uma alternativa serverless ao PostgreSQL tradicional, com as seguintes vantagens para este projeto:

- Plano gratuito com 0,5 GB de armazenamento e suporte a múltiplos projetos
- Compatível nativamente com o ecossistema Vercel (Vercel Postgres usa Neon sob os panos)
- Suporte a branching de banco para ambientes de desenvolvimento e produção
- Conexão via connection string padrão do PostgreSQL - sem vendor lock-in
- Escala automaticamente para zero fora de uso, reduzindo custos

# **4\. Requisitos de Segurança**

A segurança é um pilar fundamental do Consolium, especialmente por lidar com dados sensíveis de clientes. As práticas abaixo devem ser adotadas desde o início do desenvolvimento.

## **4.1 Validação de Dados**

### **Front-end (React)**

- Validação de todos os campos de formulário antes do envio (ex.: e-mail válido, campos obrigatórios)
- Bibliotecas recomendadas: React Hook Form + Zod para validação com tipagem
- Feedback visual imediato ao usuário para erros de preenchimento

### **Back-end (Node.js)**

- Revalidação obrigatória de todos os dados recebidos no servidor, independente do front-end
- Uso de schemas de validação com Zod ou Joi em todas as rotas
- Rejeição de payloads malformados com respostas de erro padronizadas (4xx)
- Proteção contra SQL Injection via uso exclusivo de ORM com parâmetros tipados (Prisma)
- Sanitização de entradas de texto para prevenir XSS

## **4.2 Autenticação e Proteção de Rotas**

### **Painel Administrativo**

- Acesso restrito por login com e-mail e senha
- Senhas armazenadas com hash bcrypt (fator de custo mínimo: 12)
- Tokens JWT com tempo de expiração curto (ex.: 1 hora) e refresh token
- Logout com invalidação de token no cliente

### **Rotas da API**

- Middleware de autenticação em todas as rotas que exigem login
- Verificação do papel do usuário (role) para controle de acesso granular
- Rate limiting nas rotas públicas para prevenir ataques de força bruta
- Cabeçalhos de segurança HTTP (CORS configurado, Content-Security-Policy)

## **4.3 Proteção de Dados Sensíveis dos Clientes**

- Não armazenar dados desnecessários: coletar apenas nome, e-mail e telefone
- Dados pessoais nunca expostos em logs do servidor
- Comunicação exclusivamente via HTTPS (garantido pelo Vercel)
- Variáveis de ambiente para todas as chaves secretas (API keys, credenciais de banco)
- Nunca versionar arquivos .env no repositório - usar .gitignore rigoroso
- Conformidade com a LGPD: política de privacidade, consentimento e direito ao esquecimento

## **4.4 Integração com Google (OAuth 2.0)**

- Utilizar fluxo OAuth 2.0 padrão do Google - nunca solicitar ou armazenar senha do Google
- Solicitar apenas os escopos necessários (calendar.events)
- Refresh tokens armazenados de forma criptografada no banco
- Opção clara de revogar acesso ao Google na interface do usuário

# **5\. Requisitos Não Funcionais**

## **5.1 Responsividade**

O sistema deverá funcionar corretamente em computador, tablet e celular. A interface será responsiva, ajustando-se automaticamente a diferentes tamanhos de tela via Tailwind CSS e design mobile-first.

- Breakpoints: sm (640px), md (768px), lg (1024px), xl (1280px)
- Componentes críticos (formulário de agendamento, calendário) otimizados para toque
- Testes em Chrome, Firefox, Safari e navegadores mobile

## **5.2 Performance**

- Tempo de carregamento inicial abaixo de 3 segundos em conexão 4G
- Lazy loading de componentes pesados (calendário completo, relatórios)
- Paginação nas listagens de agendamentos
- Cache de dados estáticos (configurações, espaços) no front-end

## **5.3 Disponibilidade**

- SLA mínimo de 99% - garantido pela infraestrutura do Vercel
- Resiliência a falhas de serviços externos (Google API, e-mail): filas de retry

## **5.4 Escalabilidade**

- Arquitetura stateless no back-end (funções serverless no Vercel)
- Banco de dados escalável horizontalmente (Neon suporta leitura de réplicas)
- Design de API RESTful preparado para versionamento futuro

# **6\. Arquitetura do Sistema**

## **6.1 Estrutura de Pastas Sugerida**

consolium/  
├── apps/  
│ ├── frontend/ # React + Tailwind  
│ └── backend/ # Node.js + Express  
├── packages/  
│ └── shared/ # Tipos e schemas compartilhados  
└── prisma/ # Schema e migrations do banco

## **6.2 Principais Entidades do Banco de Dados**

- - **User:** Administradores e profissionais com acesso ao painel
    - **Client:** Dados dos clientes que realizam agendamentos
    - **Appointment:** Registro de agendamentos com status, horário, espaço e profissional
    - **Space:** Espaços físicos disponíveis para atendimentos
    - **Availability:** Regras de disponibilidade de horários por profissional
    - **BlockedPeriod:** Períodos bloqueados para novos agendamentos
    - **Notification:** Registro de lembretes e notificações enviadas

# **7\. Roadmap de Entregas**

| **Funcionalidade** | **Descrição**                                                                    | **Prioridade** |
| ------------------ | -------------------------------------------------------------------------------- | -------------- |
| **Fase 1 - MVP**   | Agendamento online, painel admin básico, autenticação, agenda com status e cores | **Alta**       |
| **Fase 2**         | Lembretes automáticos por e-mail, bloqueio de horários, gestão de espaços        | **Alta**       |
| **Fase 3**         | Integração com Google Agenda, personalização avançada da agenda                  | **Média**      |
| **Fase 4**         | Relatórios e dashboards, multi-usuário, roles e permissões avançadas             | **Baixa**      |

# **8\. Critérios de Aceitação**

## **Agendamento Online**

- Cliente consegue marcar um atendimento sem criar conta no sistema
- Horários já ocupados não aparecem como disponíveis
- E-mail de confirmação é enviado em até 2 minutos após o agendamento

## **Segurança**

- Tentativas de acesso ao painel admin sem login são redirecionadas para a tela de login
- Senhas são armazenadas como hash - nunca em texto puro
- Dados de clientes não são acessíveis por rotas públicas da API

## **Responsividade**

- O formulário de agendamento é utilizável em telas de 320px (smartphones antigos)
- O calendário é navegável via toque em dispositivos móveis

# **9\. Glossário**

- - **PRD:** Product Requirements Document - documento de requisitos do produto
    - **SLA:** Service Level Agreement - acordo de nível de serviço
    - **OAuth 2.0:** Protocolo de autorização usado para integração com Google
    - **JWT:** JSON Web Token - formato seguro para autenticação stateless
    - **ORM:** Object-Relational Mapper - camada de abstração do banco de dados
    - **Serverless:** Modelo de execução de código sem gerenciamento de servidor
    - **LGPD:** Lei Geral de Proteção de Dados - legislação brasileira de privacidade
    - **MVP:** Minimum Viable Product - versão mínima viável do produto

Consolium © 2025 - Documento confidencial de uso interno