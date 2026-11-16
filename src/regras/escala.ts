import type { ParametrosLegais } from "./parametros";
import { montarRodizio } from "./rodizio";
import { almocos, type Turno } from "./turnos";

/** Turno (ou `null` = folga) de cada funcionário em cada dia do ciclo: `grade[funcionario][dia]`. */
export type Grade = (Turno | null)[][];

export type Violacao = {
  funcionario: number;
  /** Dia do ciclo em que o problema aparece; domingo da semana 1 = 0. */
  dia: number;
  /** Se o problema é do dia, da semana que começa em `dia`, ou do ciclo inteiro. */
  escopo: "dia" | "semana" | "ciclo";
  regra: string;
  base: string;
};

export type Escala = {
  /** Semanas até a escala se repetir. */
  semanas: number;
  /** De quantas em quantas semanas cada pessoa precisa folgar no domingo (2 ou 3). */
  domingoACada: number;
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
export function validar(
  grade: Grade,
  p: ParametrosLegais,
  semanas: number,
  domingoACada = semanas,
): Violacao[] {
  const total = semanas * 7;
  const violacoes: Violacao[] = [];

  grade.forEach((dias, funcionario) => {
    const violar = (dia: number, escopo: Violacao["escopo"], regra: string, base: string) =>
      violacoes.push({ funcionario, dia, escopo, regra, base });

    for (let semana = 0; semana < semanas; semana++) {
      const daSemana = dias.slice(semana * 7, semana * 7 + 7);
      const minutos = daSemana.reduce((soma, t) => soma + (t?.trabalho ?? 0), 0);
      const folgas = daSemana.filter((t) => !t).length;
      if (minutos > p.tetoSemanalMin) {
        violar(
          semana * 7,
          "semana",
          `${horas(minutos)} na semana, acima de ${horas(p.tetoSemanalMin)}`,
          p.base,
        );
      }
      if (folgas < p.repousosSemanais) {
        violar(
          semana * 7,
          "semana",
          `${folgas} ${folgas === 1 ? "folga" : "folgas"} na semana, abaixo de ${p.repousosSemanais}`,
          p.base,
        );
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
        violar(dia, "dia", `${horas(turno.trabalho)} no dia, acima de ${horas(p.tetoDiarioMin)}`, p.base);
      }
      if (seguidos === MAX_DIAS_SEGUIDOS + 1) {
        violar(dia, "dia", "7º dia seguido de trabalho", "OJ 410 da SDI-1 do TST");
      }
      const anterior = dias[(dia + total - 1) % total];
      if (anterior && turno.inicio + DIA - anterior.fim < INTERJORNADA) {
        violar(dia, "dia", "Menos de 11h de descanso desde o turno anterior", "CLT, art. 66");
      }
    }

    // Quem trabalha todos os dias nunca zera a contagem acima.
    if (dias.every(Boolean)) violar(0, "ciclo", "Nenhuma folga no ciclo", "OJ 410 da SDI-1 do TST");

    const trabalhaNoDomingo = (semana: number) => Boolean(dias[(semana % semanas) * 7]);
    const semFolga = Array.from({ length: semanas }, (_, inicio) =>
      Array.from({ length: domingoACada }, (_, i) => trabalhaNoDomingo(inicio + i)).every(Boolean),
    ).some(Boolean);
    if (semFolga) {
      violar(
        0,
        "ciclo",
        `${domingoACada} domingos seguidos sem folga`,
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
 * Alonga `turno` até o turno cheio que o contém, com o intervalo fora do horário original,
 * para que o posto continue ocupado nas horas em que já estava. `null` se não couber.
 */
function esticar(turno: Turno, cheios: Turno[]): Turno | null {
  const cheio = cheios.find((c) => c.inicio <= turno.inicio && turno.fim <= c.fim);
  if (!cheio || cheio.fim - cheio.inicio === turno.fim - turno.inicio) return null;

  const pausa = cheio.intervalo ? cheio.intervalo.fim - cheio.intervalo.inicio : 0;
  let intervalo: Turno["intervalo"] = null;
  if (pausa) {
    if (turno.fim + pausa <= cheio.fim) intervalo = { inicio: turno.fim, fim: turno.fim + pausa };
    else if (turno.inicio - pausa >= cheio.inicio)
      intervalo = { inicio: turno.inicio - pausa, fim: turno.inicio };
    else return null;
  }
  return { ...cheio, intervalo, papel: turno.papel };
}

/**
 * Leva cada funcionário o mais perto possível da jornada cheia, sem tirar ninguém de um posto:
 * primeiro alonga os turnos curtos, depois dá turnos de reforço nos dias livres com menos gente.
 * Funcionário CLT recebe o mês inteiro; uma escala com poucas horas não retrata o que a empresa paga.
 */
function preencher(
  grade: Grade,
  turnosDaSemana: Turno[][],
  cheiosDaSemana: Turno[][],
  p: ParametrosLegais,
  semanas: number,
): void {
  const total = semanas * 7;
  const cabe = (dias: (Turno | null)[]) => validar([dias], p, semanas).length === 0;

  for (const dias of grade) {
    for (let dia = 0; dia < total; dia++) {
      const atual = dias[dia];
      const maior = atual && esticar(atual, cheiosDaSemana[dia % 7]);
      if (!maior) continue;
      dias[dia] = maior;
      if (!cabe(dias)) dias[dia] = atual;
    }
  }

  const escalados = (dia: number) => grade.filter((dias) => dias[dia]).length;
  let mudou = true;
  // Um turno por pessoa a cada volta, para o reforço se espalhar pela equipe.
  while (mudou) {
    mudou = false;
    for (const dias of grade) {
      const livres = Array.from({ length: total }, (_, dia) => dia)
        .filter((dia) => !dias[dia] && turnosDaSemana[dia % 7].length > 0)
        .sort((a, b) => escalados(a) - escalados(b) || a - b);

      for (const dia of livres) {
        const cheios = cheiosDaSemana[dia % 7];
        const opcoes = [cheios[escalados(dia) % cheios.length], turnosDaSemana[dia % 7][0]];
        const serve = opcoes.find((turno) => {
          dias[dia] = { ...turno, papel: "reforço" };
          return cabe(dias);
        });
        if (serve) {
          mudou = true;
          break;
        }
        dias[dia] = null;
      }
    }
  }
}

/** Como as folgas são distribuídas. */
export type Regras = {
  /** De quantas em quantas semanas cada pessoa precisa folgar no domingo (2 ou 3). */
  domingoACada: number;
  /** Folgas de cada pessoa por semana: 2 na 5x2, 1 na 6x1, 3 na 4x3. */
  folgasPorSemana: number;
  /** Troca os padrões de folga entre a equipe a cada semana, mesmo quando poderiam ser fixos. */
  rodizio: boolean;
  /**
   * O gestor escolheu o tipo de escala. A escala sai nesse tipo mesmo que quebre a lei da fase,
   * com as violações listadas; sem isso, um resultado com violações é descartado.
   */
  tipoEscolhido: boolean;
};

/**
 * Escala no modelo das planilhas de revezamento: as folgas vêm de um padrão por pessoa (rodizio.ts),
 * e quem trabalha no dia ocupa primeiro os turnos mínimos; os demais entram em turnos cheios.
 * Devolve `null` se os padrões não fecham ou se o expediente fica descoberto.
 */
function porRodizio(
  turnosDaSemana: Turno[][],
  cheiosDaSemana: Turno[][],
  cobertura: Cobertura,
  p: ParametrosLegais,
  regras: Regras,
  n: number,
): Escala | null {
  const rodizio = montarRodizio(
    n,
    turnosDaSemana.map((turnos) => turnos.length),
    regras.folgasPorSemana,
    regras.domingoACada,
    regras.rodizio,
  );
  if (!rodizio) return null;

  const { semanas, folga } = rodizio;
  const total = semanas * 7;
  const grade: Grade = Array.from({ length: n }, () => Array(total).fill(null));

  for (let dia = 0; dia < total; dia++) {
    const minimos = turnosDaSemana[dia % 7];
    const cheios = cheiosDaSemana[dia % 7];
    if (minimos.length === 0) continue;

    // Quem fez o horário mais cedo no último dia de trabalho pega a vaga mais cedo, e assim por diante.
    const ultimoInicio = (f: number) => grade[f].findLast((t, d) => t && d < dia)?.inicio ?? 0;
    const presentes = grade
      .map((_, f) => f)
      .filter((f) => !folga[f][dia])
      .sort((a, b) => ultimoInicio(a) - ultimoInicio(b) || a - b);
    if (presentes.length < minimos.length) return null;

    const vagas = [...minimos];
    for (let i = 0; vagas.length < presentes.length; i++) {
      vagas.push({ ...cheios[i % cheios.length], papel: "reforço" });
    }
    vagas.sort((a, b) => a.inicio - b.inicio);
    presentes.forEach((f, i) => {
      grade[f][dia] = vagas[i];
    });
  }

  for (const dias of grade) {
    const noTeto = (dia: number) => {
      const semana = dias.slice(dia - (dia % 7), dia - (dia % 7) + 7);
      return semana.reduce((soma, t) => soma + (t?.trabalho ?? 0), 0) <= p.tetoSemanalMin;
    };
    // Se a semana passa do teto, os turnos além do mínimo encolhem ou viram folga.
    for (let dia = total - 1; dia >= 0; dia--) {
      if (dias[dia]?.papel !== "reforço" || noTeto(dia)) continue;
      dias[dia] = { ...turnosDaSemana[dia % 7][0], papel: "reforço" };
      if (!noTeto(dia)) dias[dia] = null;
    }
    // Depois, os turnos curtos crescem até o cheio enquanto a semana couber no teto.
    for (let dia = 0; dia < total; dia++) {
      const atual = dias[dia];
      const maior = atual && esticar(atual, cheiosDaSemana[dia % 7]);
      if (!maior) continue;
      dias[dia] = maior;
      if (!noTeto(dia)) dias[dia] = atual;
    }
  }
  escalonarAlmocos(grade, cobertura, semanas);

  const descoberto = grade[0].some((_, dia) => {
    const expediente = cobertura.expediente[dia % 7];
    const doDia = grade.flatMap((dias) => {
      const turno = dias[dia];
      return turno ? [turno] : [];
    });
    return (
      expediente !== null &&
      descobertos(doDia, expediente, cobertura.postos, cobertura.intervaloCoberto).length > 0
    );
  });
  const violacoes = validar(grade, p, semanas, regras.domingoACada);
  if (descoberto || (violacoes.length > 0 && !regras.tipoEscolhido)) return null;
  return { semanas, domingoACada: regras.domingoACada, funcionarios: n, grade, violacoes };
}

/** O que o expediente exige em cada dia da semana, para conferir se a escala o cobre. */
export type Cobertura = {
  /** Abertura e fechamento de cada dia, em minutos desde a 0h; `null` = fechado. */
  expediente: ({ inicio: number; fim: number } | null)[];
  postos: number;
  intervaloCoberto: boolean;
};

/**
 * Espalha os almoços de quem trabalha no mesmo dia por horas cheias, começando pelo meio do turno
 * e evitando que duas pessoas almocem juntas. Se o expediente ficar descoberto, o dia volta ao que era.
 */
function escalonarAlmocos(grade: Grade, c: Cobertura, semanas: number): void {
  for (let dia = 0; dia < semanas * 7; dia++) {
    const expediente = c.expediente[dia % 7];
    if (!expediente) continue;

    const originais = grade.map((dias) => dias[dia]);
    const ocupados: { inicio: number; fim: number }[] = [];

    for (const dias of grade) {
      const turno = dias[dia];
      if (!turno) continue;
      const meio = (turno.inicio + turno.fim) / 2;
      const peso = ({ intervalo }: Turno) =>
        intervalo
          ? [
              ocupados.filter((o) => o.inicio < intervalo.fim && intervalo.inicio < o.fim).length,
              Math.abs((intervalo.inicio + intervalo.fim) / 2 - meio),
              intervalo.inicio,
            ]
          : [0, 0, 0];
      const escolhido = almocos(turno).reduce((a, b) => (antes(peso(b), peso(a)) ? b : a));
      dias[dia] = escolhido;
      if (escolhido.intervalo) ocupados.push(escolhido.intervalo);
    }

    const doDia = grade.flatMap((dias) => {
      const turno = dias[dia];
      return turno ? [turno] : [];
    });
    if (descobertos(doDia, expediente, c.postos, c.intervaloCoberto).length > 0) {
      grade.forEach((dias, f) => {
        dias[dia] = originais[f];
      });
    }
  }
}

/**
 * Monta a escala com o menor número de funcionários possível, a partir de `minimo`.
 * Tenta primeiro o modelo de planilha (padrões de folga em rodízio). Se não fechar para aquela
 * equipe, cai na distribuição gulosa, turno a turno, num ciclo de `semanas` semanas; ela sempre
 * respeita as regras, mas espalha as folgas e pode pedir uma pessoa a mais do que o ótimo.
 */
export function gerarEscala(
  turnosDaSemana: Turno[][],
  cheiosDaSemana: Turno[][],
  cobertura: Cobertura,
  p: ParametrosLegais,
  regras: Regras,
  minimo: number,
): Escala {
  const semanas = regras.domingoACada;
  const turnosNaSemana = turnosDaSemana.reduce((soma, t) => soma + t.length, 0);
  if (turnosNaSemana === 0) {
    return { semanas, domingoACada: semanas, funcionarios: 0, grade: [], violacoes: [] };
  }

  // Com uma pessoa por turno e folga sobrando, a distribuição sempre fecha.
  const limite = Math.max(minimo, turnosNaSemana * 2);
  for (let n = Math.max(minimo, 1); ; n++) {
    const rodizio = porRodizio(turnosDaSemana, cheiosDaSemana, cobertura, p, regras, n);
    if (rodizio) return rodizio;
    // Com o tipo escolhido, insiste no rodízio com mais gente antes de desistir dele.
    if (regras.tipoEscolhido && n < limite) continue;

    const grade = distribuir(turnosDaSemana, n, p, semanas);
    if (!grade) continue;
    const violacoes = validar(grade, p, semanas);
    if (violacoes.length === 0) {
      preencher(grade, turnosDaSemana, cheiosDaSemana, p, semanas);
      escalonarAlmocos(grade, cobertura, semanas);
    }
    if (violacoes.length === 0 || n >= limite) {
      return { semanas, domingoACada: semanas, funcionarios: n, grade, violacoes };
    }
  }
}

/**
 * Trechos do expediente em que há menos gente trabalhando do que `postos`.
 * Pausas de 15 minutos não contam como ausência; o intervalo de 1h só conta se `intervaloCoberto`.
 */
export function descobertos(
  turnos: Turno[],
  expediente: { inicio: number; fim: number },
  postos: number,
  intervaloCoberto: boolean,
): { inicio: number; fim: number }[] {
  const ausente = (t: Turno, min: number) =>
    intervaloCoberto &&
    t.intervalo !== null &&
    t.intervalo.fim - t.intervalo.inicio >= 60 &&
    t.intervalo.inicio <= min &&
    min < t.intervalo.fim;
  const trabalhando = (min: number) =>
    turnos.filter((t) => t.inicio <= min && min < t.fim && !ausente(t, min)).length;

  const cortes = [expediente.inicio, expediente.fim];
  for (const t of turnos)
    cortes.push(t.inicio, t.fim, ...(t.intervalo ? [t.intervalo.inicio, t.intervalo.fim] : []));
  const pontos = [...new Set(cortes)]
    .filter((min) => min >= expediente.inicio && min <= expediente.fim)
    .sort((a, b) => a - b);

  const faltas: { inicio: number; fim: number }[] = [];
  for (let i = 0; i + 1 < pontos.length; i++) {
    if (trabalhando(pontos[i]) >= postos) continue;
    const ultima = faltas.at(-1);
    if (ultima?.fim === pontos[i]) ultima.fim = pontos[i + 1];
    else faltas.push({ inicio: pontos[i], fim: pontos[i + 1] });
  }
  return faltas;
}
