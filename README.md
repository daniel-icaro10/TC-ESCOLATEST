# Portal Escolar Futuro

Protótipo do sistema de gestão escolar (secretaria): lista de turmas, alunos, disciplinas, diários, relatórios da turma e boletins.

É um site estático, em um único arquivo (`public/index.html`), sem dependências nem etapa de build. Os dados são fictícios e gerados no próprio navegador.

## Rodar localmente

- **Só o portal**: abra `public/index.html` no navegador. As telas de catraca não funcionam assim, porque precisam da ponte.
- **Portal com a catraca simulada** (sem equipamento): dê dois cliques em `ponte-catraca/demo.bat` (precisa do Node.js 18+). Veja [Testar sem a catraca](#testar-sem-a-catraca).
- **Portal com a catraca de verdade**: dê dois cliques em `ponte-catraca/iniciar.bat`. Veja [Instalar a ponte](#instalar-a-ponte).

Sem Windows: `node ponte-catraca/simulador.js` num terminal e, em outro, `PONTE_CONFIG=config.demo.local.json PONTE_CONFIG_PADRAO=config.demo.json node ponte-catraca/server.js`. Abra `http://localhost:8787`.

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

1. Instale o Node.js 18 ou mais novo no computador da recepção (na mesma rede da catraca).
2. Copie a pasta do projeto **inteira** para esse computador (as pastas `public` e `ponte-catraca` precisam ficar lado a lado: a ponte serve o portal a partir de `public`). Dê dois cliques em `ponte-catraca/iniciar.bat` e deixe a janela aberta.
3. O portal abre em `http://localhost:8787/#catraca-config`. Preencha na tela:
   - **IP da catraca**, **usuário** e **senha** de administrador (o padrão de fábrica é `admin` / `admin`).
   - **Modelo**: iDBlock, iDFace/iDFlex com SecBox, ou porta com relé.
   - **Sentido da entrada**: o giro que leva para dentro da escola.
   - **Grupo de acesso dos alunos**: grupo da catraca com a regra de acesso (normalmente 1).
   - **Endereços do portal na internet**: se for usar o portal pelo Render, coloque o endereço dele.
4. Clique em **Testar conexão** e depois em **Salvar**.

Não é preciso editar arquivo nenhum. A ponte grava a configuração sozinha em `ponte-catraca/config.json` (fora do Git, porque tem a senha da catraca) e nunca devolve a senha para o navegador. A ponte escuta só em `127.0.0.1:8787`, então só o próprio computador da recepção consegue usá-la.

### Testar sem a catraca

Dê dois cliques em `ponte-catraca/demo.bat`. Ele abre uma catraca simulada (`simulador.js`, em `127.0.0.1:8790`), sobe a ponte com `config.demo.json` e abre o portal em `http://localhost:8787`. Nada vai para uma catraca de verdade. Os dados do simulador somem quando a janela dele é fechada.

### Demonstração online (para o cliente testar de onde estiver)

O `render.yaml` tem um segundo serviço, `portal-escolar-demo-catraca`, que roda `ponte-catraca/demo-online.js`: portal, ponte e catraca simulada num só processo, com `config.online.json`. O cliente abre o link e testa tudo pelo navegador, inclusive a foto pela webcam. Os dados de teste são compartilhados por quem abrir o link e somem quando o serviço reinicia. No plano gratuito o serviço "dorme" depois de 15 minutos parado e leva cerca de 1 minuto para acordar. Abra o link um pouco antes de mandar.

O `modoDemo` só existe para esse serviço com catraca simulada. Nunca ligue `modoDemo` numa ponte conectada a uma catraca real.

### Números de cartão

Cartão com número impresso no formato `área,código` (ex.: `123,45678`) é gravado como `área × 2³² + código`, como manda a documentação da Control iD. Só dígitos são gravados como estão. Na dúvida, use **Ler na catraca** e o aluno aproxima o cartão do leitor.
