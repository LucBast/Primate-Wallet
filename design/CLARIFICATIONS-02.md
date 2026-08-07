# CLARIFICATIONS-02 — item 5 (7 telas), item 6 (a/b/c) e a decisão do ícone de categoria

Copy em pt-BR abaixo é **final** — copiar verbatim. Nenhuma tela deste turno
introduz componente ou token novo.

---

## 1. As 7 telas — Turno 8

Screenshots a 390×844 dp com a moldura de 1px (arquivo 392×846), em
`screenshots/`. Os parágrafos correspondentes já estão no `SCREEN-SPECS.md`,
seção "Turno 8".

| # | Arquivo | Tela |
|---|---|---|
| 1 | `8a-criacao-familia.png` | Criação de família |
| 2 | `8b-convite-membro.png` | Convite de membro (quem envia) |
| 3 | `8c-dispositivos-sessoes.png` | Dispositivos e sessões |
| 4 | `8d-categorias.png` | Gestão de categorias |
| 5 | `8e-transferencia.png` | Transferência entre contas |
| 6 | `8f-detalhe-movimentacao.png` | Detalhe de movimentação |
| 7 | `8g-detalhe-conta-prevista.png` | Detalhe de conta prevista |

Nenhuma delas muda de layout no tema escuro — vale a regra global de troca 1:1
dos tokens. Nenhum estilo de `type` novo: todas usam os estilos já publicados.

### O que muda em relação ao que está implementado

**8a — Criação de família.** Os quatro campos que você listou estão certos e são
os únicos. Duas coisas de superfície, sem campo novo: o card "Seu papel" é
informativo (o papel é derivado, não escolhido), e o link "Tenho um convite para
aceitar" no rodapé leva para 6b — quem chega por convite não pode ficar preso
nesta tela.

**8b — Convite de membro.** Campos iguais aos seus. Duas correções de
comportamento:
- O chip de papel é **Filho**, e "supervisionado" é o toggle — não são dois
  papéis diferentes. O rótulo completo "Filho supervisionado" só aparece quando
  papel = Filho **e** supervisionado = true (é assim que 3a e 3b já exibem).
- "Valor limite" só existe com o modo **acima de um valor**; nos modos
  *nunca* e *sempre* a linha some (não fica desabilitada).
- O card "Prévia do convite" é texto derivado dos campos, não persistido.

**8c — Dispositivos e sessões.** Igual ao seu contrato, com dois acréscimos que
não são campos novos: a **sessão atual** aparece separada, com chip `● Atual` e
sem botão Revogar (revogar a própria sessão é "Sair da conta", em outro lugar);
sessão com último acesso > 30 dias ganha a linha `◌ Inativa há mais de 30 dias`
— derivada de `last_seen_at`, não armazenada. O botão "Revogar todas as outras
sessões" é conveniência sobre o mesmo endpoint, em lote.

**8d — Gestão de categorias.** Ver item 3 abaixo (escolha de ícone). O resto
confirma: dois níveis, criar/renomear/arquivar, nunca excluir, categorias do
sistema imutáveis. Arquivada aparece na própria lista (line-through + `◌
Arquivada`) e tem "Reativar" — não é uma seção escondida.

**8e — Transferência.** Campos iguais aos seus. O que a tela precisa deixar
explícito e o design resolve com três recursos, sem campo novo: o MoneyInput da
transferência é **neutro** (nunca income/expense), o par De/Para vem num único
card com os saldos atuais, e o banner nomeia a regra. A tarifa é uma despesa
separada — no extrato aparecem dois registros, não um.

**8f — Detalhe de movimentação.** Campos iguais. O rateio mostra %, valor por
membro e a linha de fechamento `✓ Soma dos rateios = total`; se não fechar, o
servidor recusa (o cliente não arredonda por conta própria). O estorno pede
motivo no próprio card, antes do botão — não em diálogo separado.

**8g — Detalhe de conta prevista.** Confirmado exatamente como você
implementou: card de valores, barra, linha de status, card de campos, CTA "Dar
baixa", bloco CANCELAR com motivo obrigatório e banner. **Acrescentei os dois
blocos que faltavam**, entre o CTA e o bloco CANCELAR:
- **Histórico de baixas** — mesma row da 1e; baixa estornada aparece
  line-through com `● Estornada` + motivo e **não conta no "Já pago"**.
- **Anexos** — chip por arquivo (badge do formato, nome, tamanho) + área
  tracejada "+ Foto"; ação "+ Adicionar" no cabeçalho do card.

---

## 2. Item 6 — as três respostas

**a) Ícone do card de biometria (6a)**

    fingerprint · color: brand (#146E64) · background: brandSoft (#E3EFEC)

Mesmo formato dos outros: quadrado 34, raio 12, ícone 18. `fingerprint` cobre
Face ID e digital — não trocar por `scan-face` em iOS: o card é sobre o
recurso, não sobre o sensor.

**b) Estado do toggle de biometria na tela de login**

**Desligado.** Está certo o que você implementou; o screenshot é que estava
errado — **`6a-login.png` foi regerado** com o toggle desligado e com o ícone
definitivo. Antes de existir sessão não há chave para proteger, então o controle
aparece desligado e é informativo; a ativação real acontece em Segurança, depois
do login, como o próprio texto do card diz.

**c) Rótulos de papel — neutros**

Não existe campo de gênero e não deve passar a existir. Os rótulos são
**neutros e invariáveis**, exatamente estes cinco:

    Proprietário · Administrador · Adulto · Membro · Filho

Com uma regra de exibição: quando papel = `Filho` e `supervised = true`, o
rótulo exibido é **"Filho supervisionado"** — derivado, não um sexto papel.

**`3a-familia.png` foi regerado** trocando "Administradora" por "Administrador".
Nenhum outro screenshot usava forma flexionada.

---

## 3. A pergunta cara: ícone de categoria é escolhível?

**Sim — mas só nas categorias criadas pela família, e com custo mínimo de
contrato.**

Dois campos **opcionais** em `categories`:

    icon_key   text NULL   -- nome lucide, do conjunto curado
    color_key  text NULL   -- nome do token, não hex

Regra de resolução, nesta ordem:
1. `icon_key` / `color_key` preenchidos → usa esses;
2. nulos → cai no mapa por nome do CLARIFICATIONS-01 item 3;
3. sem correspondência no mapa → `circle-dashed` · `textSecondary` ·
   `surfaceMuted`.

Categorias do sistema têm `icon_key` e `color_key` **sempre nulos e não
editáveis** — o mapa continua sendo a única fonte para elas, então nada do item 3
muda.

O seletor é o que está na 8d: grade de ícones do conjunto curado (30 no total,
os 6 primeiros + "+24" abrem a grade completa) e 6 swatches de cor, ambos
tokens — nunca color picker livre, nunca ícone arbitrário. Guardar o **nome do
token** e não o hex é o que faz o tema escuro continuar funcionando sozinho.

Se preferir adiar: mantenha as duas colunas nulas em toda a Fase 0 e esconda o
card "Editar" da 8d. O contrato já fica pronto, e ligar o seletor depois não
mexe em banco.

---

## 4. Tokens

Nenhum estilo de `type` novo neste turno. Nenhum token de cor novo. Todos os
tamanhos vêm dos estilos já existentes com `lineHeight` obrigatório.
