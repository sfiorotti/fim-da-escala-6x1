import type { ParametrosLegais } from "./parametros";
import type { Turno } from "./turnos";

/** Turno (ou `null` = folga) de cada funcionário em cada dia do ciclo: `grade[funcionario][dia]`. */
export type Grade = (Turno | null)[][];

export type Violacao = {
  funcionario: number;
  /** Dia do ciclo em que o problema aparece; domingo da semana 1 = 0. */
  dia: number;
  regra: string;
  base: string;
};

export type Escala = {
  /** Semanas do ciclo, que se repete. Igual ao revezamento de domingo (2 ou 3). */
  semanas: number;
  funcionarios: number;
  grade: Grade;
  violacoes: Violacao[];
};

const INTERJORNADA = 11 * 60;
const MAX_DIAS_SEGUIDOS = 6;
const DIA = 24 * 60;

function horas(min: number): string {
  return min % 60 ? `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}` : `${min / 60}h`;
}

/** Confere a grade de um ciclo contra as regras legais. O ciclo se repete, então o último dia antecede o primeiro. */
export function validar(grade: Grade, p: ParametrosLegais, semanas: number): Violacao[] {
  const total = semanas * 7;
  const violacoes: Violacao[] = [];

  grade.forEach((dias, funcionario) => {
    const violar = (dia: number, regra: string, base: string) =>
      violacoes.push({ funcionario, dia, regra, base });

    for (let semana = 0; semana < semanas; semana++) {
      const daSemana = dias.slice(semana * 7, semana * 7 + 7);
      const minutos = daSemana.reduce((soma, t) => soma + (t?.trabalho ?? 0), 0);
      const folgas = daSemana.filter((t) => !t).length;
      if (minutos > p.tetoSemanalMin) {
        violar(semana * 7, `${horas(minutos)} na semana, acima de ${horas(p.tetoSemanalMin)}`, p.base);
      }
      if (folgas < p.repousosSemanais) {
        violar(semana * 7, `${folgas} folga(s) na semana, abaixo de ${p.repousosSemanais}`, p.base);
      }
    }

    let seguidos = 0;
    // Duas voltas no ciclo para contar sequências que atravessam o fim dele.
    for (let i = 0; i < total * 2; i++) {
      const dia = i % total;
      const turno = dias[dia];
      seguidos = turno ? seguidos + 1 : 0;
      if (!turno || i < total) continue;

      if (turno.trabalho > p.tetoDiarioMin) {
        violar(dia, `${horas(turno.trabalho)} no dia, acima de ${horas(p.tetoDiarioMin)}`, p.base);
      }
      if (seguidos === MAX_DIAS_SEGUIDOS + 1) {
        violar(dia, "7º dia seguido de trabalho", "OJ 410 da SDI-1 do TST");
      }
      const anterior = dias[(dia + total - 1) % total];
      if (anterior && turno.inicio + DIA - anterior.fim < INTERJORNADA) {
        violar(dia, "Menos de 11h de descanso desde o turno anterior", "CLT, art. 66");
      }
    }

    // Quem trabalha todos os dias nunca zera a contagem acima.
    if (dias.every(Boolean)) violar(0, "Nenhuma folga no ciclo", "OJ 410 da SDI-1 do TST");

    const domingos = dias.filter((t, dia) => t && dia % 7 === 0).length;
    if (domingos > semanas - 1) {
      violar(
        0,
        `Sem folga em nenhum domingo do ciclo de ${semanas} semanas`,
        "Lei 10.101/2000, art. 6º; CLT, art. 386",
      );
    }
  });

  return violacoes;
}

/** Ordem lexicográfica: `a` vem antes de `b`. */
function antes(a: number[], b: number[]): boolean {
  const i = a.findIndex((v, j) => v !== b[j]);
  return i >= 0 && a[i] < b[i];
}

/** Distribui os turnos entre `n` funcionários, dia a dia. Devolve `null` se algum turno fica sem ninguém. */
function distribuir(
  turnosDaSemana: Turno[][],
  n: number,
  p: ParametrosLegais,
  semanas: number,
): Grade | null {
  const total = semanas * 7;
  const grade: Grade = Array.from({ length: n }, () => Array(total).fill(null));

  for (let dia = 0; dia < total; dia++) {
    const inicioSemana = dia - (dia % 7);
    for (const turno of turnosDaSemana[dia % 7]) {
      let escolhido = -1;
      let menor: number[] = [];

      for (let f = 0; f < n; f++) {
        const dias = grade[f];
        if (dias[dia]) continue;

        const daSemana = dias.slice(inicioSemana, dia).filter((t) => t !== null);
        const minutos = daSemana.reduce((soma, t) => soma + t.trabalho, 0);
        if (daSemana.length >= 7 - p.repousosSemanais) continue;
        if (minutos + turno.trabalho > p.tetoSemanalMin) continue;

        const domingos = dias.filter((t, d) => t && d % 7 === 0).length;
        if (dia % 7 === 0 && domingos >= semanas - 1) continue;

        const anterior = dia > 0 ? dias[dia - 1] : null;
        if (anterior && turno.inicio + DIA - anterior.fim < INTERJORNADA) continue;

        let seguidos = 0;
        while (seguidos < dia && dias[dia - 1 - seguidos]) seguidos++;
        if (seguidos >= MAX_DIAS_SEGUIDOS) continue;

        // Prefere quem trabalhou menos dias na semana, depois menos domingos e menos dias no ciclo.
        const peso = [daSemana.length, domingos, dias.filter(Boolean).length, minutos];
        if (escolhido < 0 || antes(peso, menor)) {
          escolhido = f;
          menor = peso;
        }
      }

      if (escolhido < 0) return null;
      grade[escolhido][dia] = turno;
    }
  }
  return grade;
}

/**
 * Monta a escala do ciclo com o menor número de funcionários que a distribuição consegue,
 * a partir de `minimo`. A distribuição é gulosa: pode pedir uma pessoa a mais do que o ótimo.
 */
export function gerarEscala(
  turnosDaSemana: Turno[][],
  p: ParametrosLegais,
  semanas: number,
  minimo: number,
): Escala {
  const turnosNaSemana = turnosDaSemana.reduce((soma, t) => soma + t.length, 0);
  if (turnosNaSemana === 0) return { semanas, funcionarios: 0, grade: [], violacoes: [] };

  // Com uma pessoa por turno e folga sobrando, a distribuição sempre fecha.
  const limite = Math.max(minimo, turnosNaSemana * 2);
  for (let n = Math.max(minimo, 1); ; n++) {
    const grade = distribuir(turnosDaSemana, n, p, semanas);
    if (!grade) continue;
    const violacoes = validar(grade, p, semanas);
    if (violacoes.length === 0 || n >= limite) return { semanas, funcionarios: n, grade, violacoes };
  }
}
