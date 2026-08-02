import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import { cleanExtractedText } from "@/lib/ingestion/clean";

export interface ExtractedSection {
  text: string;
  pageNumber: number | null;
}

export interface ExtractedDocument {
  title: string | null;
  sections: ExtractedSection[];
}

export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;

export type SupportedDocumentType = "pdf" | "docx" | "text" | "markdown";

const MIME_TYPES: Record<SupportedDocumentType, string[]> = {
  pdf: ["application/pdf"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  text: ["text/plain"],
  markdown: ["text/markdown", "text/plain", "text/x-markdown"],
};

const EXTENSIONS: Record<string, SupportedDocumentType> = {
  ".pdf": "pdf",
  ".docx": "docx",
  ".txt": "text",
  ".md": "markdown",
  ".markdown": "markdown",
};

export function detectDocumentType(filename: string, mimeType: string): SupportedDocumentType {
  const extension = filename.toLowerCase().match(/\.[^.]+$/)?.[0] ?? "";
  const type = EXTENSIONS[extension];
  if (!type || !MIME_TYPES[type].includes(mimeType.toLowerCase())) {
    throw new Error("Only PDF, DOCX, TXT, and Markdown files are supported.");
  }
  return type;
}

function validateSignature(data: Uint8Array, type: SupportedDocumentType) {
  if (type === "pdf" && new TextDecoder().decode(data.slice(0, 5)) !== "%PDF-") {
    throw new Error("The file does not contain a valid PDF signature.");
  }
  if (type === "docx" && !(data[0] === 0x50 && data[1] === 0x4b)) {
    throw new Error("The file does not contain a valid DOCX archive.");
  }
}

export async function extractDocument(
  data: Uint8Array,
  filename: string,
  mimeType: string,
): Promise<ExtractedDocument> {
  if (!data.byteLength) throw new Error("The uploaded document is empty.");
  if (data.byteLength > MAX_DOCUMENT_BYTES) throw new Error("The document exceeds 20 MB.");
  const type = detectDocumentType(filename, mimeType);
  validateSignature(data, type);

  if (type === "pdf") {
    const parser = new PDFParse({ data, stopAtErrors: true });
    try {
      const [textResult, infoResult] = await Promise.all([parser.getText(), parser.getInfo()]);
      const sections = textResult.pages
        .map((page) => ({ text: cleanExtractedText(page.text), pageNumber: page.num }))
        .filter(({ text }) => Boolean(text));
      if (!sections.length) throw new Error("No readable text was found in the PDF.");
      const info = infoResult.info as Record<string, unknown> | undefined;
      return {
        title: typeof info?.Title === "string" ? info.Title : null,
        sections,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "PDF extraction failed";
      if (/password/i.test(message)) throw new Error("Password-protected PDFs are not supported.");
      throw new Error(`The PDF could not be extracted: ${message}`);
    } finally {
      await parser.destroy();
    }
  }

  if (type === "docx") {
    try {
      const result = await mammoth.extractRawText({ buffer: Buffer.from(data) });
      const text = cleanExtractedText(result.value);
      if (!text) throw new Error("No readable text was found in the DOCX file.");
      return { title: null, sections: [{ text, pageNumber: null }] };
    } catch (error) {
      const message = error instanceof Error ? error.message : "DOCX extraction failed";
      throw new Error(`The DOCX file could not be extracted: ${message}`);
    }
  }

  try {
    const text = cleanExtractedText(new TextDecoder("utf-8", { fatal: true }).decode(data));
    if (!text) throw new Error("No readable text was found in the document.");
    return { title: null, sections: [{ text, pageNumber: null }] };
  } catch {
    throw new Error("The text document is not valid UTF-8 or is corrupted.");
  }
}
