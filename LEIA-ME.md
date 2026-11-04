# Grimório da Mesa (versão Netlify)

Controle de **Vida** e **Sanidade** da mesa de RPG. Roda **só no Netlify**, sem servidor próprio: a API é uma Netlify Function e os dados ficam no **Netlify Blobs** (persistente e gratuito).

## Publicar (arrastando a pasta)
1. Descompacte o zip.
2. Entre em https://app.netlify.com (logado), vá em **Projects → Add new project → Deploy manually** e **arraste a pasta inteira** (a que contém `public`, `netlify` e `netlify.toml`).
3. Abra o endereço que o Netlify gerar e clique em *Entrar como mestre*. A senha padrão do mestre é `mestre123` (para trocar, defina a variável `SENHA_MESTRE`, veja abaixo).
4. Confira em **Functions** (menu do site) se aparece a função `api`. Se **não aparecer**, o Netlify não aceitou as funções pelo arrastar: use o caminho abaixo.

## Publicar pelo GitHub (se o arrastar não ativar a função)
Suba a pasta para um repositório no GitHub, no Netlify use **Add new project → Import from Git**. Não precisa preencher nada: o `netlify.toml` já define tudo (pasta `public`, funções em `netlify/functions`).

Ou, com o Netlify CLI: `npm i -g netlify-cli`, `netlify login`, `netlify deploy --prod`.

## Painel do Mestre (Mesa do Mestre)
Sete abas, no estilo madeira, pergaminho e ouro (no celular o menu vira uma barra de abas rolável):
- **Combate:** ordem dos turnos com iniciativa (rolada ou digitada), rodada, "Próximo turno" (monstros caídos perdem a vez), dano e cura em qualquer combatente, efeitos ativos que **causam dano, curam e acabam sozinhos a cada turno** (veneno que empilha, sangramento que cessa ao curar), "vida escondida dos jogadores" (eles veem só Ileso, Ferido ou Crítico) e calculadora de dano com crítico, vantagem e desvantagem e botão "Aplicar no alvo".
- **Jogadores:** fichas com vida e sanidade, ajustes rápidos, foto, histórico, contas (senha), e quem vê quem.
- **Dados:** d4 a d100, expressões como `2d6+3`, vantagem/desvantagem, crítico ×2/×3, ataques prontos tirados do bestiário e dos itens, histórico. Só o mestre vê.
- **Monstros:** bestiário com busca e filtros (vida, armadura, bônus de iniciativa, dado de ataque, habilidades, notas); "Invocar no combate" já numera (Goblin 1, 2, 3).
- **Efeitos:** criador de status (dano/cura por turno, buff, controle, duração, acumula, termina ao curar, visível aos jogadores) e aplicação em quem estiver no combate.
- **Itens:** cadastro (dado de dano, bônus, efeitos), entrega e recolhimento por jogador, inventário em grade (o jogador vê o próprio).
- **Histórico e Notas:** registro da sessão com filtros (dano, cura, rolagens, combate) e notas com etiquetas.

O jogador vê, na ficha, a ordem do combate (com "É a sua vez!"), os efeitos visíveis e o próprio inventário. A fonte (Grimório, Gótico ou Clássico) é escolhida no rodapé do menu. Atalhos: setas navegam entre as abas; cada aba tem endereço próprio (`#combate`, `#monstros`…).

## Personagens de exemplo
Já vêm 2: **Eleanor Voss** (senha `eleanor123`) e **Tobias Crane** (senha `tobias123`). Exclua ou troque as senhas no painel do mestre antes de jogar de verdade.

## Variáveis opcionais (Site configuration → Environment variables)
- `SENHA_MESTRE`: se definida, substitui a senha padrão do mestre (`mestre123`).
- `LOGIN_MAX`: tentativas de login por IP a cada 15 min (padrão 10).

## Como funciona a atualização
Sem tempo real por WebSocket (o Netlify não oferece): cada tela consulta o servidor a cada ~2,5 s (e na hora após qualquer ação). O aviso de dano aparece na tela do jogador em até ~3 s. A consulta pausa quando a aba está em segundo plano. Cada consulta conta como uma chamada de função no seu plano do Netlify; uma mesa de 5 pessoas por 4 horas fica na ordem de 30 mil chamadas.

## Segurança
Senhas com bcrypt; sessão em cookie `httpOnly` assinado, 12 h; trocar a senha de um personagem derruba as sessões dele; o jogador só altera o **próprio** personagem (outras tentativas dão 403, validado no servidor) e só recebe dados que pode ver; upload só JPG/PNG/WEBP até 5 MB, conferindo o conteúdo real; limite de tentativas de login.

## Desenvolvimento
- `npm install`, `npm run build` (empacota `netlify/src/api.mjs` em `netlify/functions/api.mjs`, que é o arquivo publicado).
- `npm run dev` abre o site em http://localhost:8899 com dados em memória (sem Netlify); `npm test` roda os testes da lógica; `npx netlify-cli dev` simula o Netlify localmente (`node test/live.mjs http://localhost:8888`).
- Depois de editar `netlify/src/api.mjs`, rode `npm run build` antes de publicar.


## Biblioteca (áreas, monstros e mapas)
A aba **Biblioteca** traz **106 áreas** e **109 monstros** prontos (níveis 1 a 10), com busca e filtros. Cada área mostra um mapa de referência do tipo de lugar (dá para trocar pelas miniaturas), encontros sugeridos, gancho de aventura e botões para **invocar o encontro no combate** ou **salvar como nota**. Cada monstro tem **Usar no combate** e **Adicionar ao meu bestiário**.

Os **60 mapas** são reais (plantas de cidades e castelos, cartas marinhas, mapas polares, cartas celestes…), de domínio público ou licença aberta (Wikimedia Commons), sem imagens geradas. O autor, a licença e o link de cada um aparecem na tela e em `CREDITOS-MAPAS.md`. Para trocar ou acrescentar, edite `public/js/mapas.js` (mapas) e `public/js/biblioteca.js` (áreas e monstros) e rode `node test/biblioteca.mjs` para validar.
