// Parâmetros legais por período de vigência. Base legal: README.md, seções 2 e 3.
// São dados, não constantes: a lei muda em 16/12/2026 e em 16/12/2027.

export type ParametrosLegais = {
  /** Primeiro dia de vigência (AAAA-MM-DD). */
  inicio: string;
  nome: string;
  tetoSemanalMin: number;
  tetoDiarioMin: number;
  repousosSemanais: number;
  base: string;
};

export const VIGENCIAS: ParametrosLegais[] = [
  {
    inicio: "0000-01-01",
    nome: "Antes da EC 141",
    tetoSemanalMin: 44 * 60,
    tetoDiarioMin: 8 * 60,
    repousosSemanais: 1,
    base: "CF, art. 7º, XIII e XV (redação anterior)",
  },
  {
    inicio: "2026-12-16",
    nome: "Transição (42h)",
    tetoSemanalMin: 42 * 60,
    tetoDiarioMin: 8 * 60,
    repousosSemanais: 2,
    base: "EC 141/2026, arts. 6º, I, e 10, I",
  },
  {
    inicio: "2027-12-16",
    nome: "Regra final (40h)",
    tetoSemanalMin: 40 * 60,
    tetoDiarioMin: 8 * 60,
    repousosSemanais: 2,
    base: "EC 141/2026, art. 6º, II",
  },
];

/** Jornada de até 8h24 na fase de 42h: cautelar do STF (ADIs 8.041/8.042), pendente de referendo. */
const TETO_DIARIO_CAUTELAR_MIN = 8 * 60 + 24;

export type Opcoes = {
  /** Aplica as 8h24 diárias da cautelar do STF na fase de 42h. Pode cair no plenário. */
  cautelarStf?: boolean;
};

export function parametrosEm(data: string, opcoes: Opcoes = {}): ParametrosLegais {
  const vigente = VIGENCIAS.findLast((v) => v.inicio <= data) ?? VIGENCIAS[0];
  if (opcoes.cautelarStf && vigente.tetoSemanalMin === 42 * 60) {
    return { ...vigente, tetoDiarioMin: TETO_DIARIO_CAUTELAR_MIN };
  }
  return vigente;
}
