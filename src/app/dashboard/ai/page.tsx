import { Playground } from "./playground";

export default function AiPage() {
  return (
    <div>
      <h1 className="text-2xl font-heading font-bold mb-2">AI Playground</h1>
      <p className="text-sm text-gray-500 mb-6">
        Test the Sapiom-backed AI endpoints. Spend draws from this deployment&apos;s scoped agent wallet.
      </p>
      <Playground />
    </div>
  );
}
