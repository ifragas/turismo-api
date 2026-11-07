# Atribuição de custom claims

Script temporário para conceder `role` e `tenant` a um usuário do Firebase Auth.

**Este script concede privilégios administrativos. Use com responsabilidade.**

## Pré-requisitos

- Node.js 20 ou superior
- Dependências instaladas (`npm install`)
- Arquivo `.env` na raiz, copiado de `.env.example`, com credenciais válidas do Firebase Admin
- Uma das opções abaixo preenchida com a conta de serviço real (nunca commitar esse valor):
  - `FIREBASE_SERVICE_ACCOUNT_JSON`
  - `FIREBASE_SERVICE_ACCOUNT_PATH`

## Como usar

```bash
npm run set-admin-claim -- --uid=SEU_UID --role=admin --tenant=rolante
```

O script verifica se o usuário existe no Firebase Auth e grava as claims `{ role, tenant }`. Depois da execução, a pessoa precisa sair e entrar de novo no painel para o token novo incluir as claims.

Execute uma vez e apague `scripts/setAdminClaim.js` quando não precisar mais dele.

## Parâmetros

| Parâmetro | Obrigatório | Descrição |
| --- | --- | --- |
| `uid` | sim | UID do usuário no Firebase Auth (`--uid=`) |
| `role` | sim | Papel permitido: `admin` ou `editor` (`--role=`) |
| `tenant` | sim | Identificador do tenant (`--tenant=`) |

## Como revogar claims

Para remover os privilégios, zere as custom claims e invalide os refresh tokens daquele usuário:

```javascript
await admin.auth().setCustomUserClaims(uid, {});
await admin.auth().revokeRefreshTokens(uid);
```

`setCustomUserClaims(uid, {})` apaga `role` e `tenant`. `revokeRefreshTokens(uid)` força a sessão atual a expirar; o usuário precisa entrar de novo para receber um token sem essas claims.

## Aviso de segurança

Este script concede privilégios administrativos. Use com responsabilidade.
