/** WebKitGTK has no OPFS sync access handles, so on Linux the XMTP workers keep their files through the app's `opfs://`. */

const BASE = "opfs://localhost";

type Kind = "file" | "directory";
type Params = Record<string, string | number>;

const ERRORS: Record<number, string> = {
  404: "NotFoundError",
  409: "TypeMismatchError",
  412: "InvalidModificationError",
};

// Always POST: WebKit answers a repeated GET to a custom scheme from its cache, with stale bytes.
function request(op: string, params: Params, body?: Uint8Array): XMLHttpRequest {
  const query = new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)]));
  const xhr = new XMLHttpRequest();
  xhr.open("POST", `${BASE}/${op}?${query}`, false);
  xhr.responseType = "arraybuffer";
  xhr.send(body ?? null);
  if (xhr.status !== 200) {
    const message = xhr.response ? new TextDecoder().decode(xhr.response as ArrayBuffer) : `opfs ${op} failed`;
    throw new DOMException(message, ERRORS[xhr.status] ?? "UnknownError");
  }
  return xhr;
}

const text = (xhr: XMLHttpRequest) => new TextDecoder().decode(xhr.response as ArrayBuffer);
const join = (parent: string, name: string) => (parent ? `${parent}/${name}` : name);

function checkName(name: string): void {
  if (!name || name === "." || name === ".." || /[/\\\0]/.test(name)) throw new TypeError(`Invalid name: ${name}`);
}

function bytesOf(buffer: ArrayBufferView | ArrayBuffer): Uint8Array {
  return buffer instanceof ArrayBuffer
    ? new Uint8Array(buffer)
    : new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

/** One open handle per file, as OPFS allows; a terminated worker's lock goes with it, as its handles would. */
function holdExclusively(path: string): Promise<() => void> {
  return new Promise((resolve, reject) => {
    void navigator.locks.request(`statim-opfs:${path}`, { ifAvailable: true }, (lock) => {
      if (!lock) {
        reject(new DOMException(`${path} has another open access handle`, "NoModificationAllowedError"));
        return;
      }
      return new Promise<void>((release) => resolve(release));
    });
  });
}

class AccessHandle {
  private position = 0;
  private closed = false;

  constructor(
    private readonly path: string,
    private readonly release: () => void,
  ) {}

  read(buffer: ArrayBufferView | ArrayBuffer, options?: { at?: number }): number {
    const target = bytesOf(buffer);
    const at = options?.at ?? this.position;
    const data = new Uint8Array(
      request("read", { path: this.open(), at, length: target.byteLength }).response as ArrayBuffer,
    );
    target.set(data);
    this.position = at + data.byteLength;
    return data.byteLength;
  }

  write(buffer: ArrayBufferView | ArrayBuffer, options?: { at?: number }): number {
    const source = bytesOf(buffer);
    const at = options?.at ?? this.position;
    // The request takes a copy, so a view into wasm memory is never handed over.
    const written = Number(text(request("write", { path: this.open(), at }, source.slice())));
    this.position = at + written;
    return written;
  }

  getSize(): number {
    return Number(text(request("size", { path: this.open() })));
  }

  truncate(size: number): void {
    request("truncate", { path: this.open(), size });
    this.position = Math.min(this.position, size);
  }

  flush(): void {
    request("flush", { path: this.open() });
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.release();
  }

  private open(): string {
    if (this.closed) throw new DOMException("AccessHandle is closed", "InvalidStateError");
    return this.path;
  }
}

class FileHandle {
  readonly kind = "file";

  constructor(
    readonly name: string,
    private readonly path: string,
  ) {}

  async createSyncAccessHandle(): Promise<AccessHandle> {
    return new AccessHandle(this.path, await holdExclusively(this.path));
  }

  async getFile(): Promise<File> {
    const size = Number(text(request("size", { path: this.path })));
    const data = request("read", { path: this.path, at: 0, length: size }).response as ArrayBuffer;
    return new File([data], this.name);
  }
}

class DirectoryHandle {
  readonly kind = "directory";

  constructor(
    readonly name: string,
    private readonly path: string,
  ) {}

  async getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<DirectoryHandle> {
    checkName(name);
    const path = join(this.path, name);
    if (options?.create) request("directory", { path });
    else if (text(request("kind", { path })) !== "directory") {
      throw new DOMException(`${name} is not a directory`, "TypeMismatchError");
    }
    return new DirectoryHandle(name, path);
  }

  async getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandle> {
    checkName(name);
    const path = join(this.path, name);
    if (options?.create) request("file", { path });
    else if (text(request("kind", { path })) !== "file") {
      throw new DOMException(`${name} is not a file`, "TypeMismatchError");
    }
    return new FileHandle(name, path);
  }

  async removeEntry(name: string, options?: { recursive?: boolean }): Promise<void> {
    checkName(name);
    request("remove", { path: join(this.path, name), recursive: options?.recursive ? 1 : 0 });
  }

  async *entries(): AsyncGenerator<[string, FileHandle | DirectoryHandle]> {
    const listed = JSON.parse(text(request("list", { path: this.path }))) as [string, Kind][];
    for (const [name, kind] of listed) {
      const path = join(this.path, name);
      yield [name, kind === "directory" ? new DirectoryHandle(name, path) : new FileHandle(name, path)];
    }
  }

  async *keys(): AsyncGenerator<string> {
    for await (const [name] of this.entries()) yield name;
  }

  async *values(): AsyncGenerator<FileHandle | DirectoryHandle> {
    for await (const [, handle] of this.entries()) yield handle;
  }

  [Symbol.asyncIterator]() {
    return this.entries();
  }
}

/** In a Linux worker, `navigator.storage` hands out the app's files in place of WebKit's OPFS. */
export function installLinuxOpfs(): void {
  const scope = globalThis as { WorkerGlobalScope?: unknown; navigator?: Navigator };
  if (scope.WorkerGlobalScope === undefined || !scope.navigator || !/Linux/.test(scope.navigator.userAgent)) return;
  const root = new DirectoryHandle("", "");
  Object.defineProperty(scope.navigator, "storage", {
    configurable: true,
    value: {
      getDirectory: async () => root,
      persist: async () => true,
      persisted: async () => true,
    },
  });
}
