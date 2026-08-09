# 22 — Runbooks de operação (docs/15 §3–§8)

Procedimentos para quem estiver de plantão. Cada um começa pelo sintoma, porque
é o que a pessoa tem na mão às três da manhã — não o nome da causa.

Convenções: `$AMB` é `dev`, `hml` ou `prod`. Todo comando destrutivo aparece com
o passo de verificação ANTES dele. Nenhum runbook pede segredo em texto claro no
terminal; use o gerenciador de segredos do ambiente.

---

## 1. Backup e restauração

### Backup automático

O Postgres de produção roda `pg_dump` completo diário e WAL contínuo. O dump
diário vai para o bucket de backup com retenção de 30 dias; o WAL, 7 dias.

Um backup que nunca foi restaurado não é backup. **A restauração é testada
mensalmente** contra um banco descartável, e o teste falha se o número de
famílias, contas e movimentações não bater com o de origem.

```bash
# 1. Confirmar QUAL dump vai ser restaurado antes de tocar em qualquer coisa.
aws s3 ls s3://$BUCKET/postgres/$AMB/ | tail -5

# 2. Restaurar num banco novo — nunca por cima do existente.
createdb family_finance_restore_test
pg_restore --dbname=family_finance_restore_test --jobs=4 dump-AAAA-MM-DD.dump

# 3. Conferir contagens contra a origem.
psql family_finance_restore_test -c "
  SELECT (SELECT count(*) FROM households)   AS familias,
         (SELECT count(*) FROM accounts)     AS contas,
         (SELECT count(*) FROM transactions) AS movimentacoes;"
```

### Restauração em produção (perda de dados confirmada)

1. **Parar a API** antes de restaurar. Escrita concorrente durante restauração
   produz um estado que nenhum backup descreve.
2. Restaurar num banco NOVO (passo acima), não por cima.
3. Conferir as contagens e uma amostra de saldos: `SELECT app.account_balance(id)`
   em algumas contas conhecidas.
4. Só então apontar a API para o banco restaurado.
5. Registrar em auditoria o intervalo perdido, se houver.

---

## 2. Migração de banco

Roll-forward é preferencial: uma migração nova que corrige, em vez de desfazer a
anterior. `Down` existe para desenvolvimento; em produção, reverter schema com
dados em cima é como desfazer uma soma sem saber as parcelas.

```bash
# Produção: backup ANTES, sempre.
pg_dump --format=custom --file=pre-migracao-$(date +%F).dump "$DATABASE_URL"

# Aplicar
npm run db:migrate

# Verificar: nenhuma migração pendente e a mais nova registrada
psql "$DATABASE_URL" -c "SELECT name, run_on FROM schema_migrations ORDER BY run_on DESC LIMIT 5;"
```

Se a migração falhar no meio: o node-pg-migrate roda cada arquivo em transação,
então ou passou inteiro ou não passou. Corrija o SQL e rode de novo; não edite
`schema_migrations` à mão.

---

## 3. Revogação de acesso (docs/15 §8)

### Uma sessão específica

A pessoa faz sozinha em **Família › Dispositivos e sessões**. Suporte não precisa
entrar no banco para isso.

### Todas as sessões de uma pessoa (suspeita de conta comprometida)

O caminho suportado é a própria pessoa **redefinir a senha**: a redefinição
derruba todos os aparelhos, por construção (`revokeAllDevices`). Isso é melhor
do que um comando de suporte, porque devolve o controle a quem é dono da conta.

Quando ela não tem acesso ao e-mail:

```sql
-- Verificar o que vai cair, ANTES.
SELECT id, name, platform, last_seen_at FROM devices
 WHERE user_id = $1 AND revoked_at IS NULL;

UPDATE devices
   SET revoked_at = now(), revoked_reason = 'SUPPORT_REVOKE', refresh_token_hash = NULL
 WHERE user_id = $1 AND revoked_at IS NULL;
```

Registre o chamado na auditoria com o motivo. Revogação sem rastro vira suspeita
depois.

### Membro removido da família

Remover o membro já corta o acesso aos dados da família pela RLS na requisição
seguinte — não é preciso revogar sessão. O access token continua válido até 15
minutos, mas não enxerga mais nenhuma linha daquela família.

---

## 4. Recuperação de acesso (docs/15 §8)

| Situação | Caminho |
| --- | --- |
| Esqueceu a senha | "Esqueci a senha" na tela de login → link de 60 min → senha nova. Derruba as outras sessões. |
| Perdeu o acesso ao e-mail | Não há caminho automático, e isso é deliberado: um suporte capaz de trocar o e-mail de uma conta é um suporte capaz de tomar a conta. Exige confirmação de identidade fora do app e registro em auditoria. |
| Proprietário saiu da família | Transferir a propriedade (`POST /households/:id/transfer-ownership`) por outro Proprietário. Não existe família sem dono. |
| Convite expirado | Revogar o pendente e convidar de novo; o convite é nominal e de uso único. |

---

## 5. Diagnóstico de incidente

Todo log carrega `request_id`, e o mesmo `request_id` volta ao cliente no
cabeçalho `x-request-id`. É por ele que se liga a reclamação ao log e à linha de
auditoria.

```bash
# A partir do request_id que a pessoa mandou no print:
grep '"reqId":"<uuid>"' /var/log/family-finance/api.log | jq .

# Efeitos financeiros daquele pedido:
psql "$DATABASE_URL" -c "SELECT * FROM audit_logs WHERE request_id = '<uuid>';"
```

**Duplicidade suspeita.** Antes de concluir que houve cobrança em dobro, procure
a chave de idempotência: duas linhas com a mesma chave são impossíveis (índice
único). Duas movimentações iguais com chaves DIFERENTES são dois comandos de
verdade — quase sempre toque duplo em tela sem guarda, o que é defeito de UI, não
de servidor.

```sql
SELECT idempotency_key, count(*) FROM transactions
 WHERE household_id = $1 GROUP BY 1 HAVING count(*) > 1;  -- deve vir vazio
```

**Saldo que "não bate".** O saldo é derivado, nunca guardado. Reconcilie:

```sql
SELECT a.name, a.opening_balance_minor, app.account_balance(a.id) AS saldo
  FROM accounts a WHERE a.household_id = $1;
```

Se o valor derivado estiver certo e a tela errada, o problema é cache do app —
peça para a pessoa puxar a lista para baixo, ou saia e entre na conta (o logout
apaga o cache local).

---

## 6. Exportação de logs não sensíveis (docs/15 §8)

Os logs já nascem sem PII: sem e-mail, sem token, sem valor. O que sai para um
chamado é `request_id`, rota, status, código de erro e duração.

```bash
jq 'select(.reqId=="<uuid>") | {time, reqId, msg, code, url, statusCode, responseTime}' api.log
```

Nunca anexe `audit_logs` cru a um chamado: ele contém antes/depois de valores
financeiros.

---

## 7. Fila de sincronização parada no aparelho

Sintoma: a faixa "◌ Aguardando sincronização" não some.

1. **"Requer atenção"** significa que o servidor RECUSOU o lançamento (conta
   arquivada, permissão retirada, dado inválido). Não adianta tentar de novo — a
   pessoa precisa corrigir ou descartar o item.
2. Sem "requer atenção", é rede. O envio acontece sozinho ao voltar do segundo
   plano ou na primeira requisição que funcionar.
3. Reinstalar o app **apaga a fila**. Antes de sugerir isso, confirme que não há
   lançamento pendente — ele não existe em nenhum outro lugar.

---

## 8. Rotação de segredos (docs/15 §6)

| Segredo | Efeito da rotação |
| --- | --- |
| `JWT_SECRET` | Todos os access tokens em circulação param de valer. O refresh continua funcionando, então a maioria das pessoas nem percebe: o app renova sozinho. |
| Senha do `ff_app` | Trocar no banco e no ambiente na MESMA janela; a API valida a conexão no startup e recusa subir sem ela. |
| Chave do provedor de e-mail | Sem efeito em sessão. Só para convite e recuperação de acesso enquanto estiver inválida. |

Depois de qualquer rotação: `curl -sf $API/health` precisa devolver
`{"status":"ok"}` com `checks.database = "ok"`.
