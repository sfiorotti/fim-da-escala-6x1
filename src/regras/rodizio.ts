// Folgas da equipe no modelo das planilhas de escala de revezamento: cada pessoa tem um padrão
// semanal de folgas, de preferência em dias seguidos. Se a empresa abre aos domingos, os padrões
// rodam entre a equipe a cada semana, de modo que todos passam por todos (escala cíclica).
// A ideia de dimensionar pela pior entre demanda total, pico diário e folgas de fim de semana, e de
// construir a escala a partir dos dias de folga, vem de Burns e Carter (Management Science, 1985).

export type Rodizio = {
  /** Semanas até a escala se repetir: 1 com folgas fixas, ou o tamanho da equipe quando roda. */
  semanas: number;
  /** `folga[funcionario][dia do ciclo]`. */
  folga: boolean[][];
};

const MAX_DIAS_SEGUIDOS = 6;
/** Limite de tentativas ao ordenar os padrões; acima disso, desiste e quem chamou usa outro método. */
const MAX_PASSOS = 20_000;

function combinacoes(dias: number[], tamanho: number): number[][] {
  if (tamanho === 0) return [[]];
  return dias.flatMap((dia, i) =>
    combinacoes(dias.slice(i + 1), tamanho - 1).map((resto) => [dia, ...resto]),
  );
}

/** Em quantos grupos de dias seguidos as folgas se dividem. `circular`: sábado emenda no domingo. */
function grupos(folgas: number[], circular: boolean): number {
  const soltos = folgas.filter((dia) => !folgas.includes(dia - 1)).length;
  return circular && soltos > 1 && folgas.includes(0) && folgas.includes(6) ? soltos - 1 : soltos;
}

/** Ordem lexicográfica: `a` vem antes de `b`. */
function antes(a: number[], b: number[]): boolean {
  const i = a.findIndex((v, j) => v !== b[j]);
  return i >= 0 && a[i] < b[i];
}

/**
 * Um padrão fixo de folgas (dias 0 a 6) por pessoa, para quando a empresa fecha aos domingos. Os dias fechados são folga de todos; as folgas que
 * faltam vão para os dias com mais sobra de gente, juntas sempre que der.
 */
function padroes(n: number, minimoPorDia: number[], folgasPorSemana: number): number[][] | null {
  const dias = [0, 1, 2, 3, 4, 5, 6];
  const fechados = dias.filter((dia) => minimoPorDia[dia] === 0);
  const abertos = dias.filter((dia) => minimoPorDia[dia] > 0);
  const opcoes = combinacoes(
    abertos,
    Math.min(Math.max(0, folgasPorSemana - fechados.length), abertos.length),
  );

  const deFolga = Array<number>(7).fill(0);
  const linhas: number[][] = [];
  for (let i = 0; i < n; i++) {
    let melhor: number[] | null = null;
    let menor: number[] = [];
    for (const opcao of opcoes) {
      const sobras = opcao.map((dia) => n - minimoPorDia[dia] - deFolga[dia] - 1);
      if (sobras.some((sobra) => sobra < 0)) continue;
      const folgas = [...fechados, ...opcao].sort((a, b) => a - b);
      const peso = [grupos(folgas, true), -Math.min(n, ...sobras), ...opcao];
      if (!melhor || antes(peso, menor)) {
        melhor = folgas;
        menor = peso;
      }
    }
    if (!melhor) return null;
    for (const dia of melhor) deFolga[dia]++;
    linhas.push(melhor);
  }
  return linhas;
}

/**
 * Padrões de folga na ordem em que se sucedem semana a semana, para quando a empresa abre aos
 * domingos. Monta a sequência padrão a padrão, voltando atrás quando trava, de modo que ninguém
 * passe de 6 dias seguidos de trabalho nem fique `domingoACada` domingos seguidos sem folga.
 * A sequência é circular: depois do último padrão vem o primeiro.
 */
function sequencia(
  n: number,
  minimoPorDia: number[],
  folgasPorSemana: number,
  domingoACada: number,
): number[][] | null {
  const dias = [0, 1, 2, 3, 4, 5, 6];
  const opcoes = combinacoes(dias, Math.min(folgasPorSemana, 6));
  const emenda = (a: number[], b: number[]) => 6 - Math.max(...a) + Math.min(...b) <= MAX_DIAS_SEGUIDOS;
  const semDomingoNoFim = (ordem: number[][]) => {
    let semanas = 0;
    while (semanas < ordem.length && !ordem[ordem.length - 1 - semanas].includes(0)) semanas++;
    return semanas;
  };

  const deFolga = Array<number>(7).fill(0);
  const ordem: number[][] = [];
  let passos = 0;

  const buscar = (): boolean => {
    if (ordem.length === n) {
      const semDomingoNoInicio = ordem.findIndex((linha) => linha.includes(0));
      return emenda(ordem[n - 1], ordem[0]) && semDomingoNoInicio + semDomingoNoFim(ordem) < domingoACada;
    }
    if (++passos > MAX_PASSOS) return false;

    const anterior = ordem[ordem.length - 1];
    const candidatos = opcoes
      // O primeiro padrão folga no domingo: assim o último sempre emenda nele.
      .filter((folgas) => (anterior ? emenda(anterior, folgas) : folgas.includes(0)))
      .filter((folgas) => folgas.every((dia) => deFolga[dia] < n - minimoPorDia[dia]))
      .map((folgas) => ({
        folgas,
        peso: [
          grupos(folgas, false),
          -Math.min(...folgas.map((dia) => n - minimoPorDia[dia] - deFolga[dia])),
          // A folga anda para trás na semana, um pouco de cada vez.
          anterior ? Math.max(...anterior) - folgas[0] : 0,
          ...folgas,
        ],
      }))
      .sort((a, b) => (antes(a.peso, b.peso) ? -1 : 1));

    for (const { folgas } of candidatos) {
      ordem.push(folgas);
      for (const dia of folgas) deFolga[dia]++;
      if (semDomingoNoFim(ordem) < domingoACada && buscar()) return true;
      for (const dia of folgas) deFolga[dia]--;
      ordem.pop();
    }
    return false;
  };

  return buscar() ? ordem : null;
}

/**
 * Folgas de `n` pessoas para um mínimo de gente por dia da semana (domingo a sábado).
 * Fechada aos domingos, a empresa pode ter folgas fixas ou, com `rodar`, trocar os padrões entre a
 * equipe a cada semana. Aberta aos domingos, os padrões sempre rodam, por causa da folga dominical.
 * Devolve `null` quando não há padrões que fechem a conta; quem chama decide o que fazer.
 */
export function montarRodizio(
  n: number,
  minimoPorDia: number[],
  folgasPorSemana: number,
  domingoACada: number,
  rodar: boolean,
): Rodizio | null {
  const abreDomingo = minimoPorDia[0] > 0;
  const ordem = abreDomingo
    ? sequencia(n, minimoPorDia, folgasPorSemana, domingoACada)
    : // Todos folgam no domingo, então qualquer ordem emenda. A outra folga anda para trás na semana.
      padroes(n, minimoPorDia, folgasPorSemana)?.sort((a, b) => (antes(b, a) ? -1 : 1));
  if (!ordem) return null;

  const semanas = abreDomingo || rodar ? n : 1;
  return {
    semanas,
    folga: Array.from({ length: n }, (_, funcionario) =>
      Array.from({ length: semanas * 7 }, (_, dia) =>
        ordem[(funcionario + Math.floor(dia / 7)) % n].includes(dia % 7),
      ),
    ),
  };
}
