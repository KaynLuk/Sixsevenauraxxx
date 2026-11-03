# Grimório da Mesa (versão Netlify)

Controle de **Vida** e **Sanidade** da mesa de RPG. Roda **só no Netlify**, sem servidor próprio: a API é uma Netlify Function e os dados ficam no **Netlify Blobs** (persistente e gratuito).

## Publicar (arrastando a pasta)
1. Descompacte o zip.
2. Entre em https://app.netlify.com (logado), vá em **Projects → Add new project → Deploy manually** e **arraste a pasta inteira** (a que contém `public`, `netlify` e `netlify.toml`).
3. Abra o endereço que o Netlify gerar. No **primeiro acesso**, clique em *Entrar como mestre* e **crie a senha do mestre** (mínimo 6 caracteres). Quem chegar primeiro define a senha, então faça isso logo após publicar.
4. Confira em **Functions** (menu do site) se aparece a função `api`. Se **não aparecer**, o Netlify não aceitou as funções pelo arrastar: use o caminho abaixo.

## Publicar pelo GitHub (se o arrastar não ativar a função)
Suba a pasta para um repositório no GitHub, no Netlify use **Add new project → Import from Git**. Não precisa preencher nada: o `netlify.toml` já define tudo (pasta `public`, funções em `netlify/functions`).

Ou, com o Netlify CLI: `npm i -g netlify-cli`, `netlify login`, `netlify deploy --prod`.

## Personagens de exemplo
Já vêm 2: **Eleanor Voss** (senha `eleanor123`) e **Tobias Crane** (senha `tobias123`). Exclua ou troque as senhas no painel do mestre antes de jogar de verdade.

## Variáveis opcionais (Site configuration → Environment variables)
- `SENHA_MESTRE`: se definida, é a senha do mestre (em vez da criada no primeiro acesso).
- `LOGIN_MAX`: tentativas de login por IP a cada 15 min (padrão 10).

## Como funciona a atualização
Sem tempo real por WebSocket (o Netlify não oferece): cada tela consulta o servidor a cada ~2,5 s (e na hora após qualquer ação). O aviso de dano aparece na tela do jogador em até ~3 s. A consulta pausa quando a aba está em segundo plano. Cada consulta conta como uma chamada de função no seu plano do Netlify; uma mesa de 5 pessoas por 4 horas fica na ordem de 30 mil chamadas.

## Segurança
Senhas com bcrypt; sessão em cookie `httpOnly` assinado, 12 h; trocar a senha de um personagem derruba as sessões dele; o jogador só altera o **próprio** personagem (outras tentativas dão 403, validado no servidor) e só recebe dados que pode ver; upload só JPG/PNG/WEBP até 5 MB, conferindo o conteúdo real; limite de tentativas de login.

## Desenvolvimento
- `npm install`, `npm run build` (empacota `netlify/src/api.mjs` em `netlify/functions/api.mjs`, que é o arquivo publicado).
- `npm test` roda os testes da lógica; `npx netlify-cli dev` simula o Netlify localmente (`node test/live.mjs http://localhost:8888`).
- Depois de editar `netlify/src/api.mjs`, rode `npm run build` antes de publicar.
