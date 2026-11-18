# 🚀 FF Tech Lab - API REST Multi-Tenant de Turismo

API backend robusta, segura e escalável desenvolvida para gerenciar o ecossistema de turismo digital (Guia da Cidade / Smart Turismo). Construída em Node.js com integração ao Firebase, esta API evoluiu de um sistema monolítico para uma **arquitetura SaaS Multi-Tenant** completa.

## 🏗️ Arquitetura e Diferenciais Técnicos

- **Multi-Tenant Nativo:** Todos os dados são isolados por `cidadeId`. O backend filtra, injeta e valida o tenant em TODAS as operações de CRUD.
- **RBAC Avançado (Role-Based Access Control):** 
  - `super_admin`: Acesso global e gestão de infraestrutura.
  - `city_admin` / `editor`: Acesso estritamente restrito ao `cidadeId` vinculado às suas Custom Claims no JWT.
- **Padrão Gateway Seguro:** O frontend NUNCA escreve diretamente no Firestore. Todas as mutações passam pela API, onde o middleware `requireRole` valida as permissões antes de qualquer operação.
- **Admin SDK Integrado:** Gerenciamento de usuários, cidades e custom claims feito via backend seguro, eliminando a dependência do Console Web do Firebase.
- **Rotas Dinâmicas Genéricas:** Utilização de dicionário unificado (`colecoesMap`) para lidar com categorias (Pontos Turísticos, Restaurantes, Acomodações, Serviços) de forma limpa e escalável.
- **Resiliência de Erros:** Tratamento inteligente de respostas não-JSON e exclusão automática de arquivos órfãos no Firebase Storage.

## 🛠️ Tecnologias Utilizadas

- **Node.js & Express:** Arquitetura MVC modular e roteamento dinâmico.
- **Firebase Admin SDK:** Autenticação, Firestore, Storage e gerenciamento de Custom Claims.
- **Joi:** Validação rigorosa e tipada de dados de entrada.
- **Express Rate Limit:** Proteção contra ataques de força bruta e spam por IP.
- **Multer:** Processamento eficiente de uploads multipart/form-data.
- **Jest & Supertest:** Framework de testes automatizados para garantia de qualidade contínua.

## 📡 Endpoints da API

### Rotas Públicas e de Conteúdo
| Método | Rota | Descrição | Autenticação |
| :--- | :--- | :--- | :--- |
| GET | `/api/login` | Autenticação administrativa | Pública |
| GET | `/api/:tipo` | Lista itens da categoria (filtrado por cidade se logado) | Optional Auth |
| POST | `/api/:tipo` | Cadastra novo item (injeção automática de cidadeId) | Bearer Token + Role |
| PUT | `/api/:tipo/:id` | Atualiza item (validação de propriedade por cidade) | Bearer Token + Role |
| DELETE | `/api/:tipo/:id` | Remove item e limpa Storage (proteção por cidade) | Bearer Token + Role |

### Rotas Administrativas (Exigem `super_admin`)
| Método | Rota | Descrição |
| :--- | :--- | :--- |
| GET | `/api/admin/cidades` | Lista todos os municípios cadastrados |
| POST | `/api/admin/cidades` | Cria nova cidade (slug, cores, flags) |
| PUT | `/api/admin/cidades/:slug` | Atualiza configurações da cidade |
| DELETE | `/api/admin/cidades/:slug` | Exclui cidade (verifica integridade) |
| GET | `/api/admin/usuarios` | Lista todos os usuários e suas claims |
| POST | `/api/admin/usuarios` | Cria usuário e atribui role/cidade |
| PUT | `/api/admin/usuarios/:uid` | Atualiza permissões de um usuário |
| DELETE | `/api/admin/usuarios/:uid` | Exclui usuário (bloqueio de auto-exclusão) |

## ⚙️ Como Executar o Projeto Localmente

1. Clone o repositório:
   ```bash
   git clone https://github.com/ifragas/turismo-api.git
   cd turismo-api

2. Instale as dependências:
   ```bash
   npm install

3. Configure as variáveis de ambiente:
   Crie um arquivo .env na raiz do projeto baseado no .env.example. Você precisará das credenciais do seu projeto Firebase:

   PORT=3000
   FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account", ... }' # Cole o JSON do Admin SDK aqui (em uma linha)
   FIREBASE_STORAGE_BUCKET=seu-bucket.appspot.com
   FIREBASE_API_KEY=sua_api_key_do_firebase

   Nunca commite o arquivo .env ou firebase.adminsdk.json. Eles já estão protegidos pelo .gitignore.

4. Inicie o servidor em modo de desenvolvimento:
   ```bash
   npm run dev

5. Para rodar os testes automatizados:
   ```bash
   npm test

🔒 Notas de Segurança e Deploy

- Variáveis de Ambiente em Produção: Ao fazer deploy (ex: Render), utilize a variável FIREBASE_SERVICE_ACCOUNT_JSON para colar o conteúdo do arquivo de credenciais. Nunca suba o arquivo físico .json para o servidor.

- Blindagem de Dados: Mesmo que um atacante tente manipular o payload no frontend, o backend sobrescreve o cidadeId com base no token JWT assinado pelo Firebase, tornando impossível cruzar dados entre tenants.

- Proteção de Infraestrutura: As rotas /api/admin/* possuem middleware composto que exige autenticação E a role específica super_admin. Tentativas de acesso direto retornam 403 Forbidden.
