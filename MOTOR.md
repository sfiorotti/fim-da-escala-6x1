# Motor de escala

Como o código em `src/regras/` transforma o horário de funcionamento de uma empresa em número de funcionários e em escala. A base legal está no [README.md](README.md); os tipos de escala, no [ESCALAS.md](ESCALAS.md).

**Atualizado em 15/11/2026.**

## Visão geral

O motor são funções puras: não acessam banco, rede nem relógio. Recebem o funcionamento da empresa e uma data, e devolvem o dimensionamento com a escala.

```
funcionamento + data
        │
        ▼
1. parâmetros legais da data ........ parametros.ts
2. turnos de cada dia ............... turnos.ts
3. piso de funcionários ............. dimensionamento.ts
4. escala ........................... escala.ts + rodizio.ts
5. validação ........................ escala.ts
6. reserva (férias, feriados...) .... dimensionamento.ts
        │
        ▼
quantos funcionários + quem trabalha quando
```

A entrada é `dimensionar(funcionamento, data, opcoes)`, em `dimensionamento.ts`. A tela chama essa função uma vez para cada fase da lei.

## 1. Parâmetros legais — `parametros.ts`

Uma tabela com data de início de vigência. `parametrosEm(data)` devolve a linha em vigor.

| Vigência | Teto semanal | Teto diário | Folgas por semana |
|---|---|---|---|
| até 15/12/2026 | 44h | 8h | 1 |
| 16/12/2026 a 15/12/2027 | 42h | 8h | 2 |
| a partir de 16/12/2027 | 40h | 8h | 2 |

A opção `cautelarStf` sobe o teto diário para 8h24 só na fase de 42h. Ela existe como opção porque vem de uma liminar que pode cair.

## 2. Turnos de cada dia — `turnos.ts`

Um `Turno` tem início, fim, minutos trabalhados, intervalo e papel. Os horários são minutos desde a 0h; o fim passa de 1440 quando o turno vira a madrugada.

Para cada dia da semana, o motor calcula duas listas.

**Turnos mínimos** (`turnosDoDia`): o menor conjunto de turnos que cobre o expediente com o número de postos pedido.

- *Posto vago no intervalo*: cada posto recebe o menor número de turnos seguidos em que o trabalho cabe no teto diário. Expediente de 9h às 18h vira um turno de 8h de trabalho com 1h de almoço.
- *Posto sempre coberto*: o motor compara duas saídas e fica com a de menos gente.
  - Os turnos longos acima, mais uma pessoa que assume os postos durante os almoços, escalonados em grupos de até 6.
  - Turnos de até 6h, que só têm a pausa de 15 minutos.
  - Com um posto e expediente de 9h às 18h, as duas dão 2 pessoas; fica a segunda (9h às 13h30 e 13h30 às 18h). Com três postos, a primeira dá 4 pessoas e a segunda 6; fica a primeira.

**Turnos cheios** (`turnosCheios`): os turnos mais longos que o teto diário permite, para um posto. Servem para completar a jornada de quem está escalado.

A regra do intervalo vem do art. 71 da CLT: mais de 6h de trabalho pede 1h; de 4h a 6h, 15 minutos. `almocos(turno)` devolve o mesmo turno com o almoço em cada hora cheia possível, deixando de 2h a 6h de trabalho antes e depois.

## 3. Piso de funcionários — `dimensionamento.ts`

Antes de montar a escala, o motor calcula o menor número possível de pessoas. É o maior entre quatro limites:

| Limite | Conta |
|---|---|
| Horas semanais | minutos de trabalho na semana ÷ teto semanal |
| Dias de repouso | turnos na semana ÷ dias que cada pessoa pode trabalhar |
| Jornada diária | o dia com mais turnos |
| Folga aos domingos | turnos de domingo × k ÷ (k − 1), com k = 2 ou 3 |

Todos arredondados para cima. Essa forma de dimensionar, pela pior entre demanda total, pico diário e folgas de fim de semana, é a de Burns e Carter (1985), citada no fim.

## 4. Escala — `escala.ts` e `rodizio.ts`

`gerarEscala` começa no piso e sobe uma pessoa por vez até conseguir uma escala válida. Para cada tamanho de equipe, tenta dois métodos, nesta ordem.

### 4.1 Rodízio de padrões (método principal)

É o modelo das planilhas de escala de revezamento. Tem duas etapas.

**Folgas** (`montarRodizio`, em `rodizio.ts`). Cada pessoa recebe um padrão semanal de folgas.

- *Empresa fechada aos domingos*: o domingo é folga de todos. As folgas que faltam vão para os dias com mais sobra de gente, de preferência coladas ao domingo (sábado ou segunda). Cada pessoa mantém o seu padrão toda semana.
- *Empresa aberta aos domingos*: o motor monta uma sequência circular de padrões, um por pessoa. A cada semana, cada pessoa passa para o padrão seguinte, de modo que em N semanas todos passaram pelos mesmos N padrões. A busca monta a sequência padrão a padrão e volta atrás quando trava, garantindo que:
  - sobra gente suficiente em cada dia;
  - ninguém passa de 6 dias seguidos de trabalho na virada de uma semana para a outra;
  - ninguém fica k domingos seguidos sem folga.
  
  Entre os padrões possíveis, prefere folgas em dias seguidos e dias com mais sobra, e faz a folga andar para trás na semana aos poucos.
- *Opção `rodizio`*: com a empresa fechada aos domingos, faz os padrões fixos trocarem de dono a cada semana. Aberta aos domingos, o rodízio é sempre ligado, porque a folga dominical precisa rodar.

**Turnos** (`porRodizio`, em `escala.ts`). Com as folgas definidas, para cada dia:

1. Quem trabalha no dia ocupa primeiro os turnos mínimos. Quem sobra entra num turno cheio.
2. Quem fez o horário mais cedo no último dia de trabalho pega a vaga mais cedo, para ninguém pular de tarde para manhã sem as 11h de descanso.
3. Se a semana de alguém passa do teto, os turnos além do mínimo encolhem ou viram folga.
4. Os turnos curtos crescem até o turno cheio enquanto a semana couber no teto. O intervalo fica fora do horário original, para o posto continuar ocupado.
5. Os almoços de quem trabalha no mesmo dia são espalhados por horas cheias, a partir do meio do turno.

O resultado só vale se o expediente não tiver nenhum trecho descoberto e, quando o tipo de escala não foi escolhido à mão, se não houver violação.

### 4.2 Distribuição gulosa (reserva)

Se o rodízio não fecha para um tamanho de equipe, o motor cai no método antigo: percorre os dias de um ciclo de k semanas e entrega cada turno a quem trabalhou menos dias na semana, respeitando os limites. Depois alonga turnos e dá turnos de reforço em dias livres. Sempre respeita as regras, mas as folgas saem espalhadas e sem padrão.

### 4.3 Tipo de escala

Sem escolha, as folgas por semana vêm da lei da fase: 1 antes da emenda, 2 depois. Com `tipo`, vêm do tipo:

| Tipo | Folgas por semana |
|---|---|
| 6x1 | 1 |
| 5x2 | 2 |
| 4x3 | 3 |

Quando o tipo é escolhido, a escala sai nele mesmo que descumpra a lei da fase, e as violações vêm listadas. É assim que a 6x1 aparece em vermelho depois de 16/12/2026.

## 5. Validação — `escala.ts`

`validar(grade, parametros, semanas, domingoACada)` confere uma grade e devolve as violações, cada uma com funcionário, dia, escopo (dia, semana ou ciclo), descrição e base legal. A grade é circular: o último dia do ciclo antecede o primeiro.

| Regra | Escopo | Base |
|---|---|---|
| Horas na semana acima do teto | semana | parâmetros da fase |
| Menos folgas na semana que o exigido | semana | parâmetros da fase |
| Horas no dia acima do teto | dia | parâmetros da fase |
| 7º dia seguido de trabalho | dia | OJ 410 da SDI-1 do TST |
| Menos de 11h desde o turno anterior | dia | CLT, art. 66 |
| k domingos seguidos sem folga | ciclo | Lei 10.101/2000, art. 6º; CLT, art. 386 |

`descobertos(turnos, expediente, postos, intervaloCoberto)` devolve os trechos do expediente com menos gente trabalhando do que o número de postos. A pausa de 15 minutos não conta como ausência; o almoço de 1h só conta se o posto precisa ficar coberto.

As duas funções servem ao gerador e à tela, que as roda a cada edição do gestor.

## 6. Reserva — `dimensionamento.ts`

A escala dá o número de pessoas **em operação**. A reserva soma quem cobre ausências ao longo do ano.

- **Férias**: 30 dias por pessoa.
- **Feriados nacionais**: 9 dias por pessoa, só se a empresa abre e compensa com folga em outro dia.
- **Afastamentos**: um percentual médio informado pelo gestor.

A conta procura a menor equipe em que, tirando os ausentes, ainda sobra o número em operação. Dias de ausência são arredondados para cima; afastamentos, para o inteiro mais próximo, então só pesam a partir de meia pessoa.

A escala final é gerada de novo com a equipe inteira, reserva incluída. Por isso os dias costumam ter mais gente escalada do que o mínimo.

## Premissas e limites

- **Todo mundo é CLT em tempo integral.** A escala leva cada pessoa o mais perto possível do teto semanal. Tempo parcial não é modelado.
- **Sem horas extras.**
- **A regra de domingo vale para a equipe toda**, mesmo que só parte seja de mulheres. Setores fora do comércio não têm regra própria.
- **O rodízio privilegia folgas juntas.** Com a empresa fechada aos domingos, isso concentra as folgas em sábado e segunda, e esses dias ficam com menos gente que o meio da semana.
- **O ciclo aberto aos domingos tem uma semana por pessoa.** Uma equipe de 15 tem um ciclo de 15 semanas.
- **6x1 com a empresa aberta aos domingos não fecha no rodízio.** Com uma folga por semana, quem folga num domingo só pode voltar a folgar no domingo seguinte sem passar de 6 dias seguidos. Nesse caso o motor cai na distribuição gulosa.
- **Só escalas semanais.** Escalas por ciclo de dias (4x2, 6x2, 5x1) e por plantão (12x36 e parecidas) não são montadas.
- **A escala não tem datas.** Não marca feriados nem férias de ninguém.
- **A busca do rodízio tem limite de tentativas.** Acima de 20 mil passos ela desiste, e o motor usa a distribuição gulosa.

## Referências

- Burns, R. N. e Carter, M. W. *Work Force Size and Single Shift Schedules with Variable Demands*. Management Science 31(5), 1985. Só o resumo foi lido: ele descreve o piso exato de funcionários com fins de semana de folga, cinco dias por semana e no máximo seis dias seguidos, e um algoritmo que constrói a escala. O rodízio daqui segue essa ideia, mas não é uma implementação do artigo.
- [RSW — gerador de escalas de revezamento (JOSS)](https://github.com/benjaminbolling/rsw): representa a escala como sequência de dias de trabalho e de folga e prefere folgas agrupadas. Visto só em resumo de busca.
- [Staffjoy autoscheduler](https://www.github.com/Staffjoy/autoscheduler): algoritmo de escala aberto. Visto só em resumo de busca.
- [Escala de revezamento (modelo) — Normas Legais](https://www.normaslegais.com.br/guia/clientes/escala-de-revezamento-modelo.htm) e [Escala de trabalho no Excel — Hashtag Treinamentos](https://www.hashtagtreinamentos.com/escala-de-trabalho-no-excel): formato das planilhas, com funcionários nas linhas, dias nas colunas e folgas em rodízio. Vistos só em resumo de busca.
