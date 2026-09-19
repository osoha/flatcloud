import { expect, test } from "@playwright/test";
import { GoogleDriveFileStorage, GOOGLE_DRIVE_FOLDER_MIME, type DriveFile } from "../lib/storage/google-drive";
import { createGoogleDriveStorage, requiresSandboxDrive, SandboxDriveScopeError, SandboxGoogleDriveFileStorage } from "../lib/storage/sandbox-google-drive";
const env = { GOOGLE_DRIVE_CLIENT_ID: "test", GOOGLE_DRIVE_CLIENT_SECRET: "test", GOOGLE_DRIVE_REFRESH_TOKEN: "test", GOOGLE_DRIVE_ROOT_FOLDER_ID: "sandbox", GOOGLE_DRIVE_SANDBOX_ROOT_FOLDER_ID: "sandbox" };
function fixture() {
  const folder = (id: string, parent?: string): DriveFile => ({ id, name: id, mimeType: GOOGLE_DRIVE_FOLDER_MIME, parents: parent ? [parent] : [], trashed: false });
  const files: Record<string, DriveFile> = { sandbox: folder("sandbox", "shared-parent"), child: folder("child", "sandbox"), other: folder("other", "sandbox"), production: folder("production", "shared-parent"), "shared-parent": folder("shared-parent"), contract: { id: "contract", parents: ["production"], mimeType: "application/pdf" }, photo: { id: "photo", parents: ["child"], mimeType: "image/png" }, shortcut: { id: "shortcut", parents: ["child"], mimeType: "application/vnd.google-apps.shortcut" }, cycle: folder("cycle", "cycle") };
  const calls: Array<{ url: string; method: string; body: string }> = [];
  const storage = new SandboxGoogleDriveFileStorage(env, async (input, init) => {
    const url = new URL(String(input)), method = init?.method || "GET";
    calls.push({ url: String(input), method, body: typeof init?.body === "string" ? init.body : "" });
    const id = decodeURIComponent(url.pathname.split("/").pop()!);
    if (method === "GET" && url.searchParams.get("alt") === "media") return new Response(new Uint8Array([7, 8]));
    if (method === "GET") return files[id] ? Response.json(files[id]) : new Response(null, { status: 404 });
    if (method === "POST") return Response.json({ id: "created" });
    if (method === "PATCH") return Response.json(files[id]);
    throw new Error("Unexpected destructive request");
  });
  (storage as unknown as { auth: { getAccessToken(): Promise<string> } }).auth = { getAccessToken: async () => "fake" };
  return { storage, calls, files };
}
test("R24 H: sandbox identity fails closed without matching root; ordinary OAuth factory is preserved", () => {
  const { GOOGLE_DRIVE_SANDBOX_ROOT_FOLDER_ID: _, ...ordinary } = env;
  expect(createGoogleDriveStorage(ordinary)).toBeInstanceOf(GoogleDriveFileStorage);
  expect(createGoogleDriveStorage(ordinary)).not.toBeInstanceOf(SandboxGoogleDriveFileStorage);
  for (const detected of [{ APP_URL: "https://flatcloud-ux-sandbox.onrender.com" }, { RENDER_SERVICE_NAME: "flatcloud-ux-sandbox" }, { RENDER_EXTERNAL_HOSTNAME: "flatcloud-ux-sandbox.onrender.com" }]) {
    expect(requiresSandboxDrive(detected)).toBe(true);
    expect(() => createGoogleDriveStorage({ ...ordinary, ...detected })).toThrow(SandboxDriveScopeError);
  }
  expect(() => createGoogleDriveStorage({ ...env, GOOGLE_DRIVE_ROOT_FOLDER_ID: "production" })).toThrow(SandboxDriveScopeError);
});
for (const operation of ["read", "upload", "rename", "move-in", "move-out", "create-folder", "list", "delete"] as const) {
  test(`R24 H: ${operation} cannot cross the sandbox root`, async () => {
    const { storage, calls } = fixture();
    const operations = { read: () => storage.getObject("contract"), upload: () => storage.putObject({ key: "test", folderId: "production", body: new Uint8Array([1]), contentType: "x" }), rename: () => storage.renameFile("contract", "test"), "move-in": () => storage.moveFile("contract", "child", ["child"]), "move-out": () => storage.moveFile("photo", "production", ["production"]), "create-folder": () => storage.createFolder("test", "production"), list: () => storage.listFoldersByName("test", "production"), delete: () => storage.deleteObject("contract") };
    await expect(operations[operation]()).rejects.toThrow(SandboxDriveScopeError);
    expect(calls.every(call => call.method === "GET" && !call.url.includes("alt=media"))).toBe(true);
  });
}
test("R24 H: uploads require a folder; shortcuts, missing files and cyclic ancestry fail closed", async () => {
  const { storage, calls } = fixture();
  await expect(storage.putObject({ key: "test", body: new Uint8Array([1]), contentType: "x" })).rejects.toThrow(SandboxDriveScopeError);
  expect(calls).toHaveLength(0);
  for (const id of ["shortcut", "missing", "cycle"]) await expect(storage.getObject(id)).rejects.toThrow(SandboxDriveScopeError);
  expect(calls.every(call => call.method === "GET" && !call.url.includes("alt=media"))).toBe(true);
});
test("R24 H: allowed upload/read/move uses actual parents and never mutates the root", async () => {
  const { storage, calls } = fixture();
  expect(await storage.getObject("photo")).toEqual(new Uint8Array([7, 8]));
  expect(await storage.putObject({ key: "test", folderId: "child", body: new Uint8Array([1]), contentType: "x" })).toEqual({ key: "created" });
  await storage.moveFile("photo", "other", ["production"]);
  const move = new URL(calls.find(call => call.method === "PATCH")!.url);
  expect(move.searchParams.get("removeParents")).toBe("child");
  expect(move.searchParams.get("addParents")).toBe("other");
  await expect(storage.renameFile("sandbox", "renamed")).rejects.toThrow(SandboxDriveScopeError);
  await expect(storage.moveFile("sandbox", "child")).rejects.toThrow(SandboxDriveScopeError);
});
test("R24 H: cleanup retains files and rechecks ancestry after external moves", async () => {
  const { storage, calls, files } = fixture();
  await storage.deleteObject("photo");
  expect(calls.every(call => call.method === "GET")).toBe(true);
  files.photo.parents = ["production"];
  await expect(storage.getObject("photo")).rejects.toThrow(SandboxDriveScopeError);
  await expect(storage.deleteObject("photo")).rejects.toThrow(SandboxDriveScopeError);
  expect(calls.every(call => call.method === "GET")).toBe(true);
});
