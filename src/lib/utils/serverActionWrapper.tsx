export async function serverActionWrapper<T>(
  promise: Promise<{ error?: string; data?: T }>
): Promise<T> {
  const { error, data } = await promise;
  if (error) {
    throw error;
  }

  return data ?? ({} as T);
}
