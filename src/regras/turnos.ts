// Monta os turnos de um dia a partir do horário de funcionamento.
// Base legal do intervalo: CLT, art. 71 (README.md, seção 5.2).

/** Minutos contados a partir da 0h do dia; `fim` passa de 1440 quando o turno vira a madrugada. */
export type Turno = {
  inicio: number;
  fim: number;
  /** Minutos trabalhados, já sem o intervalo. */
  trabalho: number;
  intervalo: { inicio: number; fim: number } | null;
  papel: "posto" | "cobre intervalos";
};

const SEIS_HORAS = 6 * 60;
const QUATRO_HORAS = 4 * 60;
/** Quantos intervalos de 1h seguidos uma mesma pessoa cobre sem passar de 6h de trabalho. */
const INTERVALOS_POR_SUBSTITUTO = 6;

/** Intervalo devido a quem fica `permanencia` minutos no local, contando o próprio intervalo. */
function intervaloDevido(permanencia: number): number {
  if (permanencia - 15 > SEIS_HORAS) return 60;
  return permanencia > QUATRO_HORAS ? 15 : 0;
}

/**
 * Divide o dia em `partes` turnos iguais e seguidos para cada posto.
 * Intervalos de 1h são escalonados em grupos de até 6 postos; com `comSubstitutos`,
 * cada grupo ganha uma pessoa que assume os postos durante esses intervalos.
 */
function emSequencia(
  abre: number,
  aberto: number,
  postos: number,
  partes: number,
  comSubstitutos: boolean,
): Turno[] {
  const turnos: Turno[] = [];
  for (let parte = 0; parte < partes; parte++) {
    const inicio = abre + Math.round((parte * aberto) / partes);
    const fim = abre + Math.round(((parte + 1) * aberto) / partes);
    const pausa = intervaloDevido(fim - inicio);
    const escalonado = pausa === 60;
    const porGrupo = escalonado ? INTERVALOS_POR_SUBSTITUTO : postos;

    for (let primeiro = 0; primeiro < postos; primeiro += porGrupo) {
      const noGrupo = Math.min(porGrupo, postos - primeiro);
      const janela = escalonado ? noGrupo * pausa : pausa;
      const inicioJanela = inicio + Math.round((fim - inicio - janela) / 2);

      for (let i = 0; i < noGrupo; i++) {
        const inicioPausa = inicioJanela + (escalonado ? i * pausa : 0);
        turnos.push({
          inicio,
          fim,
          trabalho: fim - inicio - pausa,
          intervalo: pausa ? { inicio: inicioPausa, fim: inicioPausa + pausa } : null,
          papel: "posto",
        });
      }
      if (escalonado && comSubstitutos) {
        turnos.push({
          inicio: inicioJanela,
          fim: inicioJanela + janela,
          trabalho: janela,
          intervalo: null,
          papel: "cobre intervalos",
        });
      }
    }
  }
  return turnos;
}

/**
 * Turnos necessários num dia com `aberto` minutos de funcionamento a partir de `abre`.
 *
 * Com o posto vago no intervalo, cada posto recebe o menor número de turnos que cabe no teto diário.
 * Com o posto sempre coberto, escolhe a opção com menos gente entre: esses mesmos turnos mais
 * substitutos que rendem os intervalos de 1h; ou turnos de até 6h, que só têm a pausa de 15 minutos.
 */
export function turnosDoDia(
  abre: number,
  aberto: number,
  postos: number,
  tetoDiario: number,
  intervaloCoberto: boolean,
): Turno[] {
  if (aberto === 0) return [];

  let partes = 1;
  while (aberto / partes - intervaloDevido(aberto / partes) > tetoDiario) partes++;
  let turnos = emSequencia(abre, aberto, postos, partes, intervaloCoberto);

  if (turnos.some((t) => t.papel === "cobre intervalos")) {
    const curtos = emSequencia(abre, aberto, postos, Math.ceil(aberto / SEIS_HORAS), false);
    if (curtos.length <= turnos.length) turnos = curtos;
  }
  return turnos.sort((a, b) => a.inicio - b.inicio || b.fim - a.fim);
}
