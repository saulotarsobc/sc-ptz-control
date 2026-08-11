# .copilot-commit-message-instructions

Este arquivo orienta o GitHub Copilot a gerar mensagens de commit consistentes, claras e úteis.

## Objetivo

Fornecer um padrão simples para que o Copilot produza mensagens de commit que facilitem o entendimento do histórico do repositório.

## Estilo da Mensagem

- Use uma linguagem clara e direta.
- O título do commit deve ter até 72 caracteres.
- O corpo deve explicar _por que_ a mudança foi feita, não apenas _o que_ foi mudado.
- Evite descrições vagas.
- As mensagens devem ser escritas em português (pt-br).

## Formato Sugerido

```markdown
<type>: <resumo curto da mudança>

Contexto opcional explicando a motivação, o impacto ou detalhes relevantes.
Use listas curtas caso múltiplas mudanças relacionadas tenham sido feitas.
```

## Tipos Recomendados

- **feat**: nova funcionalidade
- **fix**: correção de bug
- **refactor**: melhoria de código sem mudança de comportamento
- **docs**: atualizações de documentação
- **test**: adição ou melhoria de testes
- **chore**: tarefas auxiliares (build, configurações, etc.)

## Exemplo 1

feat: adiciona suporte a login baseado em token

Implementa um fluxo de autenticação baseado em token para permitir acesso
sem senha para clientes automatizados. Inclui lógica de validação e testes.

## Exemplo 2

fix: corrige erro de validação de formulário

Ajusta a função de validação para lidar corretamente com campos obrigatórios,
evitando que usuários enviem formulários incompletos. Adiciona testes para cobrir casos de borda.

## Exemplo 3

refactor: reorganiza estrutura de pastas do projeto

Melhora a organização do código movendo arquivos para pastas mais apropriadas,
facilitando a manutenção e a escalabilidade do projeto.

## Exemplo 4 - Para o caso de atualizações de bibliotecas ou dependências usando o (`ncu`)

chore: atualiza dependências do projeto

Atualiza as bibliotecas e dependências do projeto para as versões mais recentes, incluindo correções de segurança e melhorias de desempenho.

- @types/node: 18.16.19 → 20.4.2
- eslint: 8.42.0 → 8.43.0
- tsx: 4.0.0 → 4.1.0

## Notas para o Copilot

- Gere mensagens concisas, porém informativas.
- Sempre tente explicar a motivação por trás das mudanças.
- Nunca produza mensagens de commit genéricas como "update" ou "changes".
- Os tipos de commit (feat, fix, docs, etc.) devem permanecer em inglês; o restante da mensagem deve ser em português.
