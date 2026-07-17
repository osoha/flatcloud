type AvatarUser = {
  id: string;
  name: string;
  avatarMimeType?: string | null;
  updatedAt?: Date | string;
};

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).map((part) => part[0]).slice(0, 2).join("").toUpperCase() || "FC";
}

export function UserAvatar({ user, size = "md", className = "" }: { user: AvatarUser; size?: "sm" | "md" | "lg"; className?: string }) {
  const classes = `avatar avatar-${size} ${className}`.trim();
  if (!user.avatarMimeType) return <div className={classes}>{initials(user.name)}</div>;
  const version = user.updatedAt ? new Date(user.updatedAt).getTime() : "1";
  return <div className={classes}><img src={`/api/users/${user.id}/avatar?v=${version}`} alt={`Avatar uživatele ${user.name}`}/></div>;
}
