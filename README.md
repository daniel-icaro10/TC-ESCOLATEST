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
