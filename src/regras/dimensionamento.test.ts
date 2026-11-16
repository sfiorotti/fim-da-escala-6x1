import { describe, expect, test } from "bun:test";
import { type Dia, dimensionar, type Funcionamento, minutosAbertos } from "./dimensionamento";
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
    // 54h de cobertura / 44h = 2; 12 turnos / 6 dias = 2
    expect(dimensionar(loja, ANTES).minimo).toBe(2);
  });

  test("loja 6 dias: 3 funcionários com 2 repousos semanais", () => {
    // 12 turnos / 5 dias trabalháveis = 3
    const d = dimensionar(loja, TRANSICAO);
    expect(d.minimo).toBe(3);
    expect(d.limitante).toBe("dias de repouso");
  });

  test("postos são cobertos em conjunto", () => {
    // 27h por dia / 8h = 4 pessoas por dia; 24 turnos / 5 dias = 5
    expect(dimensionar({ ...loja, postos: 3 }, FINAL).minimo).toBe(5);
  });

  test("aberto 24h todos os dias, 1 posto, regra final", () => {
    // 168h / 40h = 4,2 → 5; 21 turnos / 5 dias = 4,2 → 5
    expect(dimensionar(sempreAberto, FINAL).minimo).toBe(5);
  });
});

describe("intervalo de refeição (CLT, art. 71)", () => {
  test("posto coberto: 8h de funcionamento exigem um substituto no intervalo", () => {
    const d = dimensionar(escritorio, FINAL);
    expect(d.turnosPorDia[1]).toBe(2);
    expect(d.minimo).toBe(2);
  });

  test("posto vago no intervalo: uma pessoa cobre 8h de funcionamento trabalhando 7h", () => {
    const d = dimensionar({ ...escritorio, intervaloCoberto: false }, FINAL);
    expect(d.turnosPorDia[1]).toBe(1);
    expect(d.coberturaMin).toBe(5 * 7 * 60);
    expect(d.minimo).toBe(1);
  });

  test("posto vago: 9h de funcionamento cabem em um turno de 8h mais 1h de intervalo", () => {
    // 6 turnos / 5 dias trabalháveis = 2
    const d = dimensionar({ ...loja, intervaloCoberto: false }, FINAL);
    expect(d.turnosPorDia[1]).toBe(1);
    expect(d.minimo).toBe(2);
  });

  test("posto vago: 10h de funcionamento viram dois turnos de 5h com 15 min de intervalo", () => {
    const dezHoras: Funcionamento = {
      dias: [null, { abre: "08:00", fecha: "18:00" }, null, null, null, null, null],
      postos: 1,
      intervaloCoberto: false,
    };
    const d = dimensionar(dezHoras, FINAL);
    expect(d.turnosPorDia[1]).toBe(2);
    expect(d.coberturaMin).toBe(600 - 2 * 15);
  });

  test("até 6h de funcionamento não exigem substituto", () => {
    const manha: Funcionamento = {
      dias: [null, { abre: "08:00", fecha: "14:00" }, null, null, null, null, null],
      postos: 1,
    };
    expect(dimensionar(manha, FINAL).turnosPorDia[1]).toBe(1);
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

  test("24h com revezamento quinzenal: 3 turnos de domingo pedem 6 pessoas", () => {
    expect(dimensionar({ ...sempreAberto, folgaDomingoACada: 2 }, FINAL).minimo).toBe(6);
  });
});

describe("férias (CLT, art. 130)", () => {
  test("sem cobertura de férias, nada é somado", () => {
    expect(dimensionar(loja, FINAL).paraFerias).toBe(0);
  });

  test("3 em operação pedem 1 a mais para cobrir férias", () => {
    const d = dimensionar({ ...loja, cobrirFerias: true }, FINAL);
    expect([d.emOperacao, d.paraFerias, d.minimo]).toEqual([3, 1, 4]);
  });

  test("12 em operação pedem 2 a mais: com 13, alguém ainda ficaria de férias ao mesmo tempo", () => {
    // 24h, 3 postos: 72h por dia / 8h = 9 por dia; 63 turnos / 5 = 13; domingo 9 × 3/2 = 14
    const d = dimensionar({ ...sempreAberto, postos: 3, cobrirFerias: true }, FINAL);
    expect(d.emOperacao).toBe(14);
    expect(d.paraFerias).toBe(2);
  });
});
