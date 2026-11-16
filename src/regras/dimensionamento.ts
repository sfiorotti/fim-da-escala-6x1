import { type Escala, gerarEscala } from "./escala";
import { type Opcoes, type ParametrosLegais, parametrosEm } from "./parametros";
import { type Turno, turnosCheios, turnosDoDia } from "./turnos";

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
  /**
   * Feriados nacionais. "fecha": a empresa não abre. "folga": abre e dá folga em outro dia
   * (soma à equipe quem cobre essas folgas). "dobro": abre e paga em dobro (Lei 605/1949, art. 9º).
   * Padrão: "fecha".
   */
  feriados?: "fecha" | "folga" | "dobro";
  /** Fração da equipe afastada em média (atestados, licenças, faltas), de 0 a 0,5. Padrão: 0. */
  afastamentos?: number;
};

export type Limitante =
  | "horas semanais"
  | "dias de repouso"
  | "jornada diária"
  | "folga aos domingos"
  | "encaixe dos turnos";

export type Dimensionamento = {
  parametros: ParametrosLegais;
  /** Minutos-pessoa de trabalho na semana. */
  coberturaMin: number;
  /** Turnos de cada dia da semana, de domingo a sábado. */
  turnosDaSemana: Turno[][];
  /** Escala do ciclo, com os turnos distribuídos entre os `minimo` funcionários. */
  escala: Escala;
  /** Funcionários necessários com a equipe completa, sem horas extras. */
  emOperacao: number;
  /** Funcionários a mais para cobrir férias, folgas de feriado e afastamentos. */
  reserva: { ferias: number; feriados: number; afastamentos: number };
  /** Mínimo de funcionários CLT: `emOperacao` mais a reserva. */
  minimo: number;
  /** Qual limite definiu `emOperacao`. */
  limitante: Limitante;
};

const DIAS_DE_FERIAS = 30;
/** Leis 662/1949, 6.802/1980 e 14.759/2023: 1/1, 21/4, 1/5, 7/9, 12/10, 2/11, 15/11, 20/11 e 25/12. */
export const FERIADOS_NACIONAIS = 9;

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
 * Tamanho da equipe para que `n` pessoas estejam disponíveis quando cada uma se ausenta
 * `diasAusentes` por ano, de forma escalonada, e uma fração `taxa` está afastada em média.
 * Os afastamentos são arredondados: só pesam quando somam pelo menos meia pessoa.
 */
function equipe(n: number, diasAusentes: number, taxa: number): number {
  let tamanho = n;
  while (tamanho - Math.ceil((tamanho * diasAusentes) / 365) - Math.round(tamanho * taxa) < n) tamanho++;
  return tamanho;
}

/**
 * Funcionários CLT para cobrir o horário de funcionamento sem horas extras.
 * `emOperacao` vem de uma escala montada de verdade; a reserva é uma estimativa anual.
 */
export function dimensionar(f: Funcionamento, data: string, opcoes: Opcoes = {}): Dimensionamento {
  const p = parametrosEm(data, opcoes);
  const turnosDaSemana = f.dias.map((d) =>
    turnosDoDia(
      d ? minutos(d.abre) : 0,
      minutosAbertos(d),
      f.postos,
      p.tetoDiarioMin,
      f.intervaloCoberto ?? true,
    ),
  );

  const turnosPorDia = turnosDaSemana.map((t) => t.length);
  const turnosNaSemana = turnosPorDia.reduce((soma, t) => soma + t, 0);
  const coberturaMin = turnosDaSemana.flat().reduce((soma, t) => soma + t.trabalho, 0);

  // Cada pessoa trabalha no máximo (k - 1) de cada k domingos.
  const k = f.folgaDomingoACada ?? 3;

  const pisos: { limitante: Limitante; n: number }[] = [
    { limitante: "horas semanais", n: Math.ceil(coberturaMin / p.tetoSemanalMin) },
    { limitante: "dias de repouso", n: Math.ceil(turnosNaSemana / (7 - p.repousosSemanais)) },
    { limitante: "jornada diária", n: Math.max(...turnosPorDia) },
    { limitante: "folga aos domingos", n: Math.ceil((turnosPorDia[0] * k) / (k - 1)) },
  ];
  const piso = pisos.reduce((a, b) => (b.n > a.n ? b : a));

  const cheiosDaSemana = f.dias.map((d) =>
    turnosCheios(d ? minutos(d.abre) : 0, minutosAbertos(d), p.tetoDiarioMin),
  );
  const emOperacao = gerarEscala(turnosDaSemana, cheiosDaSemana, p, k, piso.n).funcionarios;

  const diasDeFerias = f.cobrirFerias ? DIAS_DE_FERIAS : 0;
  const diasDeFeriado = f.feriados === "folga" ? FERIADOS_NACIONAIS : 0;
  const taxa = Math.min(Math.max(f.afastamentos ?? 0, 0), 0.5);

  const comFerias = equipe(emOperacao, diasDeFerias, 0);
  const comFeriados = equipe(emOperacao, diasDeFerias + diasDeFeriado, 0);
  const minimo = equipe(emOperacao, diasDeFerias + diasDeFeriado, taxa);

  return {
    parametros: p,
    coberturaMin,
    turnosDaSemana,
    // A escala mostrada distribui os turnos pela equipe inteira, reserva incluída.
    escala: gerarEscala(turnosDaSemana, cheiosDaSemana, p, k, minimo),
    emOperacao,
    reserva: {
      ferias: comFerias - emOperacao,
      feriados: comFeriados - comFerias,
      afastamentos: minimo - comFeriados,
    },
    minimo,
    limitante: emOperacao > piso.n ? "encaixe dos turnos" : piso.limitante,
  };
}
