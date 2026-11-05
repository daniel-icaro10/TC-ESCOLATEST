# Portal Escolar Futuro

Protótipo do sistema de gestão escolar (secretaria): lista de turmas, alunos, disciplinas, diários, relatórios da turma e boletins.

É um site estático, em um único arquivo (`public/index.html`), sem dependências nem etapa de build. Os dados são fictícios e gerados no próprio navegador.

## Rodar localmente

Abra `public/index.html` no navegador.

## Publicar no Render

1. Envie esta pasta para um repositório no GitHub (veja abaixo).
2. No Render: **New → Blueprint**, escolha o repositório. O `render.yaml` já configura tudo.
   - Alternativa manual: **New → Static Site**, *Build Command* vazio e *Publish Directory* `public`.
3. A cada `git push` na branch principal o Render publica de novo.

```bash
git init
git add .
git commit -m "Protótipo do portal escolar"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/portal-escolar.git
git push -u origin main
```

> As imagens `referencia*.jpeg` estão no `.gitignore` porque mostram dados reais de alunos.

## Catraca Control iD (controle de acesso)

O menu **Controle de acesso** tem três telas:

- **Cadastro facial**: envia o aluno para a catraca com foto do rosto (câmera do computador, arquivo ou captura pela própria catraca), senha numérica e cartão de aproximação. O botão **+ Novo aluno com facial** matricula o aluno e já abre o cadastro na catraca.
- **Liberação e acessos**: libera um giro (entrada, saída ou os dois lados) e mostra os acessos do dia, atualizando a cada 10 segundos.
- **Conexão com a catraca**: endereço da ponte e teste de conexão.

O navegador não fala direto com a catraca: ela só tem HTTP na rede local e não libera CORS. Quem fala com ela é a **ponte** (`ponte-catraca/server.js`), um programa Node.js sem dependências que roda num computador da escola na mesma rede da catraca. A ponte usa a [API de acesso da Control iD](https://www.controlid.com.br/docs/access-api-pt/) e guarda o login da catraca, que assim não fica no navegador.

### Instalar a ponte

1. Instale o Node.js 18 ou mais novo.
2. Copie `ponte-catraca/config.exemplo.json` para `ponte-catraca/config.json` e ajuste:
   - `catraca.ip`, `catraca.usuario`, `catraca.senha`: IP e login de administrador da catraca (o padrão de fábrica é `admin` / `admin`).
   - `acaoLiberar`: `catra` para iDBlock, `sec_box` para iDFace/iDFlex com SecBox, `door` para relé.
   - `sentidoEntrada`: o giro (`clockwise` ou `anticlockwise`) que corresponde à entrada.
   - `grupoId`: grupo da catraca com a regra de acesso dos alunos.
   - `origensPermitidas`: endereços do portal que podem usar a ponte (inclua o endereço do Render).
   - `token`: opcional; se preencher, informe o mesmo token na tela **Conexão com a catraca**.
3. Rode `iniciar.bat` (ou `node server.js`). A ponte escuta só em `127.0.0.1:8787` e também serve o portal em `http://localhost:8787`.

### Testar sem a catraca

Dê dois cliques em `ponte-catraca/demo.bat`. Ele abre uma catraca simulada (`simulador.js`, em `127.0.0.1:8790`), sobe a ponte com `config.demo.json` e abre o portal em `http://localhost:8787`. Nada vai para uma catraca de verdade. Os dados do simulador somem quando a janela dele é fechada.

### Números de cartão

Cartão com número impresso no formato `área,código` (ex.: `123,45678`) é gravado como `área × 2³² + código`, como manda a documentação da Control iD. Só dígitos são gravados como estão. Na dúvida, use **Ler na catraca** e o aluno aproxima o cartão do leitor.
