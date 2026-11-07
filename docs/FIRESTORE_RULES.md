# Regras do Firestore e do Storage

## Objetivo

O painel e o app mobile não gravam direto no Firebase. A leitura fica pública para o app consultar dados e arquivos. A escrita fica bloqueada nas regras do cliente.

Criar, editar e excluir só passam pela API Node.js. Ela autentica e autoriza a requisição e usa o Firebase Admin SDK. O Admin SDK ignora `firestore.rules` e `storage.rules`, então a mutação acontece no servidor, onde a operação pode ser validada e auditada. Um cliente com a chave pública do Firebase não consegue contornar essa trilha.

Os arquivos na raiz do repositório são:

- `firestore.rules` — qualquer documento: `read` permitido, `write` negado
- `storage.rules` — qualquer caminho do bucket: `read` permitido, `write` negado

## Pré-requisitos

1. Firebase CLI instalado:

```bash
npm install -g firebase-tools
```

2. Sessão autenticada na conta que administra o projeto:

```bash
firebase login
```

## Como fazer o deploy

Na raiz do projeto, associe os arquivos de regras ao projeto Firebase. O comando pergunta qual projeto usar e onde estão as regras; aponte para `firestore.rules` e `storage.rules` nesta pasta.

```bash
firebase init firestore storage
```

Depois publique só as regras, sem alterar outros recursos:

```bash
firebase deploy --only firestore:rules,storage:rules
```

## Como testar

No Firebase Console, abra **Firestore > Rules > Simulator**.

- Uma leitura (`get` ou `list`) em qualquer caminho deve ser **permitida**.
- Uma escrita (`create`, `update` ou `delete`), autenticada ou não, deve ser **negada**.

Para o Storage, abra **Storage > Rules** e confira a mesma política: leitura permitida e escrita negada. O simulador do Storage cobre `get`, `create`, `update` e `delete` em um caminho do bucket.
