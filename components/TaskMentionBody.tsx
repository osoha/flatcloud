import { parseMentions } from "@/lib/task-discussion-shared";
export function TaskMentionBody({ body, mentions }: { body: string; mentions: unknown }) {
  let parsed;
  try { parsed = parseMentions(mentions || [], body); } catch { return <p>{body}</p>; }
  let start = 0;
  const parts = parsed.map((mention, index) => { const prefix = body.slice(start, mention.start); start = mention.end; return <span key={index}>{prefix}<mark className="task-mention">{body.slice(mention.start, mention.end)}</mark></span>; });
  return <p>{parts}{body.slice(start)}</p>;
}
