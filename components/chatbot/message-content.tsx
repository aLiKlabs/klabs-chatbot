import { Fragment } from "react";

function inlineContent(value: string) {
  return value.split(/(\*\*[^*]+\*\*)/gu).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    return <Fragment key={index}>{part}</Fragment>;
  });
}

/** Renders the small, safe Markdown subset the assistant is allowed to use. */
export function MessageContent({ content }: { content: string }) {
  return (
    <div className="chat-markdown">
      {content.split("\n").map((line, index) => {
        const bullet = line.match(/^\s*[-*]\s+(.+)$/u);
        const numbered = line.match(/^\s*(\d+)\.\s+(.+)$/u);
        if (bullet) return <div className="chat-markdown-item" key={index}><span>•</span><div>{inlineContent(bullet[1])}</div></div>;
        if (numbered) return <div className="chat-markdown-item" key={index}><span>{numbered[1]}.</span><div>{inlineContent(numbered[2])}</div></div>;
        if (!line.trim()) return <div className="chat-markdown-gap" key={index} />;
        return <div key={index}>{inlineContent(line)}</div>;
      })}
    </div>
  );
}
