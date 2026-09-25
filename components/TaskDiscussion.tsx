"use client";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { CircleHelp, CornerUpLeft } from "lucide-react";
export function TaskDiscussion({ composer, children }: { composer: ReactNode; children: ReactNode }) {
  const [commentsOnly, setCommentsOnly] = useState(false);
  return <div className={commentsOnly ? "task-discussion task-comments-only" : "task-discussion"}>
    <div className="card-head"><div className="discussion-title"><h2>Komentáře a aktivita</h2><Link href="/metodika?view=chapters&q=Týmové%20úkoly" aria-label="Nápověda ke komentářům a zmínkám" title="Nápověda v metodice"><CircleHelp size={20}/></Link></div><label className="discussion-filter"><input type="checkbox" role="switch" checked={commentsOnly} onChange={e => setCommentsOnly(e.target.checked)}/>Jen komentáře</label></div>
    {composer}{children}
  </div>;
}
export function TaskReplyButton({ taskId, userId }: { taskId: string; userId: string }) {
  return <button type="button" className="task-reply" onClick={() => window.dispatchEvent(new CustomEvent("flatberry:task-reply", { detail: { taskId, userId } }))}><CornerUpLeft size={19} aria-hidden="true"/>Odpovědět</button>;
}
