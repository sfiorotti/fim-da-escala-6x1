import { parametrosEm, type Opcoes, type ParametrosLegais } from "./parametros";

/** Horário de um dia da semana, "HH:MM". `null` = fechado. Fechar antes de abrir = vira a madrugada. */
export type Dia = { abre: string; fecha: string } | null;

export type Funcionamento = {
  /** Sete dias, de domingo (0) a sábado (6). */
  dias: Dia[];
  /** Pessoas trabalhando ao mesmo tempo enquanto a empresa está aberta. */
  postos: number;
};

export type Dimensionamento = {
  parametros: ParametrosLegais;
  /** Minutos-pessoa de cobertura na semana. */
  coberturaMin: number;
  /** Turnos (pessoa-dia) necessários em cada dia da semana. */
  turnosPorDia: number[];
  /** Mínimo de funcionários CLT, sem horas extras. */
  minimo: number;
  /** Qual limite legal definiu o mínimo. */
  limitante: "horas semanais" | "dias de repouso" | "jornada diária";
};

function minutos(hora: string): number {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
}

export function minutosAbertos(dia: Dia): number {
  if (!dia) return 0;
  const duracao = minutos(dia.fecha) - minutos(dia.abre);
  return duracao > 0 ? duracao : duracao + 24 * 60;
}

/**
 * Mínimo de funcionários CLT para cobrir o horário de funcionamento sem horas extras.
 * É um piso: não considera cobertura do intervalo de refeição, férias, faltas
 * nem as regras de folga aos domingos.
 */
export function dimensionar(f: Funcionamento, data: string, opcoes: Opcoes = {}): Dimensionamento {
  const p = parametrosEm(data, opcoes);
  const abertos = f.dias.map(minutosAbertos);

  const coberturaMin = abertos.reduce((soma, m) => soma + m, 0) * f.postos;
  const turnosPorDia = abertos.map((m) => Math.ceil(m / p.tetoDiarioMin) * f.postos);
  const turnosSemana = turnosPorDia.reduce((soma, t) => soma + t, 0);

  const candidatos = [
    { limitante: "horas semanais", n: Math.ceil(coberturaMin / p.tetoSemanalMin) },
    { limitante: "dias de repouso", n: Math.ceil(turnosSemana / (7 - p.repousosSemanais)) },
    { limitante: "jornada diária", n: Math.max(...turnosPorDia) },
  ] as const;
  const maior = candidatos.reduce((a, b) => (b.n > a.n ? b : a));

  return { parametros: p, coberturaMin, turnosPorDia, minimo: maior.n, limitante: maior.limitante };
}
