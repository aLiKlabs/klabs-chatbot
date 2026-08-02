"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Globe2, Search, ShieldCheck } from "lucide-react";

type PreviewPage = {
  url: string;
  title: string;
  excerpt: string;
  characterCount: number;
};

export function WebsiteCrawler({ projectId, websiteUrl }: { projectId: string; websiteUrl: string }) {
  const router = useRouter();
  const [url, setUrl] = useState(websiteUrl);
  const [pages, setPages] = useState<PreviewPage[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<"preview" | "import">();
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string }>();

  async function preview() {
    setBusy("preview");
    setMessage(undefined);
    try {
      const response = await fetch(`/api/admin/projects/${projectId}/crawl/preview`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url, maxPages: 20 }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The website could not be previewed.");
      setPages(result.pages);
      setSelected(new Set(result.pages.map((page: PreviewPage) => page.url)));
      setMessage({ type: "success", text: `Found ${result.pages.length} readable page${result.pages.length === 1 ? "" : "s"}. Review the list before importing.` });
    } catch (error) {
      setPages([]);
      setSelected(new Set());
      setMessage({ type: "error", text: error instanceof Error ? error.message : "The website could not be previewed." });
    } finally {
      setBusy(undefined);
    }
  }

  function toggle(pageUrl: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(pageUrl)) next.delete(pageUrl); else next.add(pageUrl);
      return next;
    });
  }

  async function importPages() {
    setBusy("import");
    setMessage(undefined);
    try {
      const response = await fetch(`/api/admin/projects/${projectId}/crawl/import`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url, selectedUrls: [...selected] }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The website could not be imported.");
      setMessage({ type: "success", text: `${result.pageCount} page${result.pageCount === 1 ? "" : "s"} imported as ${result.chunkCount} knowledge chunks.` });
      setPages([]);
      setSelected(new Set());
      router.refresh();
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "The website could not be imported." });
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <article className="knowledge-entry-card crawler-card">
      <span className="entry-icon"><Globe2 size={20} /></span>
      <div><h2>Crawl the website</h2><p>Find readable pages on the project domain and choose which ones become chatbot knowledge.</p></div>
      <div className="crawler-input-row">
        <label className="field"><span>Website URL</span><input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com" /></label>
        <button className="button button-secondary" type="button" disabled={Boolean(busy) || !url.trim()} onClick={preview}><Search size={15} />{busy === "preview" ? "Checking…" : "Preview pages"}</button>
      </div>
      <div className="crawler-safety"><ShieldCheck size={14} /><span>Same-domain pages only · robots.txt respected · private networks and unsafe redirects blocked</span></div>
      {message && <p className={`form-message ${message.type}`}>{message.text}</p>}
      {pages.length > 0 && (
        <div className="crawler-preview">
          <div className="crawler-preview-heading">
            <strong>{selected.size} of {pages.length} pages selected</strong>
            <div><button type="button" onClick={() => setSelected(new Set(pages.map((page) => page.url)))}>Select all</button><button type="button" onClick={() => setSelected(new Set())}>Clear</button></div>
          </div>
          <div className="crawler-page-list">
            {pages.map((page) => (
              <label className={selected.has(page.url) ? "selected" : ""} key={page.url}>
                <input type="checkbox" checked={selected.has(page.url)} onChange={() => toggle(page.url)} />
                <span className="crawler-check"><Check size={12} /></span>
                <span><strong>{page.title}</strong><small>{page.url}</small><p>{page.excerpt}</p></span>
                <em>{page.characterCount.toLocaleString()} chars</em>
              </label>
            ))}
          </div>
          <button className="button button-primary crawler-import" type="button" disabled={Boolean(busy) || selected.size === 0} onClick={importPages}>{busy === "import" ? "Crawling and embedding…" : `Import ${selected.size} selected page${selected.size === 1 ? "" : "s"}`}</button>
        </div>
      )}
    </article>
  );
}
