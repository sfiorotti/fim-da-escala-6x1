import { describe, expect, test } from "bun:test";
import { type Dia, dimensionar, type Funcionamento, minutosAbertos } from "./dimensionamento";
import { descobertos, validar } from "./escala";
import { parametrosEm } from "./parametros";

const NOVE_AS_SEIS: Dia = { abre: "09:00", fecha: "18:00" };

// Loja de segunda a sábado, 9h às 18h, uma pessoa por vez.
const loja: Funcionamento = { dias: [null, ...Array(6).fill(NOVE_AS_SEIS)], postos: 1 };
// A mesma loja abrindo também aos domingos.
const lojaTodoDia: Funcionamento = { dias: Array(7).fill(NOVE_AS_SEIS), postos: 1 };
// Escritório de segunda a sexta, 8h às 16h.
const escritorio: Funcionamento = {
  dias: [null, ...Array(5).fill({ abre: "08:00", fecha: "16:00" }), null],
  postos: 1,
};
const sempreAberto: Funcionamento = { dias: Array(7).fill({ abre: "00:00", fecha: "00:00" }), postos: 1 };

const ANTES = "2026-12-01";
const TRANSICAO = "2026-12-16";
const FINAL = "2027-12-16";

describe("parâmetros por vigência", () => {
  test("44h e 1 repouso até 15/12/2026", () => {
    const p = parametrosEm("2026-12-15");
    expect([p.tetoSemanalMin, p.repousosSemanais]).toEqual([44 * 60, 1]);
  });
  test("42h e 2 repousos a partir de 16/12/2026", () => {
    const p = parametrosEm(TRANSICAO);
    expect([p.tetoSemanalMin, p.repousosSemanais]).toEqual([42 * 60, 2]);
  });
  test("40h a partir de 16/12/2027", () => {
    expect(parametrosEm(FINAL).tetoSemanalMin).toBe(40 * 60);
  });
  test("cautelar do STF só amplia o teto diário na fase de 42h", () => {
    expect(parametrosEm("2027-01-10", { cautelarStf: true }).tetoDiarioMin).toBe(504);
    expect(parametrosEm(ANTES, { cautelarStf: true }).tetoDiarioMin).toBe(480);
    expect(parametrosEm("2028-01-10", { cautelarStf: true }).tetoDiarioMin).toBe(480);
  });
});

describe("dimensionamento", () => {
  test("horário que vira a madrugada", () => {
    expect(minutosAbertos({ abre: "18:00", fecha: "02:00" })).toBe(480);
  });

  test("loja 6 dias: 2 funcionários antes da emenda", () => {
    expect(dimensionar(loja, ANTES).minimo).toBe(2);
  });

  test("loja 6 dias: 3 funcionários com 2 repousos semanais", () => {
    // 12 turnos / 5 dias trabalháveis = 3
    const d = dimensionar(loja, TRANSICAO);
    expect(d.minimo).toBe(3);
    expect(d.limitante).toBe("dias de repouso");
  });

  test("aberto 24h todos os dias: turnos de 6h, e a escala pede mais gente que o piso", () => {
    const d = dimensionar(sempreAberto, FINAL);
    expect(d.turnosDaSemana[0].length).toBe(4);
    expect(d.emOperacao).toBe(7);
    expect(d.limitante).toBe("encaixe dos turnos");
  });

  test("tudo fechado: nenhum funcionário", () => {
    expect(dimensionar({ dias: Array(7).fill(null), postos: 1 }, FINAL).minimo).toBe(0);
  });
});

describe("intervalo de refeição (CLT, art. 71)", () => {
  test("posto coberto, 1 posto: dois turnos seguidos de 4h30 em vez de um substituto de 1h", () => {
    const turnos = dimensionar(loja, FINAL).turnosDaSemana[1];
    expect(turnos.map((t) => [t.inicio, t.fim])).toEqual([
      [9 * 60, 13 * 60 + 30],
      [13 * 60 + 30, 18 * 60],
    ]);
  });

  test("posto coberto, 3 postos: três turnos inteiros e uma pessoa que rende os intervalos", () => {
    const d = dimensionar({ ...loja, postos: 3 }, FINAL);
    const turnos = d.turnosDaSemana[1];
    expect(turnos.map((t) => t.papel).sort()).toEqual(["cobre intervalos", "posto", "posto", "posto"]);
    // Intervalos escalonados: 12h, 13h e 14h; o substituto fica das 12h às 15h.
    expect(turnos.flatMap((t) => (t.intervalo ? [t.intervalo.inicio / 60] : []))).toEqual([12, 13, 14]);
    expect(turnos.find((t) => t.papel === "cobre intervalos")).toMatchObject({
      inicio: 12 * 60,
      fim: 15 * 60,
    });
    expect(d.minimo).toBe(5);
  });

  test("posto coberto: 8h de funcionamento pedem duas pessoas por dia", () => {
    const d = dimensionar(escritorio, FINAL);
    expect(d.turnosDaSemana[1].length).toBe(2);
    expect(d.minimo).toBe(2);
  });

  test("posto vago no intervalo: uma pessoa cobre 8h de funcionamento trabalhando 7h", () => {
    const d = dimensionar({ ...escritorio, intervaloCoberto: false }, FINAL);
    expect(d.turnosDaSemana[1].length).toBe(1);
    expect(d.coberturaMin).toBe(5 * 7 * 60);
    expect(d.minimo).toBe(1);
  });

  test("posto vago: 9h de funcionamento cabem em um turno de 8h mais 1h de intervalo", () => {
    const d = dimensionar({ ...loja, intervaloCoberto: false }, FINAL);
    expect(d.turnosDaSemana[1]).toMatchObject([
      { trabalho: 480, intervalo: { inicio: 13 * 60, fim: 14 * 60 } },
    ]);
    expect(d.minimo).toBe(2);
  });

  test("posto vago: 10h de funcionamento viram dois turnos de 5h com 15 min de intervalo", () => {
    const dezHoras: Funcionamento = {
      dias: [null, { abre: "08:00", fecha: "18:00" }, null, null, null, null, null],
      postos: 1,
      intervaloCoberto: false,
    };
    const d = dimensionar(dezHoras, FINAL);
    expect(d.turnosDaSemana[1].length).toBe(2);
    expect(d.coberturaMin).toBe(600 - 2 * 15);
  });

  test("até 6h de funcionamento não exigem substituto", () => {
    const manha: Funcionamento = {
      dias: [null, { abre: "08:00", fecha: "14:00" }, null, null, null, null, null],
      postos: 1,
    };
    expect(dimensionar(manha, FINAL).turnosDaSemana[1].length).toBe(1);
  });
});

describe("folga aos domingos", () => {
  test("fechado no domingo: a regra não interfere", () => {
    expect(dimensionar({ ...loja, folgaDomingoACada: 2 }, FINAL).minimo).toBe(3);
  });

  test("comércio (1 domingo de folga a cada 3): 2 turnos de domingo pedem 3 pessoas", () => {
    expect(dimensionar(lojaTodoDia, FINAL).minimo).toBe(3);
  });

  test("revezamento quinzenal (art. 386): 2 turnos de domingo pedem 4 pessoas", () => {
    const d = dimensionar({ ...lojaTodoDia, folgaDomingoACada: 2 }, FINAL);
    expect(d.minimo).toBe(4);
    expect(d.limitante).toBe("folga aos domingos");
  });
});

describe("reserva: férias, feriados e afastamentos", () => {
  test("sem opções, não há reserva", () => {
    expect(dimensionar(loja, FINAL).reserva).toEqual({ ferias: 0, feriados: 0, afastamentos: 0 });
  });

  test("3 em operação pedem 1 a mais para cobrir férias", () => {
    const d = dimensionar({ ...loja, cobrirFerias: true }, FINAL);
    expect([d.emOperacao, d.reserva.ferias, d.minimo]).toEqual([3, 1, 4]);
  });

  test("feriado com folga em outro dia pede 1 a mais quando não há reserva de férias", () => {
    expect(dimensionar({ ...loja, feriados: "folga" }, FINAL).reserva.feriados).toBe(1);
  });

  test("a reserva de férias já absorve as folgas de feriado numa equipe pequena", () => {
    const d = dimensionar({ ...loja, cobrirFerias: true, feriados: "folga" }, FINAL);
    expect(d.reserva).toEqual({ ferias: 1, feriados: 0, afastamentos: 0 });
  });

  test("fechar ou pagar em dobro no feriado não muda a equipe", () => {
    expect(dimensionar({ ...loja, feriados: "fecha" }, FINAL).minimo).toBe(3);
    expect(dimensionar({ ...loja, feriados: "dobro" }, FINAL).minimo).toBe(3);
  });

  test("afastamentos só pesam quando somam pelo menos meia pessoa", () => {
    // 3 pessoas × 5% = 0,15: nada. 15 pessoas × 5% = 0,75: uma a mais.
    expect(dimensionar({ ...loja, afastamentos: 0.05 }, FINAL).reserva.afastamentos).toBe(0);
    const grande = dimensionar({ ...loja, postos: 10, afastamentos: 0.05 }, FINAL);
    expect([grande.emOperacao, grande.reserva.afastamentos]).toEqual([15, 1]);
  });
});

describe("escala do ciclo", () => {
  const todas = [
    loja,
    lojaTodoDia,
    escritorio,
    sempreAberto,
    { ...loja, postos: 3 },
    { ...lojaTodoDia, folgaDomingoACada: 2 as const },
  ];

  test("a escala gerada não tem violações em nenhuma fase", () => {
    for (const f of todas) {
      for (const data of [ANTES, TRANSICAO, FINAL]) {
        expect(dimensionar(f, data).escala.violacoes).toEqual([]);
      }
    }
  });

  test("todo turno de todo dia do ciclo tem alguém escalado", () => {
    const d = dimensionar(lojaTodoDia, FINAL);
    const { grade, semanas } = d.escala;
    for (let dia = 0; dia < semanas * 7; dia++) {
      const escalados = grade.filter((dias) => dias[dia]).length;
      expect(escalados).toBeGreaterThanOrEqual(d.turnosDaSemana[dia % 7].length);
    }
  });

  test("cada funcionário da loja cumpre 5 dias de 8h por semana na regra final", () => {
    for (const f of [loja, { ...loja, cobrirFerias: true }]) {
      const { grade, semanas } = dimensionar(f, FINAL).escala;
      for (const dias of grade) {
        for (let s = 0; s < semanas; s++) {
          const semana = dias.slice(s * 7, s * 7 + 7).flatMap((t) => (t ? [t.trabalho] : []));
          expect(semana).toEqual([480, 480, 480, 480, 480]);
        }
      }
    }
  });

  test("turno alongado mantém o posto ocupado: o intervalo fica fora do horário original", () => {
    // O mínimo do dia são dois turnos, 9h às 13h30 e 13h30 às 18h.
    const { grade } = dimensionar(loja, FINAL).escala;
    const segunda = grade.flatMap((dias) => (dias[1] ? [dias[1]] : []));
    const trabalhando = (min: number) =>
      segunda.filter(
        (t) =>
          t.inicio <= min &&
          min < t.fim &&
          !(t.intervalo && t.intervalo.inicio <= min && min < t.intervalo.fim),
      ).length;
    for (let min = 9 * 60; min < 18 * 60; min += 15) expect(trabalhando(min)).toBeGreaterThanOrEqual(1);
  });

  test("antes da emenda, 2 funcionários chegam perto das 44h sem passar", () => {
    const { grade } = dimensionar(loja, ANTES).escala;
    for (const dias of grade) {
      const minutos = dias.slice(0, 7).reduce((soma, t) => soma + (t?.trabalho ?? 0), 0);
      expect(minutos).toBeGreaterThan(38 * 60);
      expect(minutos).toBeLessThanOrEqual(44 * 60);
    }
  });

  test("a escala usa a equipe inteira, reserva incluída", () => {
    const d = dimensionar({ ...loja, cobrirFerias: true }, FINAL);
    expect(d.escala.funcionarios).toBe(4);
    expect(d.escala.grade.every((dias) => dias.some(Boolean))).toBe(true);
    expect(d.escala.violacoes).toEqual([]);
  });

  test("o ciclo tem as semanas do revezamento de domingo", () => {
    expect(dimensionar(lojaTodoDia, FINAL).escala.semanas).toBe(3);
    expect(dimensionar({ ...lojaTodoDia, folgaDomingoACada: 2 }, FINAL).escala.semanas).toBe(2);
  });

  test("cada funcionário tem 2 folgas por semana na regra final", () => {
    const { grade, semanas } = dimensionar(lojaTodoDia, FINAL).escala;
    for (const dias of grade) {
      for (let s = 0; s < semanas; s++) {
        expect(dias.slice(s * 7, s * 7 + 7).filter((t) => !t).length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  test("o validador acusa quem trabalha os 7 dias", () => {
    const d = dimensionar(lojaTodoDia, FINAL);
    const turno = d.turnosDaSemana[1][0];
    const grade = [Array(21).fill(turno)];
    const regras = validar(grade, d.parametros, 3).map((v) => v.base);
    expect(regras).toContain("OJ 410 da SDI-1 do TST");
    expect(regras).toContain("Lei 10.101/2000, art. 6º; CLT, art. 386");
    expect(regras).toContain(d.parametros.base);
  });

  test("a escala gerada não deixa nenhum trecho do expediente descoberto", () => {
    for (const f of todas) {
      const d = dimensionar(f, FINAL);
      const { grade, semanas } = d.escala;
      for (let dia = 0; dia < semanas * 7; dia++) {
        const expediente = d.expediente[dia % 7];
        if (!expediente) continue;
        const doDia = grade.flatMap((dias) => {
          const turno = dias[dia];
          return turno ? [turno] : [];
        });
        expect(descobertos(doDia, expediente, d.postos, d.intervaloCoberto)).toEqual([]);
      }
    }
  });

  test("descobertos aponta o intervalo de quem trabalha sozinho, só se o posto precisa ficar coberto", () => {
    const turno = {
      inicio: 540,
      fim: 1080,
      trabalho: 480,
      intervalo: { inicio: 780, fim: 840 },
      papel: "posto" as const,
    };
    const expediente = { inicio: 540, fim: 1080 };
    expect(descobertos([turno], expediente, 1, true)).toEqual([{ inicio: 780, fim: 840 }]);
    expect(descobertos([turno], expediente, 1, false)).toEqual([]);
    expect(descobertos([], expediente, 1, true)).toEqual([expediente]);
  });

  test("o validador acusa menos de 11h entre jornadas", () => {
    const p = dimensionar(loja, FINAL).parametros;
    const noite = { inicio: 16 * 60, fim: 24 * 60, trabalho: 420, intervalo: null, papel: "posto" as const };
    const manha = { inicio: 6 * 60, fim: 12 * 60, trabalho: 345, intervalo: null, papel: "posto" as const };
    const grade = [[null, noite, manha, ...Array(18).fill(null)]];
    expect(validar(grade, p, 3)).toEqual([
      {
        funcionario: 0,
        dia: 2,
        escopo: "dia",
        regra: "Menos de 11h de descanso desde o turno anterior",
        base: "CLT, art. 66",
      },
    ]);
  });
});
