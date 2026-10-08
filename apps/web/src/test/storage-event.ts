/**
 * A `storage` event carrying a `key`, built without the constructor's init dictionary. The
 * ordinary `new StorageEvent('storage', { key })` is what a reader expects, but CodeQL models the
 * constructor as one-argument and flags the second as "superfluous"; defining the property on a
 * plain `Event` keeps the listener under test real and the alert out.
 */
export function storageEvent(key: string): StorageEvent {
  const event = new Event('storage');
  Object.defineProperty(event, 'key', { value: key });
  return event as StorageEvent;
}
