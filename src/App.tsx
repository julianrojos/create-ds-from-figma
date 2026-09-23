import { AccordionItem } from "./components/AccordionItem";
import "./styles/tokens.css";
import "./styles/app.css";

export default function App() {
  return (
    <main className="app-shell">
      <section className="component-demo" aria-label="AccordionItem examples">
        <AccordionItem defaultOpen={false} />
        <AccordionItem defaultOpen />
      </section>
    </main>
  );
}
