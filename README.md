# Check-list 5S e Tratativa de Avarias – Donos de Rua

App web (celular e tablet) para o check-list diário 5S dos donos de rua: o colaborador preenche e assina, o líder confere e assina, e tudo fica no histórico por 12 meses, com PDF semanal e Excel.

## Como subir do zero (GitHub + Vercel + Upstash)

O app já vem carregado com as 16 ruas, os 109 colaboradores e os acessos dos líderes e coordenadores. Não existe tela de primeiro acesso nem importação obrigatória: os dados entram sozinhos no banco na primeira vez que o app é aberto.

**1. Banco (Upstash)**
- Em https://console.upstash.com abra o banco Redis que vai usar (ou crie um novo, região São Paulo / sa-east-1).
- Na seção **REST API**, copie `UPSTASH_REDIS_REST_URL` (começa com `https://`) e `UPSTASH_REDIS_REST_TOKEN`. Os dois precisam ser **do mesmo banco**.
- Pode ser o mesmo banco do Controle de Equipamentos: as chaves deste app começam com `ck5s:` e não se misturam.

**2. GitHub**
- Crie um repositório novo e vazio (ex.: `checklist-5s-donos-de-rua`).
- *Add file → Upload files*: descompacte o zip, abra a pasta `checklist-5s` e arraste **todo o conteúdo dela** (pastas `api`, `lib`, `public` e os arquivos soltos). Clique em *Commit changes*.
- Confira se ficou: `api/index.js`, `lib/regras.js`, `lib/store.js`, `lib/dados-iniciais.json`, `public/index.html`, `public/app.js`, `public/vendor/` (3 arquivos).

**3. Vercel**
- *Add New → Project* → importe o repositório. Framework: **Other**. Não mude nada.
- Antes de clicar em Deploy, abra **Environment Variables** e crie as duas: `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN` (valores do passo 1).
- Clique em **Deploy**.

**4. Teste**
- Abra `https://SEU-APP.vercel.app/api`. Tem que aparecer `"banco":"Upstash conectado"`, 16 ruas, 109 colaboradores e 9 acessos.
- Abra o app e entre em *Acesso do líder / coordenação* com o seu usuário (tabela de acessos enviada à parte).
- Em *Cadastros → Donos das ruas*, defina os responsáveis de cada rua.

Se alterar variáveis depois do deploy, faça **Redeploy** para valerem.

**Recuperar acesso do coordenador (opcional):** crie na Vercel a variável `CHAVE_RECUPERACAO` (mínimo 8 caracteres), faça Redeploy e use o link "Recuperar acesso do coordenador" na tela de login. Depois apague a variável.

## Perfis

| Quem | Como entra | O que vê / faz |
|---|---|---|
| Colaborador (dono de rua) | Digita o nome e toca nele na lista | Só o check-list da(s) sua(s) rua(s), no turno em andamento. Preenche e assina. |
| Líder | Usuário e senha | Painel e validação dos turnos dele, define substitutos, relatórios. |
| Visualização | Usuário e senha | Painel, aderência e relatórios, sem assinar nem editar. |
| Coordenador | Usuário e senha | Tudo, incluindo cadastros, configurações e acessos. |

## Regras

- O check-list só pode ser preenchido durante o turno. Ao fim do turno, sem envio, a rua vira **Não realizado**.
- O T3 (22:00–06:00) conta na data de início do turno.
- Itens: Feito, Não feito ou N/A. Se algum item for "Não feito", a observação é obrigatória. N/A conta como item ok na aderência.
- Líder valida o check-list inteiro até o fim do turno seguinte. Depois disso fica **Sem validação** e só o coordenador pode validar (registrado como fora do prazo).
- Reprovação exige motivo e devolve o check-list ao colaborador, que refaz e reenvia. Tudo fica no histórico.
- Validado = travado, sem edição.
- Substituto: o líder escolhe data, turno, rua e colaborador. Vale só naquele turno.
- Assinatura eletrônica: nome, data, hora e aparelho.
- Mudanças nos itens valem dali para frente; check-lists antigos não mudam.
- Histórico guardado por 12 meses.

## Testar no computador

```
node dev-server.js
```
Abra http://localhost:3000. Sem as variáveis do Upstash, os dados ficam no arquivo `.devdb.json` (só para teste).

## Estrutura

- `public/` – telas (HTML/CSS/JS), logo e bibliotecas de PDF/Excel embutidas
- `api/index.js` – API (função da Vercel)
- `lib/regras.js` – regras de negócio; `lib/store.js` – acesso ao Redis; `lib/dados-iniciais.json` – ruas, colaboradores e acessos iniciais (senhas só criptografadas)
