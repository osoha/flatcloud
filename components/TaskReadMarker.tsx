"use client";

import { useEffect } from "react";

export function TaskReadMarker({ taskId }: { taskId: string }) {
  useEffect(() => { void fetch(`/api/tasks/${taskId}/read`, { method: "POST" }); }, [taskId]);
  return null;
}
