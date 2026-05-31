const fileQueues = new Map<string, Promise<void>>();

export async function withSecurityFileQueue<T>(filePath: string, operation: () => T | Promise<T>): Promise<T> {
  const previous = fileQueues.get(filePath) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>(resolve => {
    release = resolve;
  });

  const queued = previous.catch(() => undefined).then(() => current);
  fileQueues.set(filePath, queued);

  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release();
    if (fileQueues.get(filePath) === queued) {
      fileQueues.delete(filePath);
    }
  }
}
