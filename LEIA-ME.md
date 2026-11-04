# Check-list 5S – Donos de Rua (CD Barueri)

## Como o repositório do GitHub deve ficar

```
api/
   index.js          <- servidor (ÚNICO arquivo dentro de uma pasta)
app.js
banner.png
index.html
jspdf.plugin.autotable.min.js
jspdf.umd.min.js
styles.css
xlsx.full.min.js
dev-server.js
package.json
LEIA-ME.md
```

Tudo solto na raiz, menos o `api/index.js`, que precisa estar dentro da pasta `api`.

## Subir

1. No GitHub, apague do repositório os arquivos antigos que não estão na lista acima:
   `index.js`, `regras.js`, `store.js`, `dados-iniciais.json`, `download`, `README.md`.
2. *Add file → Upload files*: envie os arquivos soltos (substituindo os que já existem) e faça *Commit*.
3. Crie a pasta `api`: *Add file → Create new file*, digite `api/index.js` no nome (a barra cria a pasta), cole todo o conteúdo do arquivo `api/index.js` e faça *Commit*.
   (Ou arraste a **pasta** `api` inteira do Windows Explorer para a tela de upload.)
4. A Vercel publica sozinha. Abra `https://SEU-APP.vercel.app/api`: tem que aparecer `"Upstash conectado"`, 16 ruas, 109 colaboradores e 9 acessos.

## Variáveis na Vercel (Settings → Environment Variables)

- `UPSTASH_REDIS_REST_URL` – começa com `https://`
- `UPSTASH_REDIS_REST_TOKEN`

As duas copiadas da mesma tela (REST API) do mesmo banco no Upstash. Depois de alterar, faça Redeploy.

Opcional: `CHAVE_RECUPERACAO` (mínimo 8 caracteres) para usar "Recuperar acesso do coordenador".

## O que já vem carregado

16 ruas (Rua ALM e Rua 0 a 14), 109 colaboradores e 9 acessos (senhas provisórias na planilha de acessos, enviada à parte e que não vai para o GitHub). Os responsáveis de cada rua são definidos em *Cadastros → Donos das ruas*.

## Testar no computador

`node dev-server.js` e abrir http://localhost:3000
