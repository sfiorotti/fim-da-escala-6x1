import { parametrosEm, type Opcoes, type ParametrosLegais } from "./parametros";

/** Horário de um dia da semana, "HH:MM". `null` = fechado. Fechar antes de abrir = vira a madrugada. */
export type Dia = { abre: string; fecha: string } | null;

export type Funcionamento = {
  /** Sete dias, de domingo (0) a sábado (6). */
  dias: Dia[];
  /** Pessoas trabalhando ao mesmo tempo enquanto a empresa está aberta. */
  postos: number;
  /**
   * `true`: outra pessoa assume o posto durante o intervalo de refeição.
   * `false`: o posto fica vago (a empresa fecha para o almoço ou o dono cobre).
   * Padrão: `true`.
   */
  intervaloCoberto?: boolean;
  /**
   * De quantas em quantas semanas a folga de cada funcionário precisa cair no domingo.
   * 3 = comércio em geral (Lei 10.101/2000, art. 6º); 2 = mulheres (CLT, art. 386). Padrão: 3.
   */
  folgaDomingoACada?: 2 | 3;
  /** Soma à equipe quem cobre as férias dos colegas (CLT, art. 130). Padrão: `false`. */
  cobrirFerias?: boolean;
};

export type Limitante = "horas semanais" | "dias de repouso" | "jornada diária" | "folga aos domingos";

export type Dimensionamento = {
  parametros: ParametrosLegais;
  /** Minutos-pessoa de trabalho na semana. */
  coberturaMin: number;
  /** Turnos (pessoa-dia) necessários em cada dia da semana. */
  turnosPorDia: number[];
  /** Funcionários necessários com a equipe completa, sem horas extras. */
  emOperacao: number;
  /** Funcionários a mais para cobrir férias (0 se `cobrirFerias` for falso). */
  paraFerias: number;
  /** Mínimo de funcionários CLT: `emOperacao + paraFerias`. */
  minimo: number;
  /** Qual limite legal definiu `emOperacao`. */
  limitante: Limitante;
};

// CLT, art. 71: acima de 6h de trabalho, intervalo mínimo de 1h; de 4h a 6h, 15 min.
// O intervalo não conta como jornada.
const SEIS_HORAS = 6 * 60;
const QUATRO_HORAS = 4 * 60;

/** Intervalo devido a quem fica `permanencia` minutos no local, contando o próprio intervalo. */
function intervalo(permanencia: number): number {
  if (permanencia - 15 > SEIS_HORAS) return 60;
  return permanencia > QUATRO_HORAS ? 15 : 0;
}

function minutos(hora: string): number {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
}

export function minutosAbertos(dia: Dia): number {
  if (!dia) return 0;
  const duracao = minutos(dia.fecha) - minutos(dia.abre);
  return duracao > 0 ? duracao : duracao + 24 * 60;
}

/** Turnos e minutos de trabalho de um dia com `aberto` minutos de funcionamento. */
function dia(aberto: number, postos: number, tetoDiario: number, intervaloCoberto: boolean) {
  if (aberto === 0) return { turnos: 0, trabalho: 0 };

  if (intervaloCoberto) {
    // Os postos ficam sempre ocupados. Se alguém trabalha mais de 6h, precisa de
    // 1h de intervalo, e outra pessoa tem de estar lá para assumir o posto.
    const trabalho = aberto * postos;
    const substituto = aberto > SEIS_HORAS ? 1 : 0;
    return { turnos: Math.max(Math.ceil(trabalho / tetoDiario), postos + substituto), trabalho };
  }

  // O posto fica vago no intervalo: cada posto é dividido no menor número de
  // turnos iguais em que o trabalho de cada um cabe no teto diário.
  let turnos = 1;
  while (aberto / turnos - intervalo(aberto / turnos) > tetoDiario) turnos++;
  const trabalho = aberto - turnos * intervalo(aberto / turnos);
  return { turnos: turnos * postos, trabalho: trabalho * postos };
}

/** Tamanho da equipe para que `n` pessoas estejam disponíveis com férias de 30 dias por ano escalonadas. */
function comFerias(n: number): number {
  let equipe = n;
  while (equipe - Math.ceil((equipe * 30) / 365) < n) equipe++;
  return equipe;
}

/**
 * Mínimo de funcionários CLT para cobrir o horário de funcionamento sem horas extras.
 * É um piso: não monta a escala, e não considera faltas, feriados nem afastamentos.
 */
export function dimensionar(f: Funcionamento, data: string, opcoes: Opcoes = {}): Dimensionamento {
  const p = parametrosEm(data, opcoes);
  const porDia = f.dias.map((d) => dia(minutosAbertos(d), f.postos, p.tetoDiarioMin, f.intervaloCoberto ?? true));

  const coberturaMin = porDia.reduce((soma, d) => soma + d.trabalho, 0);
  const turnosPorDia = porDia.map((d) => d.turnos);
  const turnosSemana = turnosPorDia.reduce((soma, t) => soma + t, 0);

  // Cada pessoa trabalha no máximo (k - 1) de cada k domingos.
  const k = f.folgaDomingoACada ?? 3;

  const candidatos: { limitante: Limitante; n: number }[] = [
    { limitante: "horas semanais", n: Math.ceil(coberturaMin / p.tetoSemanalMin) },
    { limitante: "dias de repouso", n: Math.ceil(turnosSemana / (7 - p.repousosSemanais)) },
    { limitante: "jornada diária", n: Math.max(...turnosPorDia) },
    { limitante: "folga aos domingos", n: Math.ceil((turnosPorDia[0] * k) / (k - 1)) },
  ];
  const maior = candidatos.reduce((a, b) => (b.n > a.n ? b : a));

  const emOperacao = maior.n;
  const paraFerias = f.cobrirFerias ? comFerias(emOperacao) - emOperacao : 0;

  return {
    parametros: p,
    coberturaMin,
    turnosPorDia,
    emOperacao,
    paraFerias,
    minimo: emOperacao + paraFerias,
    limitante: maior.limitante,
  };
}
