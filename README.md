# Portal Escolar

Sistema de gestão escolar com controle de acesso por catraca Control iD e portal para as famílias.

O sistema roda **num computador da escola** (o mesmo que fica na rede da catraca), e os outros computadores usam pelo navegador. Os dados ficam num banco SQLite dentro da escola, com backup automático todo dia.

Não tem dependências nem etapa de build. Precisa só do **Node.js 22.13 ou mais novo** (a versão LTS do site oficial serve).

## O que o sistema faz

| Área | Telas |
|---|---|
| Secretaria | Alunos (ficha completa, situação, autorização de biometria), responsáveis, professores, importação por planilha, turmas, disciplinas, diários, boletins, histórico escolar, horários, simulados |
| Matrículas | Matrícula, rematrícula (virada de ano com cópia das turmas), pré-matrícula on-line com página pública para as famílias |
| Notas | Lançamento de notas e faltas por bimestre, entrega de diários pelo professor, bloqueio de lançamentos |
| Pedagógico | Planejamento de aulas (o professor envia, a coordenação aprova), ocorrências, acompanhamento de alunos em risco, habilidades da BNCC |
| Controle de acesso | Cadastro na catraca por rosto, cartão e senha; liberação manual; acessos do dia; presença por turma; conexão com a catraca |
| Financeiro | Mensalidades, bolsas, pagamentos, recibos, multa e juros, inadimplência com lembrete por WhatsApp |
| Comunicação | Comunicados por público, mensagens internas, tutoriais, suporte |
| Família | Login do responsável com boletim, entradas e saídas pela catraca, mensalidades e comunicados dos próprios filhos |
| Relatórios | Ata de resultados, ficha individual, relação de alunos, lista de assinatura, contatos dos responsáveis (todos imprimíveis) |
| Administração | Dados da escola, usuários e tipos de acesso, registro de atividades, backup |

## Testar (demonstração)

Dê dois cliques em `servidor/demo.bat`. Ele abre uma catraca simulada e o sistema com dados fictícios em `http://localhost:8787`. Entre com um dos usuários de teste, todos com a senha `demo1234`:

- `admin.demo`
- `secretaria.demo`
- `coordenacao.demo`
- `professor.demo`
- `portaria.demo`
- `financeiro.demo`
- `familia.demo`

Sem Windows: rode `node servidor/simulador.js` num terminal e, em outro, `CONFIG=config.demo.json node servidor/server.js`.

## Instalar na escola

1. Instale o **Node.js** (versão LTS, em https://nodejs.org) no computador da recepção, ligado na mesma rede da catraca.
2. Copie a pasta do projeto **inteira** para esse computador. As pastas `public` e `servidor` ficam lado a lado.
3. Dê dois cliques em `servidor/iniciar-com-windows.bat` e responda **S** para abrir agora. A partir daí o servidor abre sozinho quando o computador liga e volta sozinho se fechar por algum erro.
   - Para usar só de vez em quando, sem início automático, use `servidor/iniciar.bat` e deixe a janela aberta.
   - Na primeira vez, o Windows pergunta se libera o acesso na rede. Clique em **Permitir** (rede privada), senão os outros computadores não conseguem entrar.
4. Abra `http://localhost:8787`. Como é o primeiro acesso, o sistema pede para criar o **administrador**.
5. Siga **Central de ajuda > Tutoriais > Primeiros passos**:
   - confira os dados da escola e o ano letivo;
   - crie os usuários;
   - importe os alunos por planilha;
   - configure a catraca em **Controle de acesso > Conexão com a catraca**.
6. Nos outros computadores da escola, abra o endereço que aparece na janela do servidor (ex.: `http://192.168.0.10:8787`).

Deixe esse computador sem suspensão automática e, de preferência, com o Windows entrando sozinho no usuário.

### Câmera nos outros computadores

O navegador só libera a webcam em `localhost` ou em endereço `https`. Por isso, a foto pela webcam funciona no computador do servidor. Nos outros computadores, use **Capturar na catraca** (o aluno olha para a câmera da própria catraca) ou **Enviar arquivo**.

### Acesso de fora da escola (famílias e pré-matrícula)

Dentro da rede da escola tudo funciona direto. Para as famílias entrarem de casa e para a pré-matrícula on-line, o servidor precisa estar publicado na internet com `https`.

O jeito mais simples e seguro é um túnel, como o [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/), que não exige abrir portas no roteador. O endereço `https` do túnel também libera a webcam em qualquer computador.

Antes de publicar, confira se todos os usuários têm senhas fortes.

### Backup

O banco fica em `servidor/dados/escola.db`. Todo dia o servidor guarda uma cópia em `servidor/dados/backups` e mantém os últimos 30 dias.

Em **Configurações > Dados da escola > Baixar backup agora**, o administrador baixa uma cópia na hora. **Leve uma cópia para fora do computador toda semana** (pendrive ou nuvem). O arquivo tem dados pessoais: guarde em lugar seguro.

Para restaurar:

1. Feche o servidor.
2. Copie o backup escolhido por cima de `servidor/dados/escola.db`.
3. Apague os arquivos `escola.db-wal` e `escola.db-shm`, se existirem.
4. Abra o servidor de novo.

### Atualizar o sistema

1. Feche o servidor.
2. Substitua as pastas `public` e `servidor` pelas novas, **mantendo `servidor/dados`** (o banco e os backups) e `servidor/config.json`, se existir.
3. Abra o servidor de novo. As mudanças no banco são aplicadas sozinhas na primeira abertura.

## Usuários e permissões

| Tipo | O que pode fazer |
|---|---|
| Administrador | Tudo, inclusive usuários, configurações, catraca e backup |
| Secretaria | Cadastros, matrículas, notas, boletins, relatórios, cadastro na catraca e acessos das famílias; consulta o financeiro |
| Coordenação | Consulta tudo; notas, ocorrências, acompanhamento, aprovação de planejamentos e acessos da catraca |
| Professor | Só as próprias turmas: notas, faltas, entrega de diários, planejamento, horário, habilidades e ocorrências |
| Portaria | Liberação da catraca, acessos e presença por turma |
| Financeiro | Mensalidades, pagamentos e inadimplência; consulta os cadastros |
| Família | Só os próprios filhos: boletim, entradas e saídas, mensalidades, comunicados e mensagens para a escola |

As permissões são conferidas no servidor em toda operação.

- Senhas são guardadas com scrypt.
- A sessão vale 12 horas.
- O login bloqueia por 10 minutos depois de 5 tentativas erradas.
- Tudo o que é alterado fica no **Registro de atividades** (Configurações).

## LGPD

- **Biometria facial:** a foto do rosto é dado biométrico de menor. O sistema só cadastra o rosto na catraca se a ficha do aluno tiver a **autorização do responsável** marcada (guarde o termo assinado). Sem autorização, o aluno passa por cartão ou senha.
- **Saída da catraca:** retirar a autorização apaga a foto da catraca. Aluno transferido, cancelado ou excluído sai da catraca automaticamente.
- **Exclusão:** excluir o aluno apaga notas, faltas, responsáveis, ocorrências, cobranças e o cadastro na catraca.
- **Pré-matrícula:** o formulário pede o aceite do uso dos dados. Apague os pedidos que não viraram matrícula.
- **Quem vê o quê:** professores veem só os alunos das próprias turmas, a portaria vê só nome, matrícula e turma, e cada família vê só os próprios filhos.

## Catraca Control iD

O navegador não fala direto com a catraca, porque ela só tem HTTP na rede local e não libera CORS. Quem fala com ela é o servidor, usando a [API de acesso da Control iD](https://www.controlid.com.br/docs/access-api-pt/). O login da catraca fica no servidor e nunca vai para o navegador.

Cartão com número impresso no formato `área,código` (ex.: `123,45678`) é gravado como `área × 2³² + código`, como manda a documentação. Só dígitos são gravados como estão. Na dúvida, use **Ler na catraca** e o aluno aproxima o cartão do leitor.

## Demonstração online (Render)

O `render.yaml` sobe `servidor/demo-online.js`: sistema, dados fictícios e catraca simulada num só processo, com tudo na memória. O cliente abre o link e testa pelo navegador, inclusive a foto pela webcam. Os dados voltam ao estado inicial quando o serviço reinicia. No plano gratuito o serviço "dorme" depois de 15 minutos parado e leva cerca de 1 minuto para acordar.

O `modoDemo` só existe para esse serviço com catraca simulada. Nunca use `config.online.json` numa instalação real.

## Estrutura

```
public/                    portal (HTML, CSS e JavaScript, sem build)
  index.html               esqueleto da página
  pre-matricula.html       formulário público de pré-matrícula
  css/estilo.css           estilos
  js/                      telas: base, dados, secretaria, academico, matriculas, catraca,
                           config, comunicacao, pedagogico, financeiro, familia
servidor/
  server.js                servidor HTTP, portal, API e backup
  db.js                    banco SQLite e migrações (versão do banco em PRAGMA user_version)
  auth.js                  login, sessões, usuários e permissões
  escola.js                turmas, alunos, responsáveis, professores, notas
  academico.js             importação por planilha e histórico escolar
  matriculas.js            matrículas, rematrícula e pré-matrícula
  pedagogico.js            horários, ocorrências, planejamento, BNCC e simulados
  financeiro.js            mensalidades, pagamentos e inadimplência
  comunicacao.js           comunicados, mensagens e suporte
  familia.js               portal da família
  catraca.js               integração com a catraca Control iD
  simulador.js             catraca simulada para testes
  semente.js               dados iniciais e dados de demonstração
  *.bat                    iniciar, iniciar com o Windows, demonstração
```

> As imagens `referencia*.jpeg` estão no `.gitignore` porque mostram dados reais de alunos.
