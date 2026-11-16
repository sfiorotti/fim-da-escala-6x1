"use client";

import { useState } from "react";
import type { Dimensionamento } from "@/regras/dimensionamento";
import type { Turno } from "@/regras/turnos";

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function hora(min: number) {
  const m = min % (24 * 60);
  return m % 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}` : `${m / 60}h`;
}

function Celula({ turno, violacoes }: { turno: Turno | null; violacoes: string[] }) {
  if (!turno) return <td className="border-l px-3 py-2 text-muted-foreground">Folga</td>;
  return (
    <td className={`border-l px-3 py-2 ${violacoes.length ? "bg-destructive/10" : "bg-accent/60"}`}>
      <span className="font-medium whitespace-nowrap">
        {hora(turno.inicio)} às {hora(turno.fim)}
      </span>
      <span className="block text-xs whitespace-nowrap text-muted-foreground">
        {turno.papel === "reforço" && "reforço · "}
        {turno.papel === "cobre intervalos" && "cobre intervalos · "}
        {turno.intervalo
          ? `intervalo ${hora(turno.intervalo.inicio)} às ${hora(turno.intervalo.fim)}`
          : "sem intervalo"}
      </span>
      {violacoes.map((v) => (
        <span key={v} className="block text-xs text-destructive">
          {v}
        </span>
      ))}
    </td>
  );
}

export function CalendarioEscala({ d }: { d: Dimensionamento }) {
  const { grade, semanas, violacoes } = d.escala;
  const [escolhida, setEscolhida] = useState(0);
  const semana = Math.min(escolhida, semanas - 1);

  return (
    <section className="mt-8 rounded-xl border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-heading text-xl">Escala sugerida · {d.parametros.nome}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {d.minimo === 1 ? "1 funcionário" : `${d.minimo} funcionários`} em um ciclo de {semanas} semanas,
            que se repete.
          </p>
        </div>
        <div className="flex gap-1 rounded-lg bg-muted p-1 text-sm">
          {Array.from({ length: semanas }, (_, s) => (
            <button
              // biome-ignore lint/suspicious/noArrayIndexKey: as semanas não mudam de ordem
              key={s}
              type="button"
              aria-pressed={s === semana}
              onClick={() => setEscolhida(s)}
              className={`rounded-md px-3 py-1.5 ${s === semana ? "bg-card font-medium shadow-sm" : "text-muted-foreground"}`}
            >
              Semana {s + 1}
            </button>
          ))}
        </div>
      </div>

      {grade.length === 0 ? (
        <p className="mt-5 text-muted-foreground">
          Marque ao menos um dia de funcionamento para ver a escala.
        </p>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[46rem] border-collapse text-sm">
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
              {grade.map((dias, f) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: os funcionários não mudam de ordem
                <tr key={f} className="border-t">
                  <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Funcionário {f + 1}</th>
                  {DIAS.map((nome, i) => {
                    const dia = semana * 7 + i;
                    return (
                      <Celula
                        key={nome}
                        turno={dias[dia]}
                        violacoes={violacoes
                          .filter((v) => v.funcionario === f && v.dia === dia)
                          .map((v) => `${v.regra} (${v.base})`)}
                      />
                    );
                  })}
                  <td className="border-l px-3 py-2 font-medium whitespace-nowrap tabular-nums">
                    {hora(
                      dias
                        .slice(semana * 7, semana * 7 + 7)
                        .reduce((soma, t) => soma + (t?.trabalho ?? 0), 0),
                    )}
                    <span className="block text-xs font-normal text-muted-foreground">
                      {dias.slice(semana * 7, semana * 7 + 7).filter(Boolean).length} dias
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t text-muted-foreground">
                <th className="px-3 py-2 text-left font-medium">Escalados</th>
                {DIAS.map((nome, i) => {
                  const escalados = grade.filter((dias) => dias[semana * 7 + i]).length;
                  const turnos = d.turnosDaSemana[i].length;
                  return (
                    <td key={nome} className="border-l px-3 py-2 tabular-nums">
                      {turnos === 0 ? "Fechado" : escalados}
                      {turnos > 0 && <span className="block text-xs">mínimo {turnos}</span>}
                    </td>
                  );
                })}
                <td className="border-l" />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <p className="mt-4 text-sm text-muted-foreground">
        {violacoes.length === 0
          ? "Conferido: jornada semanal e diária, folgas por semana, no máximo 6 dias seguidos, 11h entre jornadas e folga aos domingos."
          : `${violacoes.length} ponto(s) fora da regra, marcados em vermelho.`}
      </p>
    </section>
  );
}
