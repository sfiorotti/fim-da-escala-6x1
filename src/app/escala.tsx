"use client";

import { useState } from "react";
import type { Dimensionamento } from "@/regras/dimensionamento";
import { descobertos, type Grade, validar } from "@/regras/escala";
import { almocos, type Turno } from "@/regras/turnos";

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function hora(min: number) {
  const m = min % (24 * 60);
  return m % 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}` : `${m / 60}h`;
}

function duracao(min: number) {
  return min % 60 ? `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}` : `${min / 60}h`;
}

function chave(t: Turno) {
  return `${t.inicio}-${t.fim}-${t.intervalo?.inicio ?? ""}`;
}

function rotulo(t: Turno) {
  const nome = t.intervalo && t.intervalo.fim - t.intervalo.inicio >= 60 ? "almoço" : "pausa";
  const intervalo = t.intervalo ? `, ${nome} ${hora(t.intervalo.inicio)} às ${hora(t.intervalo.fim)}` : "";
  return `${hora(t.inicio)} às ${hora(t.fim)}${intervalo}`;
}

function Celula({
  nome,
  turno,
  opcoes,
  violacoes,
  aoMudar,
}: {
  nome: string;
  turno: Turno | null;
  opcoes: Turno[];
  violacoes: string[];
  aoMudar: (turno: Turno | null) => void;
}) {
  // O turno atual pode não estar entre as opções do dia (foi alongado pelo gerador).
  const todas = turno && !opcoes.some((o) => chave(o) === chave(turno)) ? [turno, ...opcoes] : opcoes;
  const cor = violacoes.length ? "bg-destructive/10" : turno ? "bg-accent/60" : "";

  return (
    <td className={`border-l p-0 align-top ${cor}`}>
      <select
        aria-label={nome}
        className={`w-full cursor-pointer bg-transparent px-3 pt-2 font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring ${turno ? "" : "pb-2 font-normal text-muted-foreground"}`}
        value={turno ? chave(turno) : ""}
        onChange={(e) => aoMudar(todas.find((o) => chave(o) === e.target.value) ?? null)}
      >
        <option value="">Folga</option>
        {todas.map((o) => (
          <option key={chave(o)} value={chave(o)}>
            {rotulo(o)}
          </option>
        ))}
      </select>
      {turno && (
        <span className="block px-3 pb-2 text-xs whitespace-nowrap text-muted-foreground">
          {turno.papel === "cobre intervalos" && "cobre intervalos · "}
          {turno.intervalo &&
            `${turno.intervalo.fim - turno.intervalo.inicio >= 60 ? "almoço" : "pausa"} ${hora(turno.intervalo.inicio)} às ${hora(turno.intervalo.fim)} · `}
          {duracao(turno.trabalho)}
        </span>
      )}
      {violacoes.map((v) => (
        <span key={v} className="block px-3 pb-2 text-xs text-destructive">
          {v}
        </span>
      ))}
    </td>
  );
}

export function CalendarioEscala({ d }: { d: Dimensionamento }) {
  const { semanas } = d.escala;
  // `null` enquanto ninguém editou: aí vale a escala sugerida.
  const [edicao, setEdicao] = useState<Grade | null>(null);
  const grade = edicao ?? d.escala.grade;
  const [semana, setSemana] = useState(0);

  const editada = edicao !== null;
  const violacoes = validar(grade, d.parametros, semanas, d.escala.domingoACada);
  const de = (funcionario: number, escopo: string, dia: number) =>
    violacoes
      .filter((v) => v.funcionario === funcionario && v.escopo === escopo && v.dia === dia)
      .map((v) => `${v.regra} (${v.base})`);

  // Opções de turno de cada dia da semana: os mais longos primeiro, depois os do mínimo do dia.
  const opcoes = DIAS.map((_, i) => {
    const unicas = new Map<string, Turno>();
    for (const t of [...d.cheiosDaSemana[i], ...d.turnosDaSemana[i]].flatMap(almocos)) {
      if (!unicas.has(chave(t))) unicas.set(chave(t), { ...t, papel: "posto" });
    }
    return [...unicas.values()];
  });

  const faltas = Array.from({ length: semanas * 7 }, (_, dia) => {
    const expediente = d.expediente[dia % 7];
    if (!expediente) return [];
    const doDia = grade.flatMap((dias) => {
      const turno = dias[dia];
      return turno ? [turno] : [];
    });
    return descobertos(doDia, expediente, d.postos, d.intervaloCoberto);
  });
  const diasDescobertos = faltas.filter((f) => f.length > 0).length;

  function mudar(funcionario: number, dia: number, turno: Turno | null) {
    setEdicao(
      grade.map((dias, f) => (f === funcionario ? dias.map((t, i) => (i === dia ? turno : t)) : dias)),
    );
  }

  return (
    <section className="mt-8 rounded-xl border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-heading text-xl">
            {editada ? "Sua escala" : "Escala sugerida"} · {d.parametros.nome}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {d.minimo === 1 ? "1 funcionário" : `${d.minimo} funcionários`}
            {semanas === 1
              ? ", com a mesma escala toda semana. "
              : ` em um ciclo de ${semanas} semanas, que se repete. `}
            Clique num dia para trocar o turno ou dar folga.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {editada && (
            <button
              type="button"
              className="rounded-md border px-3 py-1.5 hover:bg-muted"
              onClick={() => setEdicao(null)}
            >
              Voltar à sugerida
            </button>
          )}
          <div className={`flex flex-wrap gap-1 rounded-lg bg-muted p-1 ${semanas === 1 ? "hidden" : ""}`}>
            {Array.from({ length: semanas }, (_, s) => (
              <button
                // biome-ignore lint/suspicious/noArrayIndexKey: as semanas não mudam de ordem
                key={s}
                type="button"
                aria-pressed={s === semana}
                onClick={() => setSemana(s)}
                className={`rounded-md px-3 py-1.5 ${s === semana ? "bg-card font-medium shadow-sm" : "text-muted-foreground"}`}
              >
                Semana {s + 1}
              </button>
            ))}
          </div>
        </div>
      </div>

      {grade.length === 0 ? (
        <p className="mt-5 text-muted-foreground">
          Marque ao menos um dia de funcionamento para ver a escala.
        </p>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[60rem] border-collapse text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="px-3 py-2 font-medium">Funcionário</th>
                {DIAS.map((dia) => (
                  <th key={dia} className="border-l px-3 py-2 font-medium">
                    {dia}
                  </th>
                ))}
                <th className="border-l px-3 py-2 font-medium">Na semana</th>
              </tr>
            </thead>
            <tbody>
              {grade.map((dias, f) => {
                const daSemana = dias.slice(semana * 7, semana * 7 + 7);
                const naSemana = de(f, "semana", semana * 7);
                return (
                  // biome-ignore lint/suspicious/noArrayIndexKey: os funcionários não mudam de ordem
                  <tr key={f} className="border-t">
                    <th className="px-3 py-2 text-left align-top font-medium whitespace-nowrap">
                      Funcionário {f + 1}
                      {de(f, "ciclo", 0).map((v) => (
                        <span
                          key={v}
                          className="block max-w-40 text-xs font-normal whitespace-normal text-destructive"
                        >
                          {v}
                        </span>
                      ))}
                    </th>
                    {DIAS.map((nome, i) => {
                      const dia = semana * 7 + i;
                      if (!d.expediente[i]) {
                        return (
                          <td key={nome} className="border-l px-3 py-2 align-top text-muted-foreground">
                            Fechado
                          </td>
                        );
                      }
                      return (
                        <Celula
                          key={nome}
                          nome={`Funcionário ${f + 1}, ${nome}, semana ${semana + 1}`}
                          turno={dias[dia]}
                          opcoes={opcoes[i]}
                          violacoes={de(f, "dia", dia)}
                          aoMudar={(turno) => mudar(f, dia, turno)}
                        />
                      );
                    })}
                    <td
                      className={`border-l px-3 py-2 align-top font-medium tabular-nums ${naSemana.length ? "bg-destructive/10" : ""}`}
                    >
                      {duracao(daSemana.reduce((soma, t) => soma + (t?.trabalho ?? 0), 0))}
                      <span className="block text-xs font-normal text-muted-foreground">
                        {daSemana.filter(Boolean).length} dias
                      </span>
                      {naSemana.map((v) => (
                        <span key={v} className="block max-w-40 text-xs font-normal text-destructive">
                          {v}
                        </span>
                      ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t text-muted-foreground">
                <th className="px-3 py-2 text-left align-top font-medium">Escalados</th>
                {DIAS.map((nome, i) => {
                  const dia = semana * 7 + i;
                  const escalados = grade.filter((dias) => dias[dia]).length;
                  return (
                    <td
                      key={nome}
                      className={`border-l px-3 py-2 align-top tabular-nums ${faltas[dia].length ? "bg-destructive/10" : ""}`}
                    >
                      {d.expediente[i] ? escalados : ""}
                      {faltas[dia].map((f) => (
                        <span key={f.inicio} className="block text-xs text-destructive">
                          descoberto {hora(f.inicio)} às {hora(f.fim)}
                        </span>
                      ))}
                    </td>
                  );
                })}
                <td className="border-l" />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <p
        className={`mt-4 text-sm ${violacoes.length || diasDescobertos ? "text-destructive" : "text-muted-foreground"}`}
      >
        {violacoes.length === 0 && diasDescobertos === 0
          ? "Conferido: jornada semanal e diária, folgas por semana, no máximo 6 dias seguidos, 11h entre jornadas, folga aos domingos e expediente coberto."
          : [
              violacoes.length > 0 &&
                `${violacoes.length} ${violacoes.length === 1 ? "regra descumprida" : "regras descumpridas"} no ciclo`,
              diasDescobertos > 0 &&
                `${diasDescobertos} ${diasDescobertos === 1 ? "dia" : "dias"} com o expediente descoberto no ciclo`,
            ]
              .filter(Boolean)
              .join(" e ")
              .concat(". Os pontos estão marcados em vermelho.")}
      </p>
    </section>
  );
}
