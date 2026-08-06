# Family Finance — Documento consolidado

> Este arquivo reúne todo o pacote. Para uso no repositório, prefira os arquivos separados.



---

<!-- SOURCE: 00-README.md -->

# Family Finance — Pacote de especificação para Claude

Este diretório contém a especificação completa para projetar, implementar, testar, documentar e publicar um aplicativo de gestão financeira familiar.

## Objetivo

O Claude deve usar estes arquivos como fonte de verdade para entregar o sistema completo, sem reduzir o escopo para um MVP e sem substituir funcionalidades por protótipos, mocks permanentes ou implementações parciais.

## Ordem de leitura obrigatória

1. `01-PRODUCT-VISION.md`
2. `02-PRD.md`
3. `03-SCOPE-AND-DEFINITION-OF-DONE.md`
4. `04-DOMAIN-RULES.md`
5. `05-UX-UI-SPEC.md`
6. `06-DESIGN-SYSTEM.md`
7. `07-ARCHITECTURE.md`
8. `08-DATA-MODEL.md`
9. `09-API-CONTRACTS.md`
10. `10-SECURITY-AND-RLS.md`
11. `11-OFFLINE-SYNC-AND-PERFORMANCE.md`
12. `12-NOTIFICATIONS-SHORTCUTS-AND-DEEPLINKS.md`
13. `13-TEST-STRATEGY.md`
14. `14-OBSERVABILITY-AND-AUDIT.md`
15. `15-DEPLOYMENT-AND-OPERATIONS.md`
16. `16-IMPLEMENTATION-PLAN.md`
17. `17-ACCEPTANCE-CRITERIA.md`
18. `18-CLAUDE-DESIGN-PROMPT.md`
19. `19-CLAUDE-CODE-PROMPT.md`
20. `20-CLAUDE.md`
21. `21-DECISIONS-AND-ASSUMPTIONS.md`
22. `22-RELEASE-CHECKLIST.md`

## Regra de execução

O Claude deve trabalhar de forma incremental, mas o objetivo final é o produto completo. Fases são apenas uma estratégia de execução e validação; não representam redução de escopo.

O Claude não deve encerrar o trabalho porque uma primeira versão está funcional. Só deve considerar a entrega concluída quando todos os itens da definição de pronto e do checklist de release estiverem atendidos.

## Uso recomendado

- Coloque todos os arquivos na raiz de documentação do projeto.
- Copie `20-CLAUDE.md` para a raiz do repositório com o nome `CLAUDE.md`.
- Forneça `18-CLAUDE-DESIGN-PROMPT.md` ao Claude responsável pelo design.
- Forneça `19-CLAUDE-CODE-PROMPT.md` ao Claude responsável pela implementação.
- Mantenha `21-DECISIONS-AND-ASSUMPTIONS.md` atualizado quando decisões forem alteradas.


---

<!-- SOURCE: 01-PRODUCT-VISION.md -->

# Visão do produto

## Nome provisório

Family Finance.

## Missão

Dar a todos os membros de uma família uma visão compartilhada, confiável e simples das finanças domésticas, permitindo registrar, planejar, acompanhar e analisar receitas, despesas, contas, cartões e responsabilidades individuais.

## Problema

Finanças familiares costumam ficar distribuídas entre aplicativos bancários, planilhas, mensagens e memória. Isso provoca:

- Falta de visão consolidada.
- Duplicidade de registros.
- Confusão entre valores previstos e realizados.
- Dificuldade para acompanhar pagamentos parciais.
- Falta de controle sobre faturas e parcelamentos.
- Ausência de análise por membro da família.
- Pouca transparência sobre quem registrou ou realizou cada gasto.
- Fricção elevada para registrar pequenas compras.

## Proposta de valor

O aplicativo será a fonte de verdade financeira da família.

Ele deverá:

- Consolidar contas bancárias, dinheiro, carteiras digitais, investimentos simples e cartões.
- Permitir planejamento e realização financeira no mesmo ambiente.
- Diferenciar competência e caixa.
- Suportar baixas totais e parciais.
- Controlar compras, parcelas, faturas e pagamentos de cartão sem dupla contabilização.
- Atribuir gastos e receitas a membros.
- Aplicar permissões diferentes para adultos e filhos.
- Oferecer lançamento rápido dentro e fora do aplicativo.
- Produzir relatórios claros e auditáveis.

## Princípios

### Velocidade

Registrar uma despesa comum deve levar poucos segundos.

### Simplicidade

A interface deve utilizar linguagem cotidiana e esconder complexidade contábil.

### Integridade

Nenhuma operação financeira pode ser duplicada, perdida ou alterada silenciosamente.

### Colaboração

Cada membro deve participar de acordo com seu papel e suas permissões.

### Privacidade

Contas e movimentações podem ter visibilidade restrita.

### Transparência

Toda alteração relevante deve possuir histórico, autor e data.

### Evolução sustentável

A arquitetura deve suportar novas funcionalidades sem comprometer as regras financeiras existentes.


---

<!-- SOURCE: 02-PRD.md -->

# PRD — Aplicativo de gestão financeira familiar

## 1. Plataformas

- iOS.
- Android.
- Backend em nuvem.
- Painel administrativo técnico restrito.
- Preparação arquitetural para uma versão web futura.

## 2. Localização inicial

- Idioma: português do Brasil.
- Moeda: BRL.
- Fuso padrão: `America/Bahia`.
- Formato de data: `dd/MM/yyyy`.
- Valores armazenados em centavos.

## 3. Perfis

### Proprietário

Controle total da família, membros, permissões, contas, configurações e dados.

### Administrador

Pode administrar finanças e membros, exceto excluir a família, remover o proprietário ou transferir propriedade.

### Adulto

Pode visualizar e operar recursos autorizados.

### Membro

Pode registrar e consultar informações de acordo com as permissões recebidas.

### Filho supervisionado

Pode registrar e consultar dados próprios e utilizar somente contas autorizadas. Pode ficar sujeito a aprovação.

## 4. Módulos funcionais

### 4.1 Família e membros

- Criar família.
- Editar nome, moeda e fuso.
- Convidar membro.
- Aceitar convite.
- Remover ou suspender membro.
- Definir perfil.
- Definir visibilidade.
- Definir contas autorizadas.
- Configurar aprovação por valor ou por tipo de operação.
- Revogar sessões e dispositivos.
- Registrar histórico administrativo.

### 4.2 Contas financeiras

Uma única entidade `accounts` deve representar:

- Conta corrente.
- Conta poupança.
- Dinheiro.
- Carteira digital.
- Investimento simples.
- Cartão de crédito.

Campos comuns:

- Nome.
- Tipo.
- Instituição.
- Titular.
- Cor.
- Ícone.
- Moeda.
- Saldo inicial.
- Data do saldo inicial.
- Visibilidade.
- Membros autorizados.
- Status.

Campos específicos de cartão:

- Bandeira.
- Quatro últimos dígitos.
- Limite.
- Dia de fechamento.
- Dia de vencimento.
- Conta padrão de pagamento.
- Titular.

Não armazenar número completo, CVV, senha ou credenciais bancárias.

### 4.3 Contas a pagar

- Descrição.
- Valor.
- Categoria.
- Membro relacionado.
- Competência.
- Vencimento.
- Conta prevista.
- Favorecido.
- Observação.
- Recorrência.
- Parcelamento.
- Anexos.
- Lembretes.
- Status.
- Baixas.
- Estornos.

### 4.4 Contas a receber

Mesma estrutura de contas a pagar, com natureza de receita.

### 4.5 Baixas

- Baixa total.
- Baixa parcial.
- Múltiplas baixas.
- Baixas usando contas diferentes.
- Juros.
- Multa.
- Desconto.
- Data efetiva.
- Observação.
- Estorno.
- Histórico.

### 4.6 Movimentações realizadas

- Despesa.
- Receita.
- Transferência.
- Compra no cartão.
- Pagamento de cartão.
- Reembolso.
- Ajuste de saldo.
- Estorno.

### 4.7 Cartão de crédito

- Compras à vista.
- Compras parceladas.
- Parcelas futuras.
- Ciclo da fatura.
- Fechamento.
- Vencimento.
- Fatura aberta.
- Fatura fechada.
- Pagamento parcial.
- Pagamento total.
- Estorno.
- Reembolso.
- Limite utilizado.
- Limite disponível.
- Compras por membro.
- Categorias.
- Alteração controlada de vencimento e fechamento.

### 4.8 Recorrências

- Diário.
- Semanal.
- Quinzenal.
- Mensal.
- Bimestral.
- Trimestral.
- Semestral.
- Anual.
- Intervalo personalizado.
- Data final.
- Número máximo de ocorrências.
- Alteração somente desta, desta e próximas ou da série inteira.
- Pausa e retomada.

### 4.9 Categorias

- Receita e despesa.
- Categoria e subcategoria.
- Nome.
- Ícone.
- Cor.
- Ordem.
- Arquivamento.
- Categorias padrão.
- Categorias personalizadas.

### 4.10 Rateios

Uma movimentação pode ser rateada por:

- Categoria.
- Subcategoria.
- Membro.
- Centro de interesse familiar opcional.

A soma dos rateios deve ser igual ao valor total.

### 4.11 Planejamento

- Calendário financeiro.
- Valores previstos.
- Valores realizados.
- Valores pendentes.
- Vencidos.
- Próximos vencimentos.
- Fluxo de caixa futuro.
- Recorrências futuras.
- Parcelas futuras.

### 4.12 Dashboard

- Saldo consolidado.
- Saldo disponível.
- Cartões em aberto.
- Receitas previstas.
- Receitas realizadas.
- Despesas previstas.
- Despesas realizadas.
- Resultado previsto.
- Resultado realizado.
- Vencidos.
- Próximos compromissos.
- Principais categorias.
- Resumo por membro.
- Comparação com período anterior.

### 4.13 Relatórios

- Por categoria.
- Por subcategoria.
- Por membro.
- Por conta.
- Por cartão.
- Por período.
- Previsto versus realizado.
- Competência versus caixa.
- Receitas versus despesas.
- Evolução mensal.
- Parcelamentos.
- Faturas.
- Exportação CSV.
- Exportação PDF.
- Compartilhamento conforme permissão.

### 4.14 Busca e filtros

- Texto.
- Data.
- Valor.
- Tipo.
- Conta.
- Cartão.
- Categoria.
- Membro.
- Status.
- Competência.
- Origem.
- Autor.
- Vencimento.

### 4.15 Notificações

- Conta próxima do vencimento.
- Conta vencida.
- Receita não recebida.
- Fatura próxima do fechamento.
- Fatura próxima do vencimento.
- Limite do cartão.
- Aprovação pendente.
- Aprovação concedida ou negada.
- Lançamento acima de valor configurado.
- Recorrência gerada.
- Falha de sincronização relevante.

### 4.16 Lançamento rápido

Botão central `+` no menu inferior.

Ações:

- Despesa realizada.
- Receita realizada.
- Conta a pagar.
- Conta a receber.
- Compra no cartão.
- Transferência.
- Pagamento de fatura.

Requisitos:

- Valor como primeiro campo.
- Sugestões recentes.
- Conta e membro pré-selecionáveis.
- Campos secundários em “Mais detalhes”.
- Salvamento idempotente.
- Feedback imediato.
- Possibilidade de “salvar e lançar outro”.

### 4.17 Atalhos fora do aplicativo

Ao manter pressionado o ícone:

- Registrar despesa.
- Registrar receita.
- Registrar compra no cartão.
- Criar conta a pagar.

Cada ação abre diretamente o formulário correspondente por deep link interno.

### 4.18 Anexos

- Foto de comprovante.
- Documento.
- Nota.
- Armazenamento seguro.
- Controle de acesso por família.
- Compressão de imagem.
- Exclusão vinculada às políticas de retenção.

### 4.19 Auditoria

Registrar:

- Criação.
- Alteração.
- Cancelamento.
- Baixa.
- Estorno.
- Mudança de permissão.
- Arquivamento.
- Aprovação.
- Rejeição.
- Exportação sensível.
- Autor.
- Data.
- Dados anteriores e novos.

## 5. Navegação

Menu inferior:

1. Início.
2. Planejamento.
3. Botão central `+`.
4. Movimentações.
5. Mais.

## 6. Requisitos não funcionais

- Aplicativo rápido em aparelhos intermediários.
- Interface responsiva.
- Cache local.
- Sincronização resiliente.
- Operações financeiras atômicas.
- Row Level Security.
- Autorização no servidor.
- Acessibilidade.
- Logs e métricas.
- Testes automatizados.
- Migrações versionadas.
- CI/CD.
- Backup e recuperação.
- Observabilidade.
- Proteção contra duplicidade.
- Proteção contra concorrência em baixas.
- Criptografia em trânsito e em repouso conforme a plataforma.


---

<!-- SOURCE: 03-SCOPE-AND-DEFINITION-OF-DONE.md -->

# Escopo completo e definição de pronto

## Regra principal

Este projeto não deve ser tratado como MVP.

Fases, marcos e entregas intermediárias existem apenas para reduzir risco técnico e facilitar validação. Nenhuma fase elimina funcionalidades do escopo final.

## Produto considerado completo

O sistema só pode ser considerado pronto quando:

### Produto

- Todos os módulos do PRD estiverem implementados.
- Não houver fluxos principais substituídos por mocks permanentes.
- Não houver telas essenciais apenas ilustrativas.
- Não houver botões sem comportamento.
- Não houver regras financeiras delegadas ao usuário.
- Todos os estados relevantes estiverem tratados.

### Design

- Todas as telas obrigatórias estiverem desenhadas.
- Componentes e variantes estiverem documentados.
- Fluxos estiverem prototipados.
- Estados de erro, vazio, carregamento, bloqueio e sucesso estiverem definidos.
- Acessibilidade estiver contemplada.
- Textos estiverem revisados em português do Brasil.
- Layouts estiverem validados em tamanhos comuns de tela.

### Mobile

- Aplicativo funcionando em iOS e Android.
- Navegação completa.
- Atalhos no ícone funcionando.
- Deep links funcionando.
- Notificações funcionando.
- Upload de anexos funcionando.
- Cache e sincronização funcionando.
- Sessão e autenticação funcionando.
- Bloqueio biométrico opcional funcionando.
- Nenhum segredo no bundle.

### Backend

- Banco versionado.
- Constraints aplicadas.
- Índices definidos.
- RLS aplicada.
- Serviços financeiros atômicos.
- Jobs de recorrência funcionando.
- Jobs de notificação funcionando.
- Anexos protegidos.
- Auditoria completa.
- Backups configurados.
- Estratégia de recuperação testada.

### Regras financeiras

- Baixa total.
- Baixa parcial.
- Múltiplas baixas.
- Estornos.
- Transferências.
- Compras no cartão.
- Parcelamentos.
- Faturas.
- Pagamentos de fatura.
- Reembolsos.
- Competência.
- Caixa.
- Rateios.
- Recorrências.
- Conciliação de saldos.
- Proteção contra duplicidade.
- Proteção contra concorrência.

### Qualidade

- Lint aprovado.
- Typecheck aprovado.
- Testes unitários aprovados.
- Testes de integração aprovados.
- Testes de RLS aprovados.
- Testes E2E aprovados.
- Testes de acessibilidade básicos aprovados.
- Testes em aparelhos reais ou farms de dispositivos aprovados.
- Sem defeitos críticos ou altos em aberto.
- Crash-free sessions dentro da meta.
- Métricas de performance dentro da meta.

### Operação

- Ambientes de desenvolvimento, homologação e produção.
- CI/CD.
- Migrações automatizadas e controladas.
- Monitoramento.
- Alertas.
- Runbooks.
- Política de rollback.
- Política de backup.
- Política de retenção.
- Documentação de suporte.

### Publicação

- Builds assinados.
- Ícones e splash.
- Permissões de sistema revisadas.
- Política de privacidade.
- Termos de uso.
- Metadados das lojas.
- TestFlight e trilha de testes Android.
- Release de produção.
- Smoke tests pós-publicação.

## Condições legítimas para o Claude interromper

O Claude só deve solicitar intervenção quando houver bloqueio real, como:

- Credencial ou segredo externo indispensável.
- Conta de loja ou serviço não disponível.
- Decisão legal ou comercial que não possa ser inferida.
- Requisito contraditório que afete integridade financeira.
- Operação irreversível em produção.
- Custo externo que exija aprovação humana.

Quando bloqueado, deve:

1. Documentar o bloqueio.
2. Continuar todo o trabalho não bloqueado.
3. Deixar instruções exatas para resolver o bloqueio.
4. Retomar do ponto registrado assim que o bloqueio for removido.

## Proibido considerar concluído

- Apenas porque o app abre.
- Apenas porque o dashboard funciona.
- Apenas porque existe autenticação.
- Apenas porque os fluxos básicos funcionam.
- Apenas porque passou em ambiente local.
- Apenas porque uma plataforma funciona.
- Apenas porque os testes unitários passaram.
- Apenas porque existe uma versão demonstrável.


---

<!-- SOURCE: 04-DOMAIN-RULES.md -->

# Regras de domínio financeiro

## 1. Dinheiro

Todos os valores devem ser armazenados como inteiros na menor unidade monetária.

Exemplos:

- R$ 10,00 = `1000`.
- R$ 125,90 = `12590`.

Nunca utilizar ponto flutuante para cálculos financeiros.

## 2. Datas

Cada registro pode possuir:

- Data de competência.
- Data de vencimento.
- Data prevista.
- Data efetiva.
- Data de criação.
- Data de atualização.

As regras de apresentação devem utilizar o fuso da família.

## 3. Conta prevista

Uma conta a pagar ou receber representa uma obrigação ou expectativa.

Ela não altera saldo financeiro até existir uma baixa, salvo em relatórios de competência.

## 4. Saldo em aberto

```text
outstanding =
original_amount
+ interest
+ penalty
- discount
- valid_settlements
```

## 5. Status persistidos

- `OPEN`
- `PARTIAL`
- `SETTLED`
- `CANCELED`

Vencimento deve ser derivado:

```text
due_date < family_today
AND outstanding > 0
AND status != CANCELED
```

## 6. Baixa

Uma baixa:

- Gera uma movimentação realizada.
- Fica vinculada à conta prevista.
- Atualiza o saldo em aberto.
- Deve ser atômica.
- Deve possuir chave de idempotência.
- Deve validar concorrência.
- Pode conter juros, multa e desconto.
- Pode ser estornada.

## 7. Baixa parcial

- O valor principal não pode ultrapassar o saldo principal em aberto.
- Juros e multas devem ser informados separadamente.
- Desconto deve ser informado separadamente.
- Múltiplas baixas podem usar contas diferentes.
- Cada baixa possui sua própria data.

## 8. Estorno

Não excluir movimentação financeira postada.

O estorno deve:

- Criar registro inverso.
- Preservar o original.
- Exigir motivo.
- Registrar autor.
- Recalcular saldos e relatórios.
- Impedir estorno duplicado.

## 9. Transferência

- Origem e destino diferentes.
- Não é receita.
- Não é despesa.
- Afeta os saldos de origem e destino.
- Deve ser atômica.
- Deve ser reversível.
- Pode incluir tarifa separada como despesa, quando aplicável.

## 10. Cartão de crédito

### Compra

- Gera despesa por competência.
- Aumenta o saldo devedor do cartão.
- Consome limite.
- Não diminui conta bancária no momento da compra.

### Compra parcelada

- Cria grupo de parcelas.
- Cada parcela pertence a uma competência e fatura.
- A soma das parcelas deve ser igual ao valor original.
- Diferença de centavos deve ser aplicada na última parcela.

### Fatura

- Agrupa itens de um ciclo.
- Pode estar aberta, fechada, parcial, paga ou vencida.
- Recebe pagamentos vinculados.

### Pagamento de fatura

- Diminui conta bancária.
- Diminui saldo devedor do cartão.
- Não cria nova despesa.
- Pode ser total ou parcial.
- Pode ser estornado.
- Deve ser atômico.

### Reembolso

- Deve reduzir o saldo do cartão.
- Deve reduzir a despesa conforme o modo de relatório.
- Deve ser associado à compra quando possível.

## 11. Competência e caixa

### Competência

Considera o período econômico do fato.

### Caixa

Considera a entrada ou saída efetiva.

O mesmo dashboard não deve misturar os dois modos sem indicação explícita.

## 12. Rateio

- A soma deve ser igual ao total.
- Rateios podem usar categoria e membro.
- Alteração de rateio deve ser auditada.
- Rateio não altera o valor total da movimentação.

## 13. Saldo de conta

O saldo deve ser derivável a partir de:

- Saldo inicial.
- Movimentações postadas.
- Estornos.
- Transferências.
- Ajustes autorizados.

Pode existir cache de saldo, mas a fonte de verdade deve ser reconciliável.

## 14. Idempotência

Obrigatória em:

- Criação de movimentação.
- Baixa.
- Transferência.
- Compra no cartão.
- Pagamento de fatura.
- Estorno.
- Importação.
- Ações vindas de atalhos e notificações.

Uma mesma chave não pode produzir dois efeitos financeiros.

## 15. Concorrência

Baixas, pagamentos e estornos devem utilizar:

- Transação de banco.
- Lock ou controle de versão.
- Revalidação do saldo dentro da transação.

## 16. Aprovação

Movimentações sujeitas a aprovação:

- Não afetam saldo enquanto pendentes.
- Não entram como realizadas.
- Podem aparecer em visão de pendências.
- Devem registrar aprovador ou rejeitador.
- Devem preservar o conteúdo original enviado.

## 17. Arquivamento

Contas e categorias em uso não devem ser excluídas.

Arquivamento:

- Impede novos usos.
- Preserva histórico.
- Mantém relatórios antigos.

## 18. Ajuste de saldo

Só pode ser feito por perfis autorizados.

Deve:

- Exigir motivo.
- Gerar movimentação específica.
- Ser auditado.
- Não reescrever histórico.


---

<!-- SOURCE: 05-UX-UI-SPEC.md -->

# Especificação UX/UI

## 1. Objetivo

Criar uma experiência financeira familiar rápida, clara e confiável, utilizável com uma mão e compreensível por pessoas sem formação contábil.

## 2. Navegação principal

- Início.
- Planejamento.
- Botão central `+`.
- Movimentações.
- Mais.

## 3. Telas obrigatórias

### Entrada e família

- Splash.
- Login.
- Cadastro.
- Recuperação de acesso.
- Criação da família.
- Convite.
- Aceite de convite.
- Seleção de família.
- Perfil.
- Segurança e biometria.

### Dashboard

- Visão competência.
- Visão caixa.
- Filtros.
- Resumo mensal.
- Categorias.
- Membros.
- Próximos compromissos.
- Alertas.

### Contas

- Lista.
- Cadastro.
- Edição.
- Detalhe.
- Extrato.
- Permissões.
- Arquivamento.
- Ajuste de saldo.

### Cartões

- Lista.
- Cadastro.
- Detalhe.
- Limite.
- Faturas.
- Itens.
- Pagamento.
- Parcelas.
- Reembolso.

### Planejamento

- Lista de contas a pagar.
- Lista de contas a receber.
- Calendário.
- Detalhe.
- Criação.
- Edição.
- Recorrência.
- Parcelamento.
- Baixa total.
- Baixa parcial.
- Estorno.

### Movimentações

- Lista.
- Busca.
- Filtros.
- Detalhe.
- Edição permitida.
- Estorno.
- Anexo.
- Rateio.

### Família

- Lista de membros.
- Convite.
- Perfil do membro.
- Permissões.
- Contas autorizadas.
- Limites.
- Aprovações.
- Atividade.

### Relatórios

- Visão geral.
- Categoria.
- Membro.
- Conta.
- Cartão.
- Período.
- Exportação.

### Configurações

- Família.
- Conta do usuário.
- Notificações.
- Segurança.
- Categorias.
- Aparência.
- Dados e privacidade.
- Exportação.
- Exclusão.

## 4. Lançamento rápido

### Estrutura

1. Natureza da operação.
2. Valor.
3. Conta.
4. Categoria.
5. Membro.
6. Data.
7. Salvar.
8. Mais detalhes.

### Comportamento

- Valor recebe foco automaticamente.
- Teclado numérico.
- Conta recente sugerida.
- Categorias recentes e favoritas.
- Membro atual sugerido.
- Data atual.
- Descrição opcional.
- Feedback imediato.
- Evitar modais encadeados.

### Meta

Usuário recorrente deve registrar uma despesa simples em até dez segundos.

## 5. Baixa parcial

A tela deve mostrar claramente:

- Valor original.
- Total pago.
- Saldo restante.
- Valor desta baixa.
- Juros.
- Multa.
- Desconto.
- Conta usada.
- Data.

Não usar apenas status textual; mostrar também progresso numérico.

## 6. Fatura

Separar visualmente:

- Compras.
- Parcelas.
- Estornos.
- Pagamentos.
- Saldo em aberto.
- Limite.

O botão principal deve mudar conforme o estado:

- “Pagar fatura”.
- “Completar pagamento”.
- “Ver pagamentos”.

## 7. Estados

Toda tela deve prever:

- Loading inicial.
- Atualização.
- Vazio.
- Erro recuperável.
- Erro definitivo.
- Sem conexão.
- Sem permissão.
- Item arquivado.
- Item estornado.
- Aprovação pendente.
- Conflito de sincronização.
- Duplicidade bloqueada.
- Sucesso.

## 8. Linguagem

Usar:

- Conta a pagar.
- Conta a receber.
- Pago.
- Recebido.
- Parcial.
- Falta pagar.
- Falta receber.
- Previsto.
- Realizado.
- Vencido.
- Compra no cartão.
- Pagamento da fatura.

Evitar jargão contábil na interface.

## 9. Acessibilidade

- Área de toque mínima adequada.
- Leitor de tela.
- Labels em ícones.
- Ordem lógica.
- Contraste.
- Suporte a fonte ampliada.
- Não depender só de cor.
- Feedback tátil opcional.
- Mensagens de erro específicas.

## 10. Uso com uma mão

- Ações principais na região inferior.
- Botão salvar próximo ao polegar.
- Evitar ações críticas no topo.
- Não esconder confirmação atrás do teclado.


---

<!-- SOURCE: 06-DESIGN-SYSTEM.md -->

# Design system

## 1. Direção visual

O produto deve transmitir:

- Organização.
- Segurança.
- Leveza.
- Colaboração familiar.
- Clareza.
- Modernidade sem excesso de elementos.

Evitar aparência excessivamente corporativa, bancária ou infantil.

## 2. Tokens

Definir:

- Cores de marca.
- Cores semânticas.
- Escala tipográfica.
- Espaçamentos.
- Raios.
- Sombras.
- Elevações.
- Opacidades.
- Motion.
- Haptics.
- Breakpoints.
- Z-index.

## 3. Cores semânticas

Criar tokens, não cores fixas espalhadas:

- `surface`
- `surfaceElevated`
- `textPrimary`
- `textSecondary`
- `border`
- `income`
- `expense`
- `warning`
- `danger`
- `success`
- `info`
- `pending`
- `overdue`
- `partial`

Status deve combinar cor, texto e ícone.

## 4. Tipografia

Definir estilos:

- Display.
- Título de página.
- Título de seção.
- Card principal.
- Corpo.
- Corpo pequeno.
- Rótulo.
- Valor monetário grande.
- Valor monetário médio.
- Caption.

Valores monetários devem utilizar numerais tabulares quando disponíveis.

## 5. Componentes

### Navegação

- Bottom navigation.
- App bar.
- Tabs.
- Segmented control.
- Bottom sheet.
- Modal.
- Drawer opcional.

### Formulários

- Money input.
- Text input.
- Date picker.
- Account selector.
- Category selector.
- Member selector.
- Recurrence selector.
- Installment selector.
- Split editor.
- Attachment picker.
- Switch.
- Checkbox.
- Radio.
- Search field.

### Financeiros

- Balance card.
- Summary card.
- Account card.
- Credit card card.
- Planned entry row.
- Transaction row.
- Statement row.
- Payment progress.
- Forecast-versus-actual chart.
- Category breakdown.
- Member breakdown.
- Cash flow chart.

### Feedback

- Toast.
- Snackbar com desfazer.
- Inline error.
- Empty state.
- Skeleton.
- Loading overlay.
- Permission notice.
- Offline banner.
- Sync conflict dialog.

## 6. Variantes

Cada componente deve documentar:

- Propriedades.
- Estados.
- Tamanhos.
- Interações.
- Conteúdo máximo.
- Acessibilidade.
- Dark mode.
- Erros.
- Loading.
- Disabled.

## 7. Motion

- Curto e funcional.
- Sem atrasar tarefas.
- Transições de 150–250 ms como referência.
- Respeitar “reduzir movimento”.
- Usar animação para confirmar relação entre ação e resultado.

## 8. Temas

- Claro.
- Escuro.
- Sistema.

## 9. Iconografia

- Consistente.
- Rótulo textual para ações ambíguas.
- Não usar ícone isolado em ações destrutivas.


---

<!-- SOURCE: 07-ARCHITECTURE.md -->

# Arquitetura técnica

## 1. Stack recomendada

### Mobile

- React Native.
- TypeScript.
- Expo com Development Build ou prebuild.
- Expo Router.
- React Hook Form.
- Zod.
- TanStack Query.
- Zustand.
- Secure Store.
- Biblioteca de persistência local adequada à estratégia de sincronização.
- Módulos nativos para atalhos quando necessário.

### Backend

- Supabase.
- PostgreSQL.
- Supabase Auth.
- Row Level Security.
- Storage.
- Edge Functions.
- Realtime usado seletivamente.
- Jobs agendados para recorrência, notificações e manutenção.

### Qualidade

- ESLint.
- Prettier.
- TypeScript strict.
- Testes unitários.
- Testes de integração.
- Testes E2E.
- Sentry ou equivalente.
- CI/CD.

## 2. Princípios

- Arquitetura por domínio/feature.
- UI sem regras financeiras complexas.
- Backend como autoridade.
- Contratos tipados.
- Operações idempotentes.
- Serviços transacionais.
- Migrações versionadas.
- RLS por padrão.
- Eventos de auditoria.
- Código pequeno e testável.

## 3. Estrutura sugerida

```text
apps/
  mobile/
    app/
    src/
      features/
      components/
      design-system/
      navigation/
      services/
      storage/
      hooks/
      utils/
      config/
      types/
packages/
  domain/
  validation/
  api-contracts/
  test-fixtures/
supabase/
  migrations/
  functions/
  seed/
  tests/
docs/
```

## 4. Camadas

### Presentation

- Telas.
- Componentes.
- Navegação.
- Formulários.
- Feedback.

### Application

- Use cases.
- Orquestração.
- Validação.
- Controle de idempotência no cliente.
- Cache.

### Domain

- Entidades.
- Regras.
- Cálculos.
- Invariantes.
- Erros de negócio.

### Infrastructure

- Supabase.
- Storage.
- Notificações.
- Analytics.
- Logs.
- Persistência local.

## 5. Serviços de domínio

```text
createPlannedEntry
updatePlannedEntry
cancelPlannedEntry
settlePlannedEntry
reverseSettlement

createExpense
createIncome
createTransfer
reverseTransaction

createCardPurchase
createInstallmentPurchase
generateStatement
closeStatement
payStatement
reverseStatementPayment
registerRefund

createRecurrence
materializeRecurrences
pauseRecurrence
updateRecurrenceScope

calculateAccountBalance
calculateCardOutstanding
calculateAvailableLimit
calculateMonthlySummary
calculateCategoryReport
calculateMemberReport
```

## 6. Transações de banco obrigatórias

- Baixa.
- Estorno de baixa.
- Transferência.
- Estorno de transferência.
- Compra parcelada.
- Pagamento de fatura.
- Estorno de pagamento.
- Aprovação que gera movimentação.
- Ajuste de saldo.
- Alteração de rateio postado quando permitida.

## 7. Eventos

Eventos internos sugeridos:

- `planned_entry.created`
- `planned_entry.due_soon`
- `settlement.posted`
- `settlement.reversed`
- `transaction.posted`
- `transaction.reversed`
- `card_statement.closed`
- `card_statement.due_soon`
- `approval.requested`
- `approval.completed`
- `member.invited`

## 8. Decisões de arquitetura

- Não duplicar regras entre app e backend.
- Permitir validação otimista no app, mas validar novamente no servidor.
- Derivar relatórios de dados financeiros confiáveis.
- Usar materialized views somente quando necessário e reconciliáveis.
- Evitar Realtime para tudo.


---

<!-- SOURCE: 08-DATA-MODEL.md -->

# Modelo de dados

## 1. Entidades principais

### households

```text
id uuid pk
name text
currency_code char(3)
timezone text
created_by uuid
created_at timestamptz
updated_at timestamptz
```

### profiles

```text
id uuid pk references auth.users
name text
email text
phone text
avatar_url text
created_at timestamptz
updated_at timestamptz
```

### household_members

```text
id uuid pk
household_id uuid
user_id uuid nullable
display_name text
role text
status text
is_supervised boolean
approval_mode text
approval_threshold_minor bigint nullable
joined_at timestamptz nullable
created_at timestamptz
updated_at timestamptz
```

### invitations

```text
id uuid pk
household_id uuid
email text nullable
token_hash text
role text
expires_at timestamptz
accepted_at timestamptz nullable
created_by uuid
created_at timestamptz
```

### accounts

```text
id uuid pk
household_id uuid
name text
account_type text
institution_name text nullable
currency_code char(3)
opening_balance_minor bigint
opening_balance_date date
primary_member_id uuid nullable
visibility_scope text
color text nullable
icon text nullable
is_active boolean

card_brand text nullable
card_last_four text nullable
credit_limit_minor bigint nullable
closing_day smallint nullable
due_day smallint nullable
default_payment_account_id uuid nullable

created_by uuid
created_at timestamptz
updated_at timestamptz
archived_at timestamptz nullable
version integer
```

### account_member_permissions

```text
id uuid pk
account_id uuid
member_id uuid
can_view boolean
can_transact boolean
can_edit boolean
created_at timestamptz
updated_at timestamptz
unique(account_id, member_id)
```

### categories

```text
id uuid pk
household_id uuid
parent_id uuid nullable
name text
nature text
icon text nullable
color text nullable
sort_order integer
is_system boolean
is_active boolean
created_at timestamptz
updated_at timestamptz
```

### counterparties

```text
id uuid pk
household_id uuid
name text
type text nullable
created_at timestamptz
updated_at timestamptz
```

### planned_entries

```text
id uuid pk
household_id uuid
nature text
description text
original_amount_minor bigint
competence_date date
due_date date
expected_account_id uuid nullable
member_id uuid
category_id uuid
counterparty_id uuid nullable
status text
recurrence_rule_id uuid nullable
installment_group_id uuid nullable
installment_number integer nullable
installment_total integer nullable
notes text nullable
created_by uuid
created_at timestamptz
updated_at timestamptz
canceled_at timestamptz nullable
version integer
```

### settlements

```text
id uuid pk
household_id uuid
planned_entry_id uuid
transaction_id uuid
principal_amount_minor bigint
interest_amount_minor bigint
penalty_amount_minor bigint
discount_amount_minor bigint
net_amount_minor bigint
settled_at timestamptz
created_by uuid
created_at timestamptz
reversed_at timestamptz nullable
reversed_by uuid nullable
reversal_reason text nullable
idempotency_key text
```

### transactions

```text
id uuid pk
household_id uuid
transaction_type text
description text
amount_minor bigint
occurred_at timestamptz
competence_date date
account_id uuid
destination_account_id uuid nullable
member_id uuid
category_id uuid nullable
counterparty_id uuid nullable
source text
status text
idempotency_key text
created_by uuid
created_at timestamptz
updated_at timestamptz
reversed_transaction_id uuid nullable
approval_request_id uuid nullable
version integer
```

### transaction_allocations

```text
id uuid pk
transaction_id uuid
category_id uuid
member_id uuid
amount_minor bigint
created_at timestamptz
```

### installment_groups

```text
id uuid pk
household_id uuid
description text
total_amount_minor bigint
installment_count integer
account_id uuid
purchase_date date
created_by uuid
created_at timestamptz
```

### card_statements

```text
id uuid pk
household_id uuid
account_id uuid
cycle_start_date date
cycle_end_date date
closing_date date
due_date date
status text
created_at timestamptz
updated_at timestamptz
version integer
unique(account_id, cycle_start_date, cycle_end_date)
```

### card_statement_items

```text
id uuid pk
card_statement_id uuid
transaction_id uuid
amount_minor bigint
created_at timestamptz
unique(card_statement_id, transaction_id)
```

### recurrence_rules

```text
id uuid pk
household_id uuid
frequency text
interval integer
start_date date
end_date date nullable
max_occurrences integer nullable
day_of_month integer nullable
days_of_week integer[] nullable
next_generation_date date
template_payload jsonb
is_active boolean
created_by uuid
created_at timestamptz
updated_at timestamptz
version integer
```

### approval_requests

```text
id uuid pk
household_id uuid
requested_by_member_id uuid
entity_type text
entity_payload jsonb
status text
requested_at timestamptz
decided_at timestamptz nullable
decided_by uuid nullable
decision_reason text nullable
```

### attachments

```text
id uuid pk
household_id uuid
entity_type text
entity_id uuid
storage_path text
mime_type text
size_bytes bigint
created_by uuid
created_at timestamptz
deleted_at timestamptz nullable
```

### notifications

```text
id uuid pk
household_id uuid
user_id uuid
type text
entity_type text nullable
entity_id uuid nullable
scheduled_at timestamptz
sent_at timestamptz nullable
read_at timestamptz nullable
status text
payload jsonb
```

### devices

```text
id uuid pk
user_id uuid
platform text
push_token text
last_seen_at timestamptz
revoked_at timestamptz nullable
created_at timestamptz
```

### audit_logs

```text
id uuid pk
household_id uuid
actor_user_id uuid
entity_type text
entity_id uuid
action text
before_data jsonb nullable
after_data jsonb nullable
metadata jsonb nullable
created_at timestamptz
```

## 2. Constraints obrigatórias

- Valores não negativos quando aplicável.
- `closing_day` e `due_day` entre 1 e 31.
- Cartão exige limite, fechamento e vencimento.
- Conta não cartão não deve conter campos de cartão.
- `idempotency_key` única por família e operação.
- Rateios somam o total.
- Conta origem diferente de destino.
- Role e status com check constraints.
- Foreign keys com política de exclusão segura.
- Linhas financeiras postadas não são removidas em cascata.

## 3. Índices

Indexar:

- `household_id`.
- `account_id`.
- `member_id`.
- `category_id`.
- `due_date`.
- `competence_date`.
- `occurred_at`.
- `status`.
- `created_at`.
- `recurrence_rule_id`.
- `card_statement_id`.
- `idempotency_key`.

## 4. Soft delete

Usar arquivamento para:

- Contas.
- Categorias.
- Membros.
- Anexos.

Não usar exclusão física para movimentações postadas.


---

<!-- SOURCE: 09-API-CONTRACTS.md -->

# Contratos de API e comandos de domínio

## 1. Princípios

- Contratos validados com Zod.
- IDs UUID.
- Valores em centavos.
- Datas ISO 8601.
- Erros tipados.
- Idempotency key obrigatória em comandos financeiros.
- O servidor recalcula permissões e totais.
- O cliente não envia saldos calculados como fonte de verdade.

## 2. Estrutura de erro

```json
{
  "code": "OUTSTANDING_AMOUNT_EXCEEDED",
  "message": "O valor informado excede o saldo em aberto.",
  "details": {
    "outstandingMinor": 60000
  },
  "requestId": "uuid"
}
```

## 3. Criar conta prevista

```ts
type CreatePlannedEntryCommand = {
  householdId: string;
  nature: "PAYABLE" | "RECEIVABLE";
  description: string;
  originalAmountMinor: number;
  competenceDate: string;
  dueDate: string;
  expectedAccountId?: string;
  memberId: string;
  categoryId: string;
  counterpartyId?: string;
  notes?: string;
  recurrence?: RecurrenceInput;
  idempotencyKey: string;
};
```

## 4. Dar baixa

```ts
type SettlePlannedEntryCommand = {
  householdId: string;
  plannedEntryId: string;
  accountId: string;
  principalAmountMinor: number;
  interestAmountMinor?: number;
  penaltyAmountMinor?: number;
  discountAmountMinor?: number;
  settledAt: string;
  notes?: string;
  idempotencyKey: string;
  expectedVersion: number;
};
```

## 5. Criar despesa realizada

```ts
type CreateExpenseCommand = {
  householdId: string;
  accountId: string;
  amountMinor: number;
  description?: string;
  categoryId: string;
  memberId: string;
  occurredAt: string;
  competenceDate: string;
  allocations?: AllocationInput[];
  attachmentIds?: string[];
  source: "APP" | "BOTTOM_ACTION" | "HOME_SCREEN_SHORTCUT" | "NOTIFICATION";
  idempotencyKey: string;
};
```

## 6. Transferência

```ts
type CreateTransferCommand = {
  householdId: string;
  sourceAccountId: string;
  destinationAccountId: string;
  amountMinor: number;
  occurredAt: string;
  description?: string;
  fee?: {
    amountMinor: number;
    categoryId: string;
    memberId: string;
  };
  idempotencyKey: string;
};
```

## 7. Compra no cartão

```ts
type CreateCardPurchaseCommand = {
  householdId: string;
  cardAccountId: string;
  totalAmountMinor: number;
  description: string;
  categoryId: string;
  memberId: string;
  purchaseDate: string;
  installmentCount: number;
  firstStatementDate?: string;
  allocations?: AllocationInput[];
  idempotencyKey: string;
};
```

## 8. Pagamento de fatura

```ts
type PayCardStatementCommand = {
  householdId: string;
  statementId: string;
  sourceAccountId: string;
  amountMinor: number;
  paidAt: string;
  idempotencyKey: string;
  expectedVersion: number;
};
```

## 9. Estorno

```ts
type ReverseTransactionCommand = {
  householdId: string;
  transactionId: string;
  reason: string;
  reversedAt: string;
  idempotencyKey: string;
  expectedVersion: number;
};
```

## 10. Relatórios

### Resumo mensal

Parâmetros:

- Família.
- Período.
- Modo `ACCRUAL` ou `CASH`.
- Conta opcional.
- Categoria opcional.
- Membro opcional.

Resposta:

- Receitas previstas.
- Receitas realizadas.
- Despesas previstas.
- Despesas realizadas.
- Resultado.
- Pendentes.
- Vencidos.
- Categorias.
- Membros.
- Contas.

## 11. Paginação

Listas devem usar cursor.

```json
{
  "items": [],
  "nextCursor": "opaque-or-null"
}
```

## 12. Códigos de erro mínimos

- `AUTH_REQUIRED`
- `FORBIDDEN`
- `HOUSEHOLD_NOT_FOUND`
- `ACCOUNT_NOT_FOUND`
- `ACCOUNT_ARCHIVED`
- `INVALID_ACCOUNT_TYPE`
- `OUTSTANDING_AMOUNT_EXCEEDED`
- `ALREADY_SETTLED`
- `VERSION_CONFLICT`
- `DUPLICATE_IDEMPOTENCY_KEY`
- `INVALID_ALLOCATION_TOTAL`
- `STATEMENT_ALREADY_PAID`
- `INSUFFICIENT_PERMISSION`
- `APPROVAL_REQUIRED`
- `TRANSACTION_ALREADY_REVERSED`
- `OFFLINE_OPERATION_REJECTED`


---

<!-- SOURCE: 10-SECURITY-AND-RLS.md -->

# Segurança e Row Level Security

## 1. Princípios

- Negar por padrão.
- Autorizar no backend.
- Isolar por família.
- Aplicar menor privilégio.
- Não confiar em role enviado pelo cliente.
- Auditar ações sensíveis.
- Não registrar segredos em logs.

## 2. Autenticação

- E-mail e senha ou magic link.
- Provedores sociais opcionais.
- MFA opcional para adultos.
- Sessões revogáveis.
- Renovação segura de token.
- Bloqueio biométrico local opcional.
- Proteção contra enumeração de contas.

## 3. RLS

Toda tabela familiar deve possuir `household_id`.

Política base:

```text
Usuário autenticado
AND existe household_members ativo
AND household_members.household_id = row.household_id
```

Aplicar condições adicionais por:

- Papel.
- Conta autorizada.
- Visibilidade.
- Autor.
- Membro associado.
- Estado da operação.

## 4. Regras por perfil

### Proprietário

Acesso integral, exceto operações protegidas por fluxo explícito.

### Administrador

Acesso financeiro amplo e gestão de membros, sem poder remover proprietário ou excluir família.

### Adulto

Acesso conforme permissões de conta e visibilidade.

### Filho supervisionado

- Sem acesso a contas restritas.
- Sem gestão administrativa.
- Operações podem exigir aprovação.
- Relatórios limitados.
- Sem acesso a exportação ampla.

## 5. Contas

Uma conta pode ser:

- `HOUSEHOLD`
- `ADULTS_ONLY`
- `SELECTED_MEMBERS`
- `OWNER_ONLY`

RLS deve considerar `account_member_permissions`.

## 6. Funções privilegiadas

Operações financeiras críticas devem ser executadas por funções controladas:

- Baixa.
- Estorno.
- Transferência.
- Compra parcelada.
- Pagamento de fatura.
- Aprovação.

As funções devem:

- Validar usuário.
- Validar família.
- Validar permissão.
- Validar versão.
- Validar idempotência.
- Executar transação.
- Auditar.

## 7. Storage

- Bucket privado.
- Caminho contendo `household_id`.
- URL assinada com expiração.
- Validação de MIME e tamanho.
- Remoção de metadados de imagem quando apropriado.
- Proteção contra arquivos executáveis.

## 8. Segredos

- Somente em ambiente seguro.
- Nunca no aplicativo.
- Nunca em `CLAUDE.md`.
- Nunca em commits.
- Rotação documentada.

## 9. Privacidade

- Exportação sob permissão.
- Exclusão de conta com fluxo confirmado.
- Política de retenção.
- Minimização de dados.
- Consentimento para notificações.
- Dados de crianças tratados com proteção adicional.
- Política de privacidade revisada juridicamente antes da publicação.

## 10. Testes de segurança

- RLS por papel.
- Acesso cruzado entre famílias.
- Acesso direto por ID.
- Upload indevido.
- Escalada de privilégio.
- Replay de comando.
- Duplicidade.
- Concorrência.
- Sessão revogada.
- Token expirado.
- Exportação não autorizada.


---

<!-- SOURCE: 11-OFFLINE-SYNC-AND-PERFORMANCE.md -->

# Offline, sincronização e performance

## 1. Estratégia

O aplicativo deve continuar útil em conexão instável.

### Leitura offline

Disponível para:

- Contas.
- Categorias.
- Membros permitidos.
- Dashboard recente.
- Movimentações recentes.
- Contas previstas próximas.
- Faturas recentes.

### Escrita offline

Permitida somente para comandos seguros e reconciliáveis:

- Despesa.
- Receita.
- Compra simples no cartão.
- Criação de conta prevista.

Operações críticas podem exigir conexão:

- Baixa sobre saldo disputado.
- Pagamento de fatura.
- Transferência.
- Estorno.
- Aprovação.
- Mudança de permissão.

## 2. Outbox

Comandos offline devem ser salvos em outbox contendo:

- ID local.
- Idempotency key.
- Tipo.
- Payload.
- Data.
- Número de tentativas.
- Último erro.
- Status.

## 3. Conflitos

Estratégia:

- Dados financeiros postados: servidor vence.
- Preferências simples: última alteração válida.
- Conflitos de versão: solicitar atualização e reaplicar intenção.
- Nunca mesclar automaticamente valores financeiros conflitantes.

## 4. Feedback

Exibir:

- Salvo localmente.
- Aguardando sincronização.
- Sincronizado.
- Falhou.
- Requer atenção.

## 5. Metas

- Resposta ao toque: até 100 ms.
- Formulário rápido quente: até 1 s.
- Dashboard com cache: até 1 s.
- Dashboard sem cache: até 2,5 s em aparelho intermediário.
- Listas paginadas.
- Imagens comprimidas.
- Queries indexadas.

## 6. Otimização

- Evitar consultas N+1.
- Usar selects mínimos.
- Paginação por cursor.
- Pré-carregar seletores usados no lançamento rápido.
- Cache de categorias, contas e membros.
- Memoização somente quando medida.
- Processar relatórios pesados no backend.
- Materialized views quando justificadas.
- Instrumentar tempo de consulta.

## 7. Reconciliação

Implementar rotina de verificação:

- Saldo derivado versus saldo em cache.
- Fatura versus itens e pagamentos.
- Conta prevista versus baixas.
- Rateios versus total.
- Idempotency keys duplicadas.


---

<!-- SOURCE: 12-NOTIFICATIONS-SHORTCUTS-AND-DEEPLINKS.md -->

# Notificações, atalhos e deep links

## 1. Deep links

Definir uma camada única de roteamento.

Rotas mínimas:

```text
familyfinance://quick/expense
familyfinance://quick/income
familyfinance://quick/card-purchase
familyfinance://planned/payable/new
familyfinance://planned/{id}
familyfinance://transaction/{id}
familyfinance://statement/{id}
familyfinance://approval/{id}
```

O mesmo formulário deve ser reutilizado pelo:

- Botão `+`.
- Atalho do ícone.
- Notificação.
- Link interno.

## 2. Atalhos no ícone

### iOS

Configurar Home Screen Quick Actions.

### Android

Configurar App Shortcuts.

Ações:

- Registrar despesa.
- Registrar receita.
- Compra no cartão.
- Conta a pagar.

Requisitos:

- Funcionar com app fechado.
- Restaurar sessão.
- Redirecionar para login quando necessário.
- Retomar a intenção após autenticação.
- Impedir duplicidade.
- Voltar para a tela inicial após concluir.

## 3. Push notifications

Tipos:

- Vencimento.
- Atraso.
- Fatura.
- Limite.
- Aprovação.
- Convite.
- Falha de sincronização.
- Segurança.

## 4. Preferências

Usuário pode configurar:

- Canal.
- Horário.
- Antecedência.
- Tipos.
- Silêncio.
- Resumo diário.
- Alertas imediatos.

## 5. Jobs

- Gerar notificações futuras.
- Recalcular após mudança de vencimento.
- Cancelar notificações de itens pagos ou cancelados.
- Evitar duplicidade.
- Respeitar fuso da família.

## 6. Abertura

Ao tocar em uma notificação:

- Validar autenticação.
- Validar permissão.
- Abrir o contexto correto.
- Exibir fallback quando o item não estiver mais disponível.


---

<!-- SOURCE: 13-TEST-STRATEGY.md -->

# Estratégia de testes

## 1. Pirâmide

### Unitários

- Cálculos monetários.
- Parcelamento.
- Datas.
- Competência e caixa.
- Status.
- Rateios.
- Limites.
- Recorrências.
- Permissões puras.

### Integração

- Banco.
- Transações.
- RLS.
- Storage.
- Funções.
- Jobs.
- Idempotência.
- Concorrência.

### E2E

- Fluxos críticos em iOS e Android.
- Atalhos.
- Notificações.
- Deep links.
- Offline e sincronização.
- Aprovações.

## 2. Casos financeiros obrigatórios

### Baixa parcial

```text
Original: 100000
Baixa: 40000
Restante: 60000
Status: PARTIAL
```

### Baixa completa após parcial

```text
Original: 100000
Baixas: 40000 + 60000
Restante: 0
Status: SETTLED
```

### Excesso

```text
Restante: 60000
Tentativa: 70000
Resultado: rejeição
```

### Concorrência

Duas requisições tentam liquidar o mesmo saldo.

Resultado: apenas uma produz efeito.

### Idempotência

Duas requisições com a mesma chave.

Resultado: uma única movimentação.

### Transferência

Não gera receita nem despesa.

### Compra no cartão

Gera despesa e dívida no cartão, sem saída bancária.

### Pagamento da fatura

Gera saída bancária e reduz dívida, sem nova despesa.

### Parcelamento

A soma das parcelas deve ser igual ao total.

### Estorno

Original preservado e efeito inverso criado.

### Rateio

Soma exata.

### Competência e caixa

Resultados diferentes e coerentes.

## 3. Permissões

Testar cada ação com:

- Proprietário.
- Administrador.
- Adulto.
- Membro.
- Filho.
- Usuário de outra família.
- Usuário não autenticado.

## 4. Testes de interface

- Teclado.
- Orientação.
- Fonte ampliada.
- Leitor de tela.
- Tema claro e escuro.
- Telas pequenas.
- Erros de rede.
- Estado vazio.
- Conflito.
- Botão pressionado repetidamente.

## 5. E2E críticos

1. Criar família.
2. Convidar membro.
3. Cadastrar conta.
4. Cadastrar cartão.
5. Criar conta a pagar.
6. Dar baixa parcial.
7. Completar baixa.
8. Registrar compra parcelada.
9. Fechar fatura.
10. Pagar parcialmente.
11. Completar pagamento.
12. Registrar despesa via atalho.
13. Operar offline e sincronizar.
14. Solicitar e aprovar gasto de filho.
15. Exportar relatório.

## 6. Gates

Nenhuma release pode avançar com:

- Teste crítico falhando.
- Falha de RLS.
- Duplicidade conhecida.
- Inconsistência de saldo.
- Crash crítico.
- Migração não testada.


---

<!-- SOURCE: 14-OBSERVABILITY-AND-AUDIT.md -->

# Observabilidade e auditoria

## 1. Telemetria técnica

Registrar:

- Crashes.
- Erros não tratados.
- Latência de tela.
- Latência de API.
- Falhas de banco.
- Falhas de job.
- Falhas de notificação.
- Falhas de upload.
- Conflitos de versão.
- Duplicidades bloqueadas.
- Reconciliações com diferença.

## 2. Eventos de produto

- Família criada.
- Membro convidado.
- Conta criada.
- Despesa criada.
- Conta prevista criada.
- Baixa concluída.
- Lançamento via botão `+`.
- Lançamento via atalho.
- Fatura paga.
- Relatório aberto.
- Exportação solicitada.

Não enviar descrição, estabelecimento, valor exato ou dados pessoais a analytics sem necessidade e consentimento.

## 3. Correlação

Cada requisição deve possuir:

- Request ID.
- User ID quando permitido.
- Household ID quando permitido.
- Idempotency key em operações financeiras.
- Versão do app.
- Plataforma.

## 4. Auditoria

A auditoria é funcional e deve ser consultável por perfis autorizados.

Registrar:

- Entidade.
- Ação.
- Autor.
- Antes.
- Depois.
- Data.
- Origem.
- Motivo.

## 5. Alertas

Criar alertas para:

- Taxa de erro elevada.
- Falha em jobs.
- Crescimento de duplicidades bloqueadas.
- Diferença de reconciliação.
- Falha de migração.
- Aumento de crashes.
- Falha em notificações.
- Falha em storage.

## 6. Runbooks

Documentar resposta para:

- Incidente de autenticação.
- Incidente de RLS.
- Duplicidade.
- Saldo inconsistente.
- Job parado.
- Migração falha.
- Push indisponível.
- Storage indisponível.


---

<!-- SOURCE: 15-DEPLOYMENT-AND-OPERATIONS.md -->

# Implantação e operações

## 1. Ambientes

- Desenvolvimento.
- Homologação.
- Produção.

Cada ambiente deve ter:

- Projeto Supabase separado.
- Segredos separados.
- Storage separado.
- Push separado quando aplicável.
- Dados de teste isolados.

## 2. CI

Em cada pull request:

- Instalação limpa.
- Lint.
- Typecheck.
- Unit tests.
- Integration tests.
- RLS tests.
- Build de validação.
- Verificação de migrações.
- Scan de segredos.

## 3. CD

### Homologação

- Deploy automático após merge.
- Migração controlada.
- Build interno.
- Smoke tests.

### Produção

- Aprovação manual.
- Backup antes da migração.
- Migração.
- Verificação.
- Release gradual.
- Monitoramento.
- Plano de rollback.

## 4. Banco

- Migrações versionadas.
- Roll-forward preferencial.
- Backup automático.
- Teste de restauração.
- Política de retenção.
- Monitoramento de espaço e performance.

## 5. Mobile

- Assinatura iOS.
- Assinatura Android.
- Perfis de provisionamento.
- Build numbers.
- Versionamento semântico.
- Canais internos.
- TestFlight.
- Play Console testing tracks.
- Feature flags quando necessário.

## 6. Configuração

- Variáveis documentadas.
- Validação no startup.
- Nenhum segredo no repositório.
- Rotação de chaves.
- Ambientes reproduzíveis.

## 7. Publicação

Preparar:

- Nome.
- Descrição.
- Screenshots.
- Ícone.
- Splash.
- Política de privacidade.
- Termos.
- Contato de suporte.
- Classificação etária.
- Declarações de coleta de dados.
- Justificativas de permissões.

## 8. Suporte

- Canal de suporte.
- Diagnóstico.
- Exportação de logs não sensíveis.
- Procedimento de revogação.
- Procedimento de recuperação.
- FAQ.


---

<!-- SOURCE: 16-IMPLEMENTATION-PLAN.md -->

# Plano de implementação do produto completo

## Regra

As fases abaixo não reduzem o escopo. O Claude deve concluir uma fase, validar e seguir automaticamente para a seguinte.

## Fase 0 — Fundação

- Monorepo.
- Configuração TypeScript.
- Lint e format.
- CI.
- Ambientes.
- Design tokens.
- Navegação base.
- Autenticação base.
- Banco inicial.
- Observabilidade.
- Test harness.

## Fase 1 — Família e segurança

- Perfis.
- Família.
- Convites.
- Membros.
- Papéis.
- Permissões.
- RLS.
- Sessões.
- Auditoria administrativa.

## Fase 2 — Contas e categorias

- Tabela unificada.
- Contas.
- Cartões.
- Categorias.
- Subcategorias.
- Permissões por conta.
- Saldos.
- Ajustes.
- Arquivamento.

## Fase 3 — Planejamento

- Contas a pagar.
- Contas a receber.
- Calendário.
- Recorrências.
- Parcelamentos.
- Lembretes.
- Anexos.

## Fase 4 — Movimentações

- Despesa.
- Receita.
- Transferência.
- Rateio.
- Busca.
- Filtros.
- Estorno.
- Histórico.

## Fase 5 — Baixas

- Total.
- Parcial.
- Múltiplas.
- Juros.
- Multa.
- Desconto.
- Concorrência.
- Idempotência.
- Estornos.
- Reconciliação.

## Fase 6 — Cartões

- Compras.
- Parcelas.
- Ciclos.
- Faturas.
- Fechamento.
- Pagamento parcial.
- Pagamento total.
- Reembolso.
- Limite.
- Reconciliação.

## Fase 7 — Dashboard e relatórios

- Competência.
- Caixa.
- Previsto versus realizado.
- Categoria.
- Membro.
- Conta.
- Cartão.
- Evolução.
- Exportações.

## Fase 8 — Experiência rápida

- Botão central.
- Formulários rápidos.
- Sugestões.
- Recentes.
- Favoritos.
- Deep links.
- Atalhos.
- Notificações.

## Fase 9 — Supervisão familiar

- Aprovações.
- Limites.
- Visibilidade.
- Alertas.
- Fluxos de filho.
- Histórico.

## Fase 10 — Offline e sincronização

- Cache.
- Outbox.
- Reconciliação.
- Conflitos.
- Feedback de sync.
- Testes de rede.

## Fase 11 — Qualidade e hardening

- Cobertura.
- E2E.
- Acessibilidade.
- Performance.
- Segurança.
- Device testing.
- Recovery.
- Runbooks.

## Fase 12 — Publicação

- Documentos legais.
- Store assets.
- Beta.
- Correções.
- Release.
- Smoke tests.
- Monitoramento.

## Execução de cada fase

1. Ler requisitos relacionados.
2. Atualizar ADRs.
3. Criar ou alterar migrações.
4. Criar contratos.
5. Criar serviços.
6. Criar políticas RLS.
7. Criar testes.
8. Implementar UI.
9. Integrar.
10. Validar critérios de aceite.
11. Documentar.
12. Rodar gates.
13. Corrigir falhas.
14. Registrar progresso.
15. Seguir para a próxima fase.

## Continuidade entre sessões

Ao final de cada sessão, atualizar:

- Fase atual.
- Itens concluídos.
- Itens pendentes.
- Testes falhando.
- Migrações aplicadas.
- Decisões tomadas.
- Próxima ação exata.

Usar um arquivo `PROGRESS.md` no repositório.


---

<!-- SOURCE: 17-ACCEPTANCE-CRITERIA.md -->

# Critérios de aceite

## Família

- Usuário cria família.
- Proprietário convida membros.
- Convite expira.
- Convite não pode ser reutilizado.
- Papel é aplicado.
- Usuário de outra família não acessa dados.

## Conta unificada

**Dado** um administrador cadastrando uma conta  
**Quando** selecionar cartão de crédito  
**Então** o registro é salvo em `accounts`  
**E** campos de cartão são obrigatórios  
**E** campos bancários comuns permanecem disponíveis.

## Baixa parcial

**Dado** uma conta de R$ 1.000,00  
**Quando** for paga em R$ 400,00  
**Então** o status será parcial  
**E** o saldo será R$ 600,00  
**E** apenas R$ 400,00 entrarão no caixa realizado.

## Concorrência

**Dado** saldo em aberto de R$ 600,00  
**Quando** duas requisições tentarem baixar R$ 600,00  
**Então** apenas uma será confirmada  
**E** a outra receberá conflito.

## Idempotência

**Dado** o mesmo comando enviado duas vezes  
**Quando** a chave for igual  
**Então** haverá um único efeito financeiro.

## Transferência

**Dado** origem e destino válidos  
**Quando** transferir um valor  
**Então** origem diminui  
**E** destino aumenta  
**E** não há receita ou despesa.

## Compra no cartão

**Quando** uma compra for registrada  
**Então** a despesa aparece por competência  
**E** a dívida do cartão aumenta  
**E** a conta bancária não muda.

## Pagamento da fatura

**Quando** a fatura for paga  
**Então** a conta bancária diminui  
**E** a dívida do cartão diminui  
**E** não surge nova despesa.

## Parcelamento

**Dado** R$ 100,00 em três parcelas  
**Então** a soma deve ser R$ 100,00  
**E** os centavos restantes devem ser atribuídos de forma determinística.

## Atalho no ícone

**Quando** o usuário pressionar o ícone  
**Então** verá as ações  
**E** ao escolher despesa abrirá o formulário correto  
**E** o fluxo funcionará com o app fechado.

## Permissão infantil

**Dado** um filho  
**Quando** tentar acessar conta restrita  
**Então** o backend negará  
**Mesmo que** a chamada seja feita diretamente.

## Offline

**Dado** uma despesa simples sem conexão  
**Quando** o usuário salvar  
**Então** ela ficará pendente  
**E** será sincronizada depois  
**E** não será duplicada.

## Relatórios

- Totais por categoria conferem com as movimentações.
- Totais por membro conferem com os rateios.
- Competência e caixa apresentam resultados coerentes.
- Estornos deixam de compor os totais.
- Pagamento de fatura não duplica despesa.

## Acessibilidade

- Campos possuem labels.
- Fluxos funcionam com leitor de tela.
- Fonte ampliada não impede conclusão.
- Status não depende só de cor.

## Release

- iOS e Android aprovados nos testes.
- Sem defeitos críticos.
- Migrações testadas.
- RLS testada.
- Observabilidade ativa.
- Backup e restauração testados.


---

<!-- SOURCE: 18-CLAUDE-DESIGN-PROMPT.md -->

# Prompt mestre para Claude Design

Atue como Product Designer principal, UX Architect e Design System Lead.

Leia todos os arquivos deste pacote antes de começar.

O objetivo não é criar um conceito, demonstração ou MVP. O objetivo é especificar o produto completo descrito no PRD, com todos os fluxos, estados, permissões e regras financeiras necessários para implementação em iOS e Android.

## Regras de trabalho

1. Não reduza o escopo.
2. Não omita telas complexas.
3. Não substitua fluxos por observações genéricas.
4. Não crie somente happy paths.
5. Não use apenas cores para status.
6. Não use linguagem contábil desnecessária.
7. Priorize velocidade e uso com uma mão.
8. Considere adultos, cônjuges, filhos e permissões.
9. Considere competência e caixa.
10. Considere baixa parcial, faturas e estornos.
11. Documente decisões e inconsistências.
12. Continue trabalhando por módulos até cobrir todo o produto.

## Entregáveis obrigatórios

- Arquitetura da informação.
- Sitemap.
- Fluxos.
- Wireframes.
- Alta fidelidade.
- Protótipo.
- Design system.
- Tokens.
- Componentes.
- Variantes.
- Estados.
- Conteúdo.
- Acessibilidade.
- Especificação para desenvolvimento.
- Assets necessários.
- Lista de telas.
- Matriz de permissões.
- Matriz de estados.
- Anotações de comportamento.

## Fluxos obrigatórios

- Cadastro e login.
- Criação da família.
- Convite e aceite.
- Permissões.
- Conta bancária.
- Cartão.
- Conta a pagar.
- Conta a receber.
- Baixa total.
- Baixa parcial.
- Estorno.
- Despesa realizada.
- Receita realizada.
- Transferência.
- Compra no cartão.
- Compra parcelada.
- Fatura.
- Pagamento parcial da fatura.
- Pagamento total.
- Reembolso.
- Recorrência.
- Rateio.
- Relatórios.
- Exportação.
- Aprovação de filho.
- Lançamento rápido.
- Atalho do ícone.
- Notificações.
- Offline.
- Conflito de sincronização.
- Arquivamento.
- Ajuste de saldo.

## Processo

Para cada módulo:

1. Descrever o objetivo.
2. Listar personas e permissões.
3. Mapear entradas.
4. Mapear passos.
5. Mapear decisões.
6. Mapear erros.
7. Mapear estados vazios.
8. Mapear confirmação.
9. Mapear retorno.
10. Criar componentes.
11. Anotar regras de negócio.
12. Validar acessibilidade.
13. Validar uso com uma mão.
14. Validar consistência com os demais módulos.

## Regra de encerramento

Não considere o design concluído enquanto existir tela, estado, permissão ou fluxo do PRD sem especificação visual e comportamental.

Ao terminar um módulo, avance automaticamente para o seguinte.

Quando houver ambiguidade não bloqueante, escolha a solução mais simples, registre a decisão em `21-DECISIONS-AND-ASSUMPTIONS.md` e continue.


---

<!-- SOURCE: 19-CLAUDE-CODE-PROMPT.md -->

# Prompt mestre para Claude Code

Atue como Staff Software Engineer, Mobile Architect, Backend Architect, Database Engineer, Security Engineer, QA Lead e DevOps Engineer.

Leia todos os arquivos deste pacote antes de alterar código.

O objetivo é entregar o sistema completo. Não criar MVP, protótipo descartável, mock permanente ou implementação parcial.

## Mandato

Implemente, teste, documente, configure e prepare para publicação tudo que estiver definido.

Trabalhe por fases para controlar risco, mas prossiga automaticamente até concluir todo o escopo.

Não pare após autenticação, dashboard, lançamento básico ou primeira versão funcional.

## Regras obrigatórias

1. Valores monetários em inteiros.
2. Contas bancárias e cartões em `accounts`.
3. `household_id` em dados familiares.
4. RLS.
5. Backend como autoridade.
6. Operações financeiras atômicas.
7. Idempotência.
8. Concorrência controlada.
9. Pagamento de fatura não é despesa.
10. Transferência não é receita nem despesa.
11. Correções por estorno.
12. Movimentação postada não é excluída.
13. Regras no domínio, não na UI.
14. Migrações versionadas.
15. Testes para regras financeiras.
16. Estados de loading, erro, vazio e offline.
17. Acessibilidade.
18. iOS e Android.
19. Segurança de storage e anexos.
20. Observabilidade e auditoria.
21. CI/CD.
22. Documentação.
23. Nenhum botão sem implementação.
24. Nenhum TODO crítico no produto final.

## Processo contínuo

Para cada fase:

1. Ler os requisitos.
2. Identificar invariantes.
3. Atualizar decisões.
4. Criar testes de falha.
5. Criar migrações.
6. Criar constraints.
7. Criar RLS.
8. Criar contratos.
9. Implementar serviços.
10. Implementar interface.
11. Integrar.
12. Rodar lint.
13. Rodar typecheck.
14. Rodar testes.
15. Corrigir.
16. Atualizar documentação.
17. Atualizar `PROGRESS.md`.
18. Avançar.

## Autonomia

Não pedir confirmação para:

- Estrutura de pasta.
- Nomes técnicos razoáveis.
- Escolhas reversíveis.
- Pequenos detalhes de UI já cobertos pelo design.
- Bibliotecas equivalentes compatíveis.

Escolha a alternativa mais simples e robusta, registre e continue.

## Bloqueios

Só interrompa por:

- Segredo externo indispensável.
- Conta de loja.
- Decisão legal.
- Custo externo.
- Operação irreversível em produção.
- Contradição que ameace integridade financeira.

Mesmo assim, conclua todo o restante possível.

## Verificação final

Antes de declarar pronto:

- Conferir `03-SCOPE-AND-DEFINITION-OF-DONE.md`.
- Conferir `17-ACCEPTANCE-CRITERIA.md`.
- Conferir `22-RELEASE-CHECKLIST.md`.
- Rodar todos os testes.
- Executar smoke tests em iOS e Android.
- Confirmar RLS.
- Confirmar backups.
- Confirmar observabilidade.
- Confirmar publicação ou documentar exclusivamente os bloqueios externos.

## Continuidade

Se a sessão terminar, registre a próxima ação exata em `PROGRESS.md`.

Na próxima sessão, leia `PROGRESS.md`, valide o estado real do repositório e continue sem reiniciar o planejamento.


---

<!-- SOURCE: 20-CLAUDE.md -->

# CLAUDE.md

## Project

Aplicativo completo de gestão financeira familiar para iOS e Android.

## Source of truth

Leia os arquivos em `docs/` na ordem definida em `00-README.md`.

O produto não é um MVP. Fases são apenas uma estratégia de implementação.

## Language

- Código, nomes técnicos e commits: inglês.
- Interface: português do Brasil.
- Documentação funcional: português do Brasil.

## Architecture

- React Native.
- TypeScript strict.
- Expo Router.
- Supabase.
- PostgreSQL.
- Row Level Security.
- Feature-based architecture.
- Domain services for financial rules.
- Server-authoritative permissions and consistency.

## Financial invariants

- Store money in integer minor units.
- Never use floating point for money.
- Bank accounts and credit cards share `accounts`.
- Card payment is not an expense.
- Transfer is not income or expense.
- Partial settlement preserves outstanding balance.
- Posted financial records are reversed, not deleted.
- Financial commands require idempotency.
- Settlement, transfer and card payment are atomic.
- Prevent over-settlement with transactional concurrency control.
- Allocation totals must equal transaction totals.
- Reports must distinguish accrual and cash.

## Security

- Every family-owned row has `household_id`.
- Apply RLS.
- Never trust role or household from the client.
- Validate account access on the server.
- Never expose secrets in mobile code.
- Do not store full card numbers, CVV or banking credentials.
- Protect attachments with private storage.
- Audit sensitive actions.

## Workflow

Before coding:

1. Read relevant docs.
2. Check `PROGRESS.md`.
3. Identify rules and affected tables.
4. Add or update tests.
5. Implement a complete vertical slice.
6. Run quality gates.
7. Update documentation and progress.
8. Continue to the next task.

## Quality gates

- Lint.
- Typecheck.
- Unit tests.
- Integration tests.
- RLS tests.
- E2E for critical flows.
- Loading, empty, error and offline states.
- Accessibility labels.
- No known duplication.
- No known balance inconsistency.
- No critical TODO.

## Completion

Do not stop at a usable first version.

The project is complete only when the full definition of done and release checklist are satisfied.

## Progress file

Maintain `PROGRESS.md` with:

- Current phase.
- Completed items.
- Pending items.
- Failing tests.
- Applied migrations.
- Decisions.
- Blockers.
- Exact next action.


---

<!-- SOURCE: 21-DECISIONS-AND-ASSUMPTIONS.md -->

# Decisões e premissas

## Confirmadas

- Produto completo, não MVP.
- iOS e Android.
- Português do Brasil.
- BRL.
- Fuso padrão `America/Bahia`.
- Família compartilhada.
- Perfis diferentes.
- Filhos podem ter supervisão.
- Cartão na mesma tabela de contas.
- Baixa total e parcial.
- Competência e caixa.
- Compra e fatura sem dupla contabilização.
- Botão central `+`.
- Atalhos no ícone.
- React Native e TypeScript.
- Supabase e PostgreSQL.
- RLS.
- Valores em centavos.
- Estorno em vez de exclusão.

## Premissas adotadas

- Um usuário pode participar de mais de uma família.
- A família pode possuir múltiplos administradores.
- Uma conta pode ser compartilhada ou restrita.
- Relatórios respeitam visibilidade.
- Operações simples podem ser enfileiradas offline.
- Operações críticas exigem conexão.
- Anexos fazem parte do produto completo.
- Exportação CSV e PDF fazem parte do produto.
- Open Finance não faz parte desta primeira definição, mas a arquitetura não deve impedir implementação futura.
- Investimentos complexos não fazem parte desta definição.
- Múltiplas moedas ficam preparadas arquiteturalmente, porém a primeira localização usa BRL.

## Decisões que exigem validação humana antes de produção

- Nome comercial.
- Identidade visual final.
- Política de privacidade.
- Termos de uso.
- Modelo de cobrança.
- Conta Apple Developer.
- Conta Google Play Console.
- Provedor de e-mail.
- Provedor de push.
- Domínio.
- Canal de suporte.
- Regras jurídicas relacionadas a dados de menores.

## Registro de novas decisões

Adicionar entradas no formato:

```text
Data:
Decisão:
Contexto:
Alternativas:
Motivo:
Impacto:
Responsável:
```


---

<!-- SOURCE: 22-RELEASE-CHECKLIST.md -->

# Checklist final de release

## Produto

- [ ] Todos os módulos do PRD implementados.
- [ ] Todos os critérios de aceite validados.
- [ ] Todos os fluxos principais concluídos.
- [ ] Nenhum botão sem ação.
- [ ] Nenhum mock permanente.
- [ ] Nenhum TODO crítico.

## Design

- [ ] Design system completo.
- [ ] Tema claro.
- [ ] Tema escuro.
- [ ] Estados de loading.
- [ ] Estados vazios.
- [ ] Estados de erro.
- [ ] Estados offline.
- [ ] Estados sem permissão.
- [ ] Acessibilidade revisada.
- [ ] Copy revisada.

## Mobile

- [ ] iOS build.
- [ ] Android build.
- [ ] Deep links.
- [ ] Atalhos.
- [ ] Push.
- [ ] Upload.
- [ ] Cache.
- [ ] Offline.
- [ ] Sincronização.
- [ ] Biometria opcional.
- [ ] Sem segredos no bundle.

## Backend

- [ ] Migrações.
- [ ] Constraints.
- [ ] Índices.
- [ ] RLS.
- [ ] Storage.
- [ ] Edge Functions.
- [ ] Jobs.
- [ ] Auditoria.
- [ ] Backup.
- [ ] Restore testado.

## Financeiro

- [ ] Baixa total.
- [ ] Baixa parcial.
- [ ] Concorrência.
- [ ] Idempotência.
- [ ] Transferência.
- [ ] Compra no cartão.
- [ ] Parcelamento.
- [ ] Fatura.
- [ ] Pagamento parcial.
- [ ] Pagamento total.
- [ ] Reembolso.
- [ ] Estorno.
- [ ] Competência.
- [ ] Caixa.
- [ ] Rateio.
- [ ] Reconciliação.

## Segurança

- [ ] Autorização no servidor.
- [ ] RLS por papel.
- [ ] Isolamento entre famílias.
- [ ] Storage privado.
- [ ] Sessões revogáveis.
- [ ] Scan de segredos.
- [ ] Teste de acesso direto.
- [ ] Política de privacidade.
- [ ] Dados de menores revisados.

## Testes

- [ ] Lint.
- [ ] Typecheck.
- [ ] Unitários.
- [ ] Integração.
- [ ] RLS.
- [ ] E2E.
- [ ] Acessibilidade.
- [ ] Performance.
- [ ] Dispositivos reais.
- [ ] Rede instável.
- [ ] Offline.
- [ ] Migração.
- [ ] Rollback ou roll-forward testado.

## Operações

- [ ] Development.
- [ ] Staging.
- [ ] Production.
- [ ] CI.
- [ ] CD.
- [ ] Monitoramento.
- [ ] Alertas.
- [ ] Runbooks.
- [ ] Suporte.
- [ ] Analytics com privacidade.

## Lojas

- [ ] Nome.
- [ ] Ícone.
- [ ] Splash.
- [ ] Screenshots.
- [ ] Descrição.
- [ ] Classificação.
- [ ] Permissões.
- [ ] Política de privacidade.
- [ ] Termos.
- [ ] Contato.
- [ ] TestFlight.
- [ ] Play testing.
- [ ] Aprovação.
- [ ] Smoke test pós-release.

## Encerramento

Somente marcar o projeto como pronto quando todos os itens aplicáveis estiverem concluídos ou quando um item externo estiver explicitamente documentado como bloqueio de responsabilidade humana.


---

<!-- SOURCE: 23-PROGRESS-TEMPLATE.md -->

# PROGRESS.md

## Status geral

- Fase atual:
- Última atualização:
- Responsável:

## Concluído

- 

## Em andamento

- 

## Pendente

- 

## Testes falhando

- 

## Migrações aplicadas

- 

## Decisões recentes

- 

## Bloqueios

- 

## Próxima ação exata

-
