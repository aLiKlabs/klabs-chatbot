"use client";

import { useMemo, useState } from "react";
import { Calculator, Coins, Database, RotateCcw, Sparkles } from "lucide-react";
import { calculateLunaCost, LUNA_PRICING } from "@/lib/openai/pricing";

type UsageCalculatorProps = {
  inputTokens: number;
  outputTokens: number;
  embeddingTokens: number;
  title?: string;
};

function formatCost(value: number) {
  if (value === 0) return "$0.000000";
  return `$${value.toFixed(value < 0.01 ? 6 : 4)}`;
}

function TokenInput({ label, value, max, onChange }: { label: string; value: number; max?: number; onChange: (value: number) => void }) {
  return <label className="usage-calculator-field"><span>{label}</span><input type="number" min="0" max={max} step="1" value={value} onChange={(event) => onChange(Math.max(0, Number(event.target.value) || 0))} /></label>;
}

export function UsageCalculator({ inputTokens, outputTokens, embeddingTokens, title = "Luna cost calculator" }: UsageCalculatorProps) {
  const actual = useMemo(() => ({ inputTokens, outputTokens, embeddingTokens }), [inputTokens, outputTokens, embeddingTokens]);
  const [inputs, setInputs] = useState(actual);
  const [cachedInputTokens, setCachedInputTokens] = useState(0);
  const [cacheWriteTokens, setCacheWriteTokens] = useState(0);
  const [multiplier, setMultiplier] = useState(1);
  const estimate = calculateLunaCost({ ...inputs, cachedInputTokens, cacheWriteTokens });
  const projected = estimate.totalCost * multiplier;

  function reset() {
    setInputs(actual);
    setCachedInputTokens(0);
    setCacheWriteTokens(0);
    setMultiplier(1);
  }

  return <section className="analytics-panel luna-usage-calculator">
    <header><div><p className="eyebrow">Interactive AI usage</p><h2>{title}</h2><p>Adjust any token count to preview cost. Cached reads and cache writes are included inside total input tokens.</p></div><span className="luna-model-badge"><Sparkles size={14} /> GPT-5.6 Luna</span></header>
    <div className="luna-rate-grid" aria-label="OpenAI standard short-context rates">
      <span><small>Input</small><strong>${LUNA_PRICING.inputPerMillion.toFixed(2)}</strong><i>/ 1M</i></span>
      <span><small>Cached input</small><strong>${LUNA_PRICING.cachedInputPerMillion.toFixed(2)}</strong><i>/ 1M</i></span>
      <span><small>Cache writes</small><strong>${LUNA_PRICING.cacheWritePerMillion.toFixed(2)}</strong><i>/ 1M</i></span>
      <span><small>Output</small><strong>${LUNA_PRICING.outputPerMillion.toFixed(2)}</strong><i>/ 1M</i></span>
      <span><small>Embeddings</small><strong>${LUNA_PRICING.embeddingPerMillion.toFixed(2)}</strong><i>/ 1M</i></span>
    </div>
    <div className="luna-calculator-body">
      <div className="luna-token-inputs">
        <TokenInput label="Total input tokens" value={inputs.inputTokens} onChange={(value) => setInputs((current) => ({ ...current, inputTokens: value }))} />
        <TokenInput label="Cached input tokens" value={cachedInputTokens} max={inputs.inputTokens} onChange={setCachedInputTokens} />
        <TokenInput label="Cache-write tokens" value={cacheWriteTokens} max={Math.max(0, inputs.inputTokens - cachedInputTokens)} onChange={setCacheWriteTokens} />
        <TokenInput label="Output tokens" value={inputs.outputTokens} onChange={(value) => setInputs((current) => ({ ...current, outputTokens: value }))} />
        <TokenInput label="Embedding tokens" value={inputs.embeddingTokens} onChange={(value) => setInputs((current) => ({ ...current, embeddingTokens: value }))} />
        <label className="usage-calculator-field"><span>Usage multiplier</span><select value={multiplier} onChange={(event) => setMultiplier(Number(event.target.value))}><option value="1">Current usage · 1×</option><option value="10">Growth preview · 10×</option><option value="100">Scale preview · 100×</option><option value="1000">Large scale · 1,000×</option></select></label>
      </div>
      <div className="luna-cost-summary">
        <span className="luna-cost-icon"><Calculator size={22} /></span><small>Projected total</small><strong>{formatCost(projected)}</strong><p>{multiplier.toLocaleString()}× the entered token usage</p>
        <ul>
          <li><span>Regular input</span><strong>{formatCost(estimate.inputCost * multiplier)}</strong></li>
          <li><span>Cached + cache writes</span><strong>{formatCost((estimate.cachedInputCost + estimate.cacheWriteCost) * multiplier)}</strong></li>
          <li><span>Output</span><strong>{formatCost(estimate.outputCost * multiplier)}</strong></li>
          <li><span>Embeddings</span><strong>{formatCost(estimate.embeddingCost * multiplier)}</strong></li>
        </ul>
        <button type="button" className="button button-secondary" onClick={reset}><RotateCcw size={13} /> Reset to recorded usage</button>
      </div>
    </div>
    <footer><Coins size={13} /><span>This is a transparent estimate using standard short-context Luna rates. Embeddings are calculated separately at the text-embedding-3-small rate.</span><Database size={13} /></footer>
  </section>;
}
