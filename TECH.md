# Stack técnica

Decisões de tecnologia do projeto. A base legal que o software precisa respeitar está no [README.md](README.md).

**Decidido em 15/11/2026.**

## O que o produto faz

O gestor informa o horário de funcionamento da empresa e o sistema sugere quantos funcionários são necessários ao longo da jornada. Só entram funcionários CLT, e toda sugestão respeita a lei vigente na data da escala (EC 141/2026 e regras da CLT listadas no README).

## Decisões

| Camada | Escolha | Por quê |
|---|---|---|
| Linguagem | **TypeScript** | Uma linguagem só para interface, servidor e motor de regras; tipos pegam erro de regra cedo |
| Aplicação | **Next.js** (App Router) | Front e back no mesmo projeto, sem API separada para manter |
| Interface | **Tailwind CSS + shadcn/ui** | Componentes prontos e acessíveis, sem prender o visual — dá para seguir qualquer referência de design |
| Banco e login | **Postgres via Supabase** | Banco relacional, autenticação e controle de acesso por linha num serviço só |
| Motor de regras | **Módulo TypeScript puro** em `src/regras/` | Ver seção abaixo |
| Testes | **`bun test`** | Já vem com o Bun, sem dependência extra; o motor de regras é o que mais precisa de teste |
| Hospedagem | **Vercel** | Deploy direto do GitHub, sem servidor para administrar |
| Gerenciador de pacotes e scripts | **Bun** | Instalação e execução rápidas, e uma ferramenta só para pacotes, scripts e testes |

## Motor de regras

É a parte central do produto e a que mais muda, então fica isolada do resto.

- **Sem dependência de framework.** Funções puras: recebem horário de funcionamento, funcionários e data; devolvem dimensionamento e violações. Não acessam banco nem rede.
- **Parâmetros legais são dados, não constantes.** Teto semanal, teto diário, número de repousos e divisor ficam numa tabela com data de início e fim de vigência:

  | Vigência | Teto semanal | Teto diário | Repousos por semana |
  |---|---|---|---|
  | até 15/12/2026 | 44h | 8h | 1 |
  | 16/12/2026 a 15/12/2027 | 42h | 8h (8h24 pela cautelar do STF) | 2 |
  | a partir de 16/12/2027 | 40h | 8h | 2 |

- **Regras de origem instável são desligáveis.** O que vem da cautelar do STF (como as 8h24 sem acordo coletivo) entra como opção configurável, porque pode cair no julgamento do plenário.
- **Convenção coletiva sobrepõe o padrão.** Cada empresa pode ter parâmetros próprios (regime compensatório, feriados, intervalo reduzido) que substituem a regra geral.
- **Cada regra cita sua base legal.** Toda violação devolvida aponta o artigo correspondente do README, para o gestor entender o motivo.
- **Uma regra, um teste.** As 11 regras da seção 7 do README viram casos de teste antes de virar tela.

## O que fica de fora por enquanto

- Aplicativo móvel nativo: a aplicação web é responsiva.
- Otimizador matemático de escalas: a primeira versão calcula o mínimo de funcionários e valida escalas; otimização entra se o cálculo simples não bastar.
- Folha de pagamento e registro de ponto: o produto dimensiona e valida escala, não substitui esses sistemas.
- Outros vínculos (PJ, intermitente, estagiário, doméstico): só CLT.

## Estrutura inicial

```
src/
  app/        telas e rotas (Next.js)
  regras/     motor de regras, sem dependências externas
  lib/        acesso ao banco e utilitários
```
