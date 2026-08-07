"use client";

import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, HelpCircle, UploadCloud } from "lucide-react";
import {
  addFaqSource,
  addManualSource,
  type KnowledgeActionState,
} from "@/app/actions/knowledge";
import { WebsiteCrawler } from "@/components/forms/website-crawler";
import { readApiPayload } from "@/lib/http/api-response";

const initialState: KnowledgeActionState = {};

function FormMessage({ state }: { state: KnowledgeActionState }) {
  if (state.error) return <p className="form-message error">{state.error}</p>;
  if (state.success) return <p className="form-message success">{state.success}</p>;
  return null;
}

export function KnowledgeForms({ projectId, websiteUrl }: { projectId: string; websiteUrl: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [manualState, manualAction, manualPending] = useActionState(
    addManualSource.bind(null, projectId),
    initialState,
  );
  const [faqState, faqAction, faqPending] = useActionState(
    addFaqSource.bind(null, projectId),
    initialState,
  );
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<{ type: "error" | "success"; text: string }>();

  async function uploadFile(file: File) {
    setUploading(true);
    setUploadMessage(undefined);
    let sourceId: string | undefined;
    try {
      const upload = new FormData();
      upload.set("file", file);
      const prepare = await fetch(`/api/admin/projects/${projectId}/upload-url`, {
        method: "POST",
        body: upload,
      });
      const prepared = await readApiPayload<{ sourceId: string; error?: string }>(prepare);
      sourceId = prepared.sourceId;
      const processResponse = await fetch(`/api/admin/projects/${projectId}/process`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sourceId }),
      });
      const result = await readApiPayload<{ chunkCount: number; error?: string }>(processResponse);
      setUploadMessage({
        type: "success",
        text: `${file.name} is ready with ${result.chunkCount} knowledge chunk${result.chunkCount === 1 ? "" : "s"}.`,
      });
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch (error) {
      setUploadMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Upload failed.",
      });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="knowledge-entry-grid">
      <WebsiteCrawler projectId={projectId} websiteUrl={websiteUrl} />
      <article className="knowledge-entry-card upload-card">
        <span className="entry-icon"><UploadCloud size={20} /></span>
        <div><h2>Upload a document</h2><p>PDF, DOCX, TXT, or Markdown · up to 20 MB</p></div>
        <label className={`upload-drop ${uploading ? "busy" : ""}`}>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.docx,.txt,.md,.markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
            disabled={uploading}
            onChange={(event) => event.target.files?.[0] && uploadFile(event.target.files[0])}
          />
          <UploadCloud size={25} />
          <strong>{uploading ? "Extracting and embedding…" : "Choose a document"}</strong>
          <small>The file stays in private project storage.</small>
        </label>
        {uploadMessage && <p className={`form-message ${uploadMessage.type}`}>{uploadMessage.text}</p>}
      </article>

      <article className="knowledge-entry-card">
        <span className="entry-icon"><FileText size={20} /></span>
        <div><h2>Add text</h2><p>Policies, service details, guides, or other verified copy.</p></div>
        <form action={manualAction} className="compact-form">
          <label className="field"><span>Source name</span><input name="name" maxLength={140} placeholder="e.g. Returns policy" required />{manualState.fieldErrors?.name?.map((error) => <small className="field-error" key={error}>{error}</small>)}</label>
          <label className="field"><span>Content</span><textarea name="content" rows={5} maxLength={500000} placeholder="Paste the approved content here…" required />{manualState.fieldErrors?.content?.map((error) => <small className="field-error" key={error}>{error}</small>)}</label>
          <FormMessage state={manualState} />
          <button className="button button-primary" disabled={manualPending}>{manualPending ? "Embedding…" : "Add to knowledge"}</button>
        </form>
      </article>

      <article className="knowledge-entry-card">
        <span className="entry-icon"><HelpCircle size={20} /></span>
        <div><h2>Add an FAQ</h2><p>Store a verified question-and-answer pair.</p></div>
        <form action={faqAction} className="compact-form">
          <label className="field"><span>Question</span><input name="question" maxLength={500} placeholder="What do customers usually ask?" required />{faqState.fieldErrors?.question?.map((error) => <small className="field-error" key={error}>{error}</small>)}</label>
          <label className="field"><span>Answer</span><textarea name="answer" rows={5} maxLength={20000} placeholder="Write the approved answer…" required />{faqState.fieldErrors?.answer?.map((error) => <small className="field-error" key={error}>{error}</small>)}</label>
          <FormMessage state={faqState} />
          <button className="button button-primary" disabled={faqPending}>{faqPending ? "Embedding…" : "Add FAQ"}</button>
        </form>
      </article>
    </div>
  );
}
