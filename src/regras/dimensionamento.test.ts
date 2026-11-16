import { describe, expect, test } from "bun:test";
import { dimensionar, minutosAbertos, type Funcionamento } from "./dimensionamento";
import { parametrosEm } from "./parametros";

// Loja de segunda a sábado, 9h às 18h, uma pessoa por vez.
const loja: Funcionamento = {
  dias: [null, ...Array(6).fill({ abre: "09:00", fecha: "18:00" })],
  postos: 1,
};

describe("parâmetros por vigência", () => {
  test("44h e 1 repouso até 15/12/2026", () => {
    const p = parametrosEm("2026-12-15");
    expect([p.tetoSemanalMin, p.repousosSemanais]).toEqual([44 * 60, 1]);
  });
  test("42h e 2 repousos a partir de 16/12/2026", () => {
    const p = parametrosEm("2026-12-16");
    expect([p.tetoSemanalMin, p.repousosSemanais]).toEqual([42 * 60, 2]);
  });
  test("40h a partir de 16/12/2027", () => {
    expect(parametrosEm("2027-12-16").tetoSemanalMin).toBe(40 * 60);
  });
  test("cautelar do STF só amplia o teto diário na fase de 42h", () => {
    expect(parametrosEm("2027-01-10", { cautelarStf: true }).tetoDiarioMin).toBe(504);
    expect(parametrosEm("2026-12-01", { cautelarStf: true }).tetoDiarioMin).toBe(480);
    expect(parametrosEm("2028-01-10", { cautelarStf: true }).tetoDiarioMin).toBe(480);
  });
});

describe("dimensionamento", () => {
  test("horário que vira a madrugada", () => {
    expect(minutosAbertos({ abre: "18:00", fecha: "02:00" })).toBe(480);
  });

  test("loja 6 dias: 2 funcionários antes da emenda", () => {
    // 54h de cobertura / 44h = 2; 12 turnos / 6 dias = 2
    expect(dimensionar(loja, "2026-12-01").minimo).toBe(2);
  });

  test("loja 6 dias: 3 funcionários com 2 repousos semanais", () => {
    // 12 turnos / 5 dias trabalháveis = 3
    const d = dimensionar(loja, "2026-12-16");
    expect(d.minimo).toBe(3);
    expect(d.limitante).toBe("dias de repouso");
  });

  test("8h por dia, 5 dias: 1 funcionário basta em qualquer fase", () => {
    const escritorio: Funcionamento = {
      dias: [null, ...Array(5).fill({ abre: "08:00", fecha: "16:00" }), null],
      postos: 1,
    };
    expect(dimensionar(escritorio, "2028-01-10").minimo).toBe(1);
  });

  test("postos multiplicam a necessidade", () => {
    // 36 turnos / 5 dias trabalháveis = 7,2 → 8
    expect(dimensionar({ ...loja, postos: 3 }, "2027-12-16").minimo).toBe(8);
  });

  test("aberto 24h todos os dias, 1 posto, regra final", () => {
    // 168h / 40h = 4,2 → 5; 21 turnos / 5 dias = 4,2 → 5
    const d = dimensionar({ dias: Array(7).fill({ abre: "00:00", fecha: "00:00" }), postos: 1 }, "2028-01-10");
    expect(d.minimo).toBe(5);
  });
});
