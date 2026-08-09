> **MINUTA — EXIGE REVISÃO JURÍDICA ANTES DA PUBLICAÇÃO.**
> Este texto descreve com precisão o que o software faz hoje: cada afirmação
> abaixo foi conferida contra o código, o schema e as políticas de RLS. O que
> ele **não** é: uma peça jurídica revisada. Nomes do controlador, endereço,
> encarregado (DPO), base legal por finalidade e prazos de retenção precisam
> ser preenchidos e validados por advogado antes de ir a qualquer loja.
> Marcadores `«…»` são os campos que faltam.

# Política de Privacidade — Family Finance

**Última atualização:** «data» · **Versão:** 1.0

## 1. Quem trata seus dados

O aplicativo Family Finance é oferecido por «razão social», CNPJ «número», com
sede em «endereço». Contato do encarregado pelo tratamento de dados pessoais
(DPO): «e-mail».

## 2. O que coletamos

Coletamos apenas o necessário para o aplicativo funcionar.

| Dado | Para quê | De onde vem |
| --- | --- | --- |
| Nome de exibição e e-mail | Identificar você na sua família e enviar confirmação, convite e recuperação de acesso | Você informa |
| Senha | Autenticar seu acesso | Você informa; guardamos apenas um **hash**, nunca a senha |
| Lançamentos financeiros que você registra (valores, descrições, datas, categorias) | Prestar o serviço | Você informa |
| Nome, apelido e últimos 4 dígitos que você dá a uma conta ou cartão | Ajudar você a distinguir suas contas | Você informa |
| Aparelho: modelo, sistema, versão do app, identificador de instalação | Manter sua sessão, listar seus aparelhos e permitir revogá-los | Gerado no seu aparelho |
| Data, hora e IP de acessos e de ações sensíveis | Segurança e trilha de auditoria da família | Gerado no uso |

### O que NÃO coletamos

- **Não** pedimos e **não** armazenamos número completo de cartão, CVV, senha do
  banco ou qualquer credencial bancária. O aplicativo não se conecta a bancos.
- **Não** coletamos localização, agenda de contatos, fotos (além dos anexos que
  você mesmo escolhe enviar), nem histórico de navegação.
- **Não** vendemos dados. **Não** exibimos publicidade. **Não** compartilhamos
  seus dados com terceiros para fins de marketing.

## 3. Como usamos

Usamos os dados para: manter sua conta e sua sessão; guardar e calcular o que
você registra; enviar os e-mails transacionais do serviço (confirmação, convite,
recuperação de acesso); avisar sobre vencimentos e faturas, se você permitir; e
detectar uso indevido.

Não tomamos decisões automatizadas com efeito jurídico sobre você.

## 4. Dados dentro de uma família

O Family Finance é compartilhado por natureza. Ao entrar numa família, seus
lançamentos ficam visíveis para os demais membros conforme o papel de cada um e
as permissões definidas pelo Proprietário. Contas marcadas como restritas não
aparecem para quem não tem permissão — e isso é aplicado **no servidor**, não só
na tela.

Proprietário e Administradores enxergam a trilha de auditoria da família: quem
criou, alterou, deu baixa, estornou ou aprovou o quê.

## 5. Crianças e adolescentes

O aplicativo prevê o perfil "filho supervisionado", criado **por um adulto
responsável da família**, que também define a regra de aprovação de gastos. Uma
criança não cria conta sozinha: ela só entra por convite nominal enviado a um
e-mail, e o responsável controla quais contas ela pode usar.

Os dados de um perfil supervisionado são os mesmos de qualquer membro — nome,
e-mail e os lançamentos que ele registra. Não coletamos dado adicional por ser
menor de idade, e não fazemos qualquer perfilamento comportamental.

O responsável pode, a qualquer momento, remover o membro, o que interrompe o
acesso dele aos dados da família.

## 6. Com quem compartilhamos

Somente com operadores necessários para o serviço funcionar:

| Operador | Para quê | O que recebe |
| --- | --- | --- |
| «provedor de hospedagem» | Rodar o servidor e o banco de dados | Todos os dados, criptografados em trânsito e em repouso |
| «provedor de e-mail» | Enviar e-mails transacionais | E-mail e nome de exibição |
| «provedor de push», se ativado | Entregar notificações | Identificador de push do aparelho |
| «provedor de monitoramento de erros» | Diagnosticar falhas | Dados técnicos sem conteúdo financeiro e sem identificação direta |

Podemos também compartilhar quando exigido por lei ou ordem judicial.

## 7. Por quanto tempo guardamos

| Dado | Prazo |
| --- | --- |
| Conta e lançamentos | Enquanto sua conta existir |
| Trilha de auditoria | «prazo — definir com o jurídico; sugerido 5 anos» |
| Registros de acesso (IP, data e hora) | 6 meses, conforme o Marco Civil da Internet |
| Backups | 30 dias |

Registros financeiros **estornados não são apagados**: o estorno preserva o
lançamento original com o motivo e o autor. Isso é exigência de integridade
contábil, não retenção adicional de dado pessoal.

## 8. Seus direitos (LGPD, art. 18)

Você pode pedir confirmação de tratamento, acesso, correção, anonimização,
portabilidade, eliminação e informação sobre compartilhamento, além de revogar
consentimento. Fale com «e-mail». Respondemos em até 15 dias.

Dentro do app você já consegue, sem pedir nada a ninguém: **exportar** seus
dados em CSV, **corrigir** lançamentos por estorno, **revogar** sessões e
aparelhos, e **sair** da família.

Ao excluir sua conta, apagamos seus dados pessoais. Lançamentos que pertencem à
contabilidade de uma família da qual você participou permanecem para os demais
membros, dissociados de você quando possível — apagá-los inutilizaria o histórico
financeiro de terceiros.

## 9. Segurança

Tráfego em HTTPS. Senhas guardadas como hash com algoritmo de derivação lento.
Tokens de sessão guardados no armazenamento seguro do sistema operacional
(Keychain no iOS, Keystore no Android), nunca em arquivo comum. Isolamento entre
famílias aplicado no próprio banco de dados por Row Level Security, e revalidado
na camada de serviço. Anexos em armazenamento privado, acessíveis apenas por URL
assinada e temporária. Ações sensíveis auditadas.

Nenhuma medida é infalível. Em caso de incidente com risco relevante, avisamos
você e a ANPD conforme a LGPD.

## 10. Alterações

Avisaremos no aplicativo com pelo menos 15 dias de antecedência quando a
mudança reduzir seus direitos ou ampliar o uso dos dados.

## 11. Contato

«e-mail de suporte» · «endereço postal»
