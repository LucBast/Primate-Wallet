# 23 — Ficha das lojas (docs/15 §7)

Tudo que App Store Connect e Play Console pedem, escrito uma vez, para as duas
lojas não divergirem. Marcadores `«…»` dependem de conta de loja ou de decisão
humana e estão listados no fim.

---

## Identidade

| Campo | Valor |
| --- | --- |
| Nome | Family Finance |
| Subtítulo (iOS, 30 caracteres) | As finanças da família |
| Nome curto (Android, 30) | Family Finance |
| Bundle ID / applicationId | `com.familyfinance` |
| Categoria primária | Finanças |
| Categoria secundária | Produtividade |
| Idioma primário | Português (Brasil) |
| Versão | 1.0.0 |
| Modelo de negócio | Gratuito, sem anúncios, sem compras no app |

## Descrição curta (Android, 80 caracteres)

> As contas da casa organizadas, com a família toda no mesmo lugar.

## Descrição completa

> **As finanças da família, num lugar só.**
>
> O Family Finance junta num app o que costuma viver espalhado em planilhas,
> aplicativos de banco e recados na geladeira: as contas a pagar do mês, o que
> já foi pago, as faturas dos cartões e quem gastou o quê.
>
> **Feito para mais de uma pessoa.** Cada membro tem seu papel e suas
> permissões. Você decide quais contas cada um enxerga — e quem só registra sem
> poder alterar.
>
> **Para os filhos, com supervisão de verdade.** Um gasto acima do valor que
> você definir fica aguardando aprovação e não mexe em nada até você decidir.
>
> **Contas e cartões no mesmo lugar.** Compra parcelada entra na fatura certa,
> parcela por parcela. Pagar a fatura não vira uma despesa nova — porque a
> despesa já foi a compra.
>
> **Funciona quando a internet não funciona.** Registre a despesa na fila do
> mercado; o app guarda no aparelho e envia sozinho quando a conexão voltar,
> sem risco de lançar duas vezes.
>
> **Nada de conta de banco.** O Family Finance não se conecta ao seu banco, não
> pede senha bancária e não guarda número de cartão. O que entra é o que você
> registra.
>
> • Contas a pagar e a receber, com baixa parcial e status derivado
> • Cartões, faturas e limite disponível
> • Lançamento rápido em menos de dez segundos
> • Relatórios por categoria, membro, conta e evolução
> • Exportação em CSV, sempre que você quiser
> • Tema claro e escuro
> • Português do Brasil, valores em real

## Palavras-chave (iOS, 100 caracteres)

`finanças,família,contas,cartão,fatura,orçamento,despesas,gastos,planilha,casa`

## Classificação etária

| Loja | Classificação | Justificativa |
| --- | --- | --- |
| App Store | 4+ | Sem conteúdo sensível, sem anúncios, sem compras, sem conteúdo gerado por terceiros exposto publicamente |
| Play Console (ClassInd) | Livre | Idem |

Perguntas do questionário que costumam confundir, com a resposta correta:

- **Interação entre usuários?** Sim, restrita: só membros da mesma família,
  convidados nominalmente por e-mail. Não há chat, feed nem perfil público.
- **Conteúdo gerado por usuário visível a estranhos?** Não.
- **Compras digitais?** Não.
- **Publicidade?** Não.

## Declarações de coleta de dados

Vale para o "App Privacy" (Apple) e o "Data safety" (Google). Cada linha foi
conferida contra o código.

| Dado | Coletado | Ligado à identidade | Usado para rastrear | Finalidade |
| --- | --- | --- | --- | --- |
| E-mail | Sim | Sim | **Não** | Autenticação, convite, recuperação de acesso |
| Nome | Sim | Sim | **Não** | Identificar a pessoa dentro da família |
| Informação financeira que o usuário digita | Sim | Sim | **Não** | Funcionalidade do app |
| Identificador do aparelho (instalação) | Sim | Sim | **Não** | Gerenciar e revogar sessões |
| Diagnóstico de falhas | Sim | Não | **Não** | Estabilidade |
| Localização | **Não** | — | — | — |
| Contatos | **Não** | — | — | — |
| Publicidade / identificador de anúncios | **Não** | — | — | — |
| Histórico de navegação ou de busca fora do app | **Não** | — | — | — |

**Rastreamento entre apps: nenhum.** O app não usa o AppTrackingTransparency
porque não há o que pedir — não existe rastreamento.

**Dados podem ser excluídos:** sim, pelo suporte e por exclusão de conta.
**Dados são criptografados em trânsito:** sim.

## Justificativas de permissão

| Permissão | Plataforma | Por quê | Quando é pedida |
| --- | --- | --- | --- |
| `INTERNET` | Android | Falar com o servidor | Não pede diálogo |
| `POST_NOTIFICATIONS` | Android 13+ | Avisar de vencimento e fatura | Só se a pessoa ligar notificações |
| Notificações | iOS | Idem | Idem |
| Face ID / Touch ID | iOS | Bloqueio local **opcional** do app | Só se a pessoa ligar em Segurança |
| Biometria | Android | Idem | Idem |
| Câmera / fotos | Ambas | Anexar comprovante a um lançamento | Só ao tocar em "Anexar" |

O app **não** pede localização, contatos, microfone, calendário nem
armazenamento amplo. O `NSLocationWhenInUseUsageDescription` que vinha do
template do React Native foi **removido do `Info.plist`** nesta fase: declarar
permissão que não se usa é motivo de recusa na App Store, e a chave estava lá
com valor vazio desde a Fase 0.

## Textos obrigatórios de suporte

| Campo | Valor |
| --- | --- |
| URL de suporte | «https://…/suporte» |
| E-mail de suporte | «suporte@…» |
| URL da política de privacidade | «https://…/privacidade» (conteúdo em `docs/legal/POLITICA-DE-PRIVACIDADE.md`) |
| URL dos termos | «https://…/termos» (conteúdo em `docs/legal/TERMOS-DE-USO.md`) |
| URL de marketing | «https://…» |

## Assets

| Asset | Especificação | Estado |
| --- | --- | --- |
| Ícone | 1024×1024 sem transparência e sem cantos arredondados | «a produzir a partir do quadrado brand com "F" da tela 6a» |
| Splash | Fundo `surface`, logo centralizado | Implementado no app |
| Screenshots iOS | 6,7" e 5,5", 3 a 10 imagens | «capturar em simulador» |
| Screenshots Android | Telefone, 2 a 8 imagens | «capturar no emulador em 1170×2532» |

Ordem sugerida das capturas, que conta uma história em vez de listar telas:
início (1b) → planejamento com uma conta vencida (1d) → baixa parcial (1e) →
fatura do cartão (1f) → lançamento rápido (1c) → aprovação do filho (3c) →
relatórios (4a).

## Testes de loja

- **TestFlight:** grupo interno com «n» pessoas; ciclo de uma semana.
- **Play Console:** faixa de teste interno, depois fechado.
- **Smoke test pós-release:** `npm run smoke --workspace @ff/api` apontando para
  produção. Sem `SMOKE_ALLOW_PROD=1` ele só verifica saúde, o que já pega a
  maioria das falhas de implantação.

---

## Bloqueios de responsabilidade humana

Nenhum destes pode ser resolvido por código:

1. Contas de loja (App Store Connect, Play Console) e certificados de assinatura.
2. Revisão jurídica da política de privacidade e dos termos.
3. Domínio e páginas públicas de privacidade, termos e suporte.
4. Ícone e screenshots finais aprovados pelo design.
5. Provedor de e-mail transacional, bucket de anexos, DSN do Sentry, FCM/APNs.
6. Preenchimento dos questionários de classificação etária nas duas lojas.
