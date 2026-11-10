export function App() {
  return (
    <section>
      <Card title="x" />
    </section>
  );
}
function Card(props: { title: string }) {
  return <h1 {...props}>hi</h1>;
}
