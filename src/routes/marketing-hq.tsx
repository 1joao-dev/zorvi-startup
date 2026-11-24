import { createFileRoute } from "@tanstack/react-router";
import { MarketingHQ } from "@/components/marketing-hq/MarketingHQ";
import "@/styles/marketing-hq.css";

export const Route = createFileRoute("/marketing-hq")({
  head: () => ({
    meta: [
      { title: "Marketing HQ | ZORVI" },
      { name: "description", content: "Central de operação, agentes de IA, tarefas e conhecimento supervisionado da ZORVI." },
      { name: "theme-color", content: "#090711" },
    ],
  }),
  component: MarketingHQ,
});
