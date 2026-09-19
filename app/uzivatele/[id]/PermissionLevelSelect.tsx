"use client";

import { useId, useState } from "react";
import styles from "./user-access.module.css";

type PermissionValue = "" | "VIEW" | "EDIT" | "ADMIN";

const permissionCopy: Record<PermissionValue, { label: string; detail: string }> = {
  "": {
    label: "Bez přístupu",
    detail: "Uživatel tuto nemovitost nebo jednotku neuvidí.",
  },
  VIEW: {
    label: "Čtení",
    detail: "Může data, dokumenty a přehledy zobrazit, ale nemůže je měnit.",
  },
  EDIT: {
    label: "Zápis",
    detail: "Může data zobrazovat a upravovat, ale nemůže spravovat přístupy ostatních uživatelů.",
  },
  ADMIN: {
    label: "Plná správa",
    detail: "Nejvyšší oprávnění v přiděleném rozsahu; u objektu zahrnuje také správu uživatelů a jejich práv.",
  },
};

export function PermissionLevelSelect({
  name,
  defaultValue = "",
  ariaLabel,
}: {
  name: string;
  defaultValue?: string;
  ariaLabel: string;
}) {
  const normalized = (defaultValue in permissionCopy ? defaultValue : "") as PermissionValue;
  const [value, setValue] = useState<PermissionValue>(normalized);
  const id = useId();

  return (
    <div className={styles.permissionControl}>
      <label htmlFor={id} className={styles.permissionLabel}>Úroveň oprávnění</label>
      <select
        id={id}
        name={name}
        defaultValue={normalized}
        aria-label={ariaLabel}
        onChange={(event) => setValue(event.target.value as PermissionValue)}
      >
        {(Object.keys(permissionCopy) as PermissionValue[]).map((option) => (
          <option value={option} key={option || "none"}>{permissionCopy[option].label}</option>
        ))}
      </select>
      <small className={styles.permissionDetail}>{permissionCopy[value].detail}</small>
    </div>
  );
}
