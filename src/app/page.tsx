"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { dimensionar, minutosAbertos, type Dia } from "@/regras/dimensionamento";
import { VIGENCIAS } from "@/regras/parametros";

const NOMES = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const PADRAO: Dia = { abre: "09:00", fecha: "18:00" };

function horas(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

function Opcao({
  titulo,
  detalhe,
  ...input
}: { titulo: string; detalhe: string } & React.ComponentProps<"input">) {
  return (
    <label className="flex items-start gap-2">
      <input className="mt-0.5 size-4 accent-primary" {...input} />
      <span>
        {titulo}
        <span className="block text-muted-foreground">{detalhe}</span>
      </span>
    </label>
  );
}

export default function Home() {
  const [dias, setDias] = useState<Dia[]>([null, PADRAO, PADRAO, PADRAO, PADRAO, PADRAO, PADRAO]);
  // Guarda o último horário de cada dia para devolvê-lo quando o dia for reaberto.
  const [ultimo, setUltimo] = useState<Dia[]>(Array(7).fill(PADRAO));
  const [postos, setPostos] = useState(1);
  const [cautelarStf, setCautelarStf] = useState(true);
  const [intervaloCoberto, setIntervaloCoberto] = useState(true);
  const [folgaDomingoACada, setFolgaDomingoACada] = useState<2 | 3>(3);
  const [cobrirFerias, setCobrirFerias] = useState(true);

  function mudarDia(i: number, dia: Dia) {
    setDias(dias.map((d, j) => (j === i ? dia : d)));
    if (dia) setUltimo(ultimo.map((d, j) => (j === i ? dia : d)));
  }

  const funcionamento = { dias, postos: Math.max(1, postos), intervaloCoberto, folgaDomingoACada, cobrirFerias };
  const fases = VIGENCIAS.map((v) => dimensionar(funcionamento, v.inicio, { cautelarStf }));
  const [antes, , final] = fases;
  const diferenca = final.minimo - antes.minimo;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-8 sm:py-16">
      <header className="max-w-2xl">
        <p className="text-sm font-medium tracking-wide text-primary uppercase">Fim da escala 6x1</p>
        <h1 className="mt-3 font-heading text-4xl leading-tight sm:text-5xl">
          Quantos funcionários sua empresa precisa com a nova lei?
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Informe o horário de funcionamento. O cálculo considera só funcionários CLT e os limites da
          Emenda Constitucional 141/2026.
        </p>
      </header>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_22rem]">
        <section className="rounded-xl border bg-card p-5 sm:p-6">
          <h2 className="font-heading text-xl">Horário de funcionamento</h2>

          <ul className="mt-4 divide-y">
            {NOMES.map((nome, i) => {
              const dia = dias[i];
              return (
                <li key={nome} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                  <label className="flex w-28 items-center gap-2 font-medium">
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      checked={!!dia}
                      onChange={(e) => mudarDia(i, e.target.checked ? ultimo[i] : null)}
                    />
                    {nome}
                  </label>
                  {dia ? (
                    <>
                      <div className="flex items-center gap-2">
                        <Input
                          type="time"
                          aria-label={`${nome}: abre às`}
                          className="w-28"
                          value={dia.abre}
                          onChange={(e) => e.target.value && mudarDia(i, { ...dia, abre: e.target.value })}
                        />
                        <span className="text-muted-foreground">às</span>
                        <Input
                          type="time"
                          aria-label={`${nome}: fecha às`}
                          className="w-28"
                          value={dia.fecha}
                          onChange={(e) => e.target.value && mudarDia(i, { ...dia, fecha: e.target.value })}
                        />
                      </div>
                      <span className="ml-auto text-sm text-muted-foreground tabular-nums">
                        {horas(minutosAbertos(dia))}
                      </span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">Fechado</span>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="mt-5 border-t pt-5">
            <Label htmlFor="postos">Pessoas trabalhando ao mesmo tempo</Label>
            <Input
              id="postos"
              type="number"
              min={1}
              className="mt-2 w-24"
              value={postos}
              onChange={(e) => setPostos(Number(e.target.value))}
            />
          </div>

          <fieldset className="mt-5 border-t pt-5">
            <legend className="float-left mb-3 w-full font-medium">Durante o intervalo de refeição</legend>
            <div className="clear-both space-y-2 text-sm">
              <Opcao
                type="radio"
                name="intervalo"
                checked={intervaloCoberto}
                onChange={() => setIntervaloCoberto(true)}
                titulo="Outra pessoa assume o posto"
                detalhe="A empresa nunca fica com menos gente do que o informado acima."
              />
              <Opcao
                type="radio"
                name="intervalo"
                checked={!intervaloCoberto}
                onChange={() => setIntervaloCoberto(false)}
                titulo="O posto fica vago"
                detalhe="A empresa fecha para o almoço, ou o dono cobre."
              />
            </div>
          </fieldset>

          {dias[0] && (
            <fieldset className="mt-5 border-t pt-5">
              <legend className="float-left mb-3 w-full font-medium">Folga aos domingos</legend>
              <div className="clear-both space-y-2 text-sm">
                <Opcao
                  type="radio"
                  name="domingo"
                  checked={folgaDomingoACada === 3}
                  onChange={() => setFolgaDomingoACada(3)}
                  titulo="1 domingo de folga a cada 3 semanas"
                  detalhe="Regra do comércio em geral (Lei 10.101/2000)."
                />
                <Opcao
                  type="radio"
                  name="domingo"
                  checked={folgaDomingoACada === 2}
                  onChange={() => setFolgaDomingoACada(2)}
                  titulo="1 domingo de folga a cada 2 semanas"
                  detalhe="Exigido para mulheres (CLT, art. 386), segundo o TST."
                />
              </div>
            </fieldset>
          )}

          <div className="mt-5 space-y-2 border-t pt-5 text-sm">
            <Opcao
              type="checkbox"
              checked={cobrirFerias}
              onChange={() => setCobrirFerias(!cobrirFerias)}
              titulo="Cobrir férias com a própria equipe"
              detalhe="Soma quem substitui os colegas nos 30 dias de férias de cada um."
            />
            <Opcao
              type="checkbox"
              checked={cautelarStf}
              onChange={() => setCautelarStf(!cautelarStf)}
              titulo="Permitir jornada de 8h24 na fase de 42h"
              detalhe="Liminar do STF, ainda pendente de julgamento no plenário."
            />
          </div>
        </section>

        <aside className="space-y-4">
          <div className="rounded-xl bg-primary p-6 text-primary-foreground">
            <p className="text-sm opacity-80">A partir de 16/12/2027 (40h semanais)</p>
            <p className="mt-2 font-heading text-7xl leading-none tabular-nums">{final.minimo}</p>
            <p className="mt-2 text-lg">
              {final.minimo === 1 ? "funcionário CLT, no mínimo" : "funcionários CLT, no mínimo"}
            </p>
            <p className="mt-4 border-t border-primary-foreground/20 pt-4 text-sm opacity-90">
              {final.paraFerias > 0 && `${final.emOperacao} em operação e ${final.paraFerias} para cobrir férias. `}
              {diferenca > 0
                ? `${diferenca} a mais do que na regra antiga (${antes.minimo}).`
                : "O mesmo número da regra antiga."}{" "}
              Limite que define: {final.limitante}.
            </p>
          </div>

          <ol className="rounded-xl border bg-card p-5">
            {fases.map((f) => (
              <li
                key={f.parametros.inicio}
                className="flex items-baseline justify-between gap-4 border-b py-3 first:pt-0 last:border-b-0 last:pb-0"
              >
                <div>
                  <p className="font-medium">{f.parametros.nome}</p>
                  <p className="text-sm text-muted-foreground">
                    {horas(f.parametros.tetoSemanalMin)} por semana · {horas(f.parametros.tetoDiarioMin)} por
                    dia · {f.parametros.repousosSemanais}{" "}
                    {f.parametros.repousosSemanais === 1 ? "folga" : "folgas"}
                  </p>
                </div>
                <p className="font-heading text-3xl tabular-nums">{f.minimo}</p>
              </li>
            ))}
          </ol>

          <p className="text-sm text-muted-foreground">
            {horas(final.coberturaMin)} de trabalho por semana. É um piso, sem horas extras: não monta a
            escala e não considera faltas, feriados nem afastamentos.
          </p>
        </aside>
      </div>
    </main>
  );
}
