# Portal Escolar

Sistema de gestão escolar com controle de acesso por catraca Control iD: turmas, alunos, responsáveis, professores, diários, notas, boletins, relatórios e cadastro facial/cartão/senha na catraca.

O sistema roda **num computador da escola** (o mesmo que fica na rede da catraca) e os outros computadores da escola usam pelo navegador. Os dados ficam num banco SQLite dentro da escola, com backup automático todos os dias.

Sem dependências e sem etapa de build: precisa só do **Node.js 22.13 ou mais novo** (a versão LTS do site oficial serve).

## Testar (demonstração)

Dê dois cliques em `servidor/demo.bat`. Ele abre uma catraca simulada e o sistema com dados fictícios em `http://localhost:8787`. Entre com um dos usuários de teste (senha `demo1234`): `admin.demo`, `secretaria.demo`, `coordenacao.demo`, `professor.demo`, `portaria.demo` e `financeiro.demo`.

Sem Windows: `node servidor/simulador.js` num terminal e, em outro, `CONFIG=config.demo.json node servidor/server.js`.

## Instalar na escola

1. Instale o **Node.js** (versão LTS, em https://nodejs.org) no computador da recepção, ligado na mesma rede da catraca.
2. Copie a pasta do projeto **inteira** para esse computador (as pastas `public` e `servidor` ficam lado a lado).
3. Dê dois cliques em `servidor/iniciar.bat` e deixe a janela aberta. Na primeira vez, o Windows pergunta se libera o acesso na rede: clique em **Permitir** (rede privada), senão os outros computadores não conseguem entrar.
4. O navegador abre em `http://localhost:8787`. Como é o primeiro acesso, o sistema pede para criar o **administrador**.
5. Em **Configurações**, confira os dados da escola e o ano letivo e crie os usuários (secretaria, professores, portaria...).
6. Em **Controle de acesso > Conexão com a catraca**, preencha o IP, o usuário e a senha da catraca e o modelo. Clique em **Testar conexão** e em **Salvar**.
7. Nos outros computadores da escola, abra o endereço que aparece na janela do servidor (ex.: `http://192.168.0.10:8787`).

### Câmera nos outros computadores

O navegador só libera a webcam em `localhost` ou em endereço `https`. Por isso, a foto pela webcam funciona no computador do servidor. Nos outros computadores, use **Capturar na catraca** (o aluno olha para a câmera da própria catraca) ou **Enviar arquivo**.

### Backup

O banco fica em `servidor/dados/escola.db`. Todo dia o servidor guarda uma cópia em `servidor/dados/backups` e mantém os últimos 30 dias. Copie essa pasta para um pendrive ou para a nuvem de vez em quando: se o computador quebrar, é com ela que os dados voltam.

Para restaurar: feche o servidor, copie o backup escolhido por cima de `servidor/dados/escola.db` e abra o servidor de novo.

## Usuários e permissões

| Tipo | O que pode fazer |
|---|---|
| Administrador | Tudo, inclusive usuários, configurações e catraca |
| Secretaria | Cadastros, matrículas, notas, boletins, relatórios e cadastro na catraca |
| Coordenação | Consulta de tudo, notas, ocorrências, acompanhamento e acessos da catraca |
| Professor | Só os próprios diários: notas, faltas e planejamento |
| Portaria | Liberação da catraca e lista de acessos |
| Financeiro | Mensalidades, inadimplência e consulta dos cadastros |

As permissões são conferidas no servidor em toda operação. Senhas são guardadas com scrypt, a sessão vale 12 horas e o login bloqueia por 10 minutos depois de 5 tentativas erradas. Tudo o que é alterado fica no **Registro de atividades** (Configurações).

## LGPD

- A foto do rosto é dado biométrico de menor. O sistema só cadastra o rosto na catraca se a ficha do aluno tiver a **autorização do responsável** marcada (guarde o termo assinado). Sem autorização, o aluno passa por cartão ou senha.
- Retirar a autorização apaga a foto da catraca. Aluno transferido, cancelado ou excluído sai da catraca automaticamente.
- Excluir o aluno apaga notas, faltas, responsáveis e o cadastro na catraca.
- Professores só veem os alunos das próprias turmas; a portaria vê só nome, matrícula e turma.

## Catraca Control iD

O navegador não fala direto com a catraca: ela só tem HTTP na rede local e não libera CORS. Quem fala com ela é o servidor, usando a [API de acesso da Control iD](https://www.controlid.com.br/docs/access-api-pt/). O login da catraca fica no servidor e nunca vai para o navegador.

Cartão com número impresso no formato `área,código` (ex.: `123,45678`) é gravado como `área × 2³² + código`, como manda a documentação. Só dígitos são gravados como estão. Na dúvida, use **Ler na catraca** e o aluno aproxima o cartão do leitor.

## Demonstração online (Render)

O `render.yaml` sobe `servidor/demo-online.js`: sistema, dados fictícios e catraca simulada num só processo, com tudo na memória. O cliente abre o link e testa pelo navegador, inclusive a foto pela webcam. Os dados voltam ao estado inicial quando o serviço reinicia. No plano gratuito o serviço "dorme" depois de 15 minutos parado e leva cerca de 1 minuto para acordar.

O `modoDemo` só existe para esse serviço com catraca simulada. Nunca use `config.online.json` numa instalação real.

## Estrutura

```
public/            portal (HTML, CSS e JavaScript, sem build)
  index.html       estilos e esqueleto da página
  js/              telas: base, dados, secretaria, catraca, config...
servidor/
  server.js        servidor HTTP, portal e API
  db.js            banco SQLite e migrações
  auth.js          login, sessões, usuários e permissões
  escola.js        turmas, alunos, responsáveis, professores, notas
  catraca.js       integração com a catraca Control iD
  simulador.js     catraca simulada para testes
  semente.js       dados iniciais e dados de demonstração
```

> As imagens `referencia*.jpeg` estão no `.gitignore` porque mostram dados reais de alunos.
