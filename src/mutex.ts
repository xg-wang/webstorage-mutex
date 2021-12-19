/**
 * @public
 */
export interface MutexOptions {
  lockPrefix: string;
  repeatInterval: number;
  repeatTimeout: number;
  /**
   * The delay time in ALur and Taubenfeld's lock algorithm, assumed to be long
   * enough for any tab to complete localStorage getItem and setItem
   */
  delayTime: number;
}

/**
 * Detect localStorage access
 * {@link https://github.com/Modernizr/Modernizr/blob/28d969e85cd8ebe5854f6296fd6aace241f6bdf7/feature-detects/storage/localstorage.js}
 */
function supportLocalStorage(): boolean {
  try {
    const tester = '__webstorage-mutex__';
    localStorage.setItem(tester, tester);
    localStorage.removeItem(tester);
    return true;
  } catch (e) {
    return false;
  }
}

const SUPPORT_LOCAL_STORAGE = supportLocalStorage();

/**
Execute callback that accesses Web Storage across tabs.

@remarks
Alur and Taubenfeld's lock
https://www.cs.rochester.edu/research/synchronization/pseudocode/fastlock.html

Code to be executed by process i. Variables Y and Z are initialized to free and
0, respectively.
The delay at line 6 is assumed to be long enough for any process that has
already read Y = free in line 3 to complete line 4, and any process that has
already set Y in line 4 to complete line 5 and (if not delayed) line 11 (that is
the time required to service 2 memory references by all other processors in the
system).
```
  1:     start:
  2:        X := i
  3:        repeat until Y = free
  4:        Y := i
  5:        if X <> i
  6:           { delay }
  7:           if Y <> i
  8:              goto start
  9:           repeat until Z = 0
  10:       else
  11:          Z := 1
  12:    { critical section }
  13:       Z := 0
  14:       if Y = i
  15:          Y := free
  16:    { non-critical section }
  17:       goto start
```
@public
*/
export function mutex<R>(
  callback: () => R,
  options: MutexOptions = {
    lockPrefix: 'webstorage-mutex',
    repeatInterval: 50,
    repeatTimeout: 1000,
    delayTime: 50,
  }
): Promise<R> {
  if (!SUPPORT_LOCAL_STORAGE) {
    return Promise.reject(new Error('localStorage is not supported'));
  }

  const { lockPrefix, repeatInterval, repeatTimeout, delayTime } = options;

  const id = generateRandomID();
  const lockX = `${lockPrefix}:X`;
  const lockY = `${lockPrefix}:Y`;
  const lockZ = `${lockPrefix}:Z`;

  const handleCriticalSection = (): R => {
    // start critical section
    debug(() => `[${id}] start critical section`);
    const result = callback();
    // end critical section
    debug(() => `[${id}] free Z`);
    setFree(lockZ);
    if (get(lockY) === id) {
      debug(() => `[${id}] free Y`);
      setFree(lockY);
    }
    return result;
  };

  const start = (): Promise<R> => {
    debug(() => `[${id}] start, set X`);
    set(lockX, id);
    return repeatUntil(() => !get(lockY), repeatInterval, repeatTimeout)
      .then(() => {
        debug(() => `[${id}] lock Y`);
        set(lockY, id);
        if (get(lockX) !== id) {
          debug(() => `[${id}] X<>i`);
          return delay(delayTime).then(() => {
            if (get(lockY) !== id) {
              debug(() => `[${id}] Y<>i, goto start`);
              return start();
            } else {
              return repeatUntil(
                () => !get(lockZ),
                repeatInterval,
                repeatTimeout
              ).then(() => handleCriticalSection());
            }
          });
        } else {
          debug(() => `[${id}] set Z`);
          set(lockZ, '1');
          // Sync write to localLStorage might not be updated to other tabs.
          // Wait a macro task can ensure the the order.
          return delay(1).then(() => handleCriticalSection());
        }
      })
      .catch((e) => {
        // repeatUntil timeout
        debug(() => `[${id}] timeout, clear Z and Y`);
        setFree(lockZ);
        setFree(lockY);
        throw e;
      });
  };

  return start();
}

function repeatUntil(
  predicate: () => boolean,
  interval: number,
  timeout: number
): Promise<void> {
  const startTime = Date.now();
  return new Promise((res, rej) => {
    const waiter = (): void => {
      predicate()
        ? res()
        : Date.now() - startTime > timeout
        ? rej(new Error('mutex timeout'))
        : setTimeout(waiter, Math.round(interval * (0.5 + Math.random())));
    };
    // Sync write to localLStorage might not be updated to other tabs.
    // Wait a macro task can ensure the the order.
    setTimeout(waiter, 1);
  });
}

function delay(delay: number): Promise<void> {
  return new Promise((res) => setTimeout(res, delay));
}

function get(key: string): string | null {
  return window.localStorage.getItem(key);
}

function set(key: string, value: string): void {
  window.localStorage.setItem(key, value);
}

function setFree(key: string): void {
  window.localStorage.removeItem(key);
}

function generateRandomID(): string {
  return `${String(Date.now())}|${Math.round(Math.random() * 1e5)}`;
}

function debug(data: () => string): void {
  if ('__DEBUG_WEBSTORAGE_MUTEX' in window) {
    console.debug(data());
  }
}
