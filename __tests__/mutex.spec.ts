/* eslint-disable no-empty-pattern */
import { BrowserContext, expect, test as baseTest } from '@playwright/test';
import createTestServer from 'create-test-server';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { BrowserType, Page } from 'playwright';
import { removeFolders } from 'playwright-core/lib/utils/utils';

import type { mutex } from '../src/';
import { debugPageLogs } from './utils';

declare global {
  interface Window {
    mutex: typeof mutex;
    syncSleep: (ms: number) => void;
  }
}

const script = {
  type: 'module',
  content: `
${fs.readFileSync(path.join(__dirname, '..', 'dist', 'bundle.esm.js'), 'utf8')}
function syncSleep(ms) {
  const startTime = Date.now();
  while (Date.now() - startTime < ms) {
    '*'.repeat(100).repeat(100);
  }
  return;
}
window.mutex = mutex;
window.syncSleep = syncSleep;
window.__DEBUG_WEBSTORAGE_MUTEX = true;
`,
};

type TestFixtures = {
  createUserDataDir: () => Promise<string>;
  launchPersistent: (
    options?: Parameters<BrowserType['launchPersistentContext']>[1]
  ) => Promise<{ context: BrowserContext; page: Page }>;
};

type WorkerFixtures = {
  browserType: BrowserType;
};

const test = baseTest.extend<TestFixtures, WorkerFixtures>({
  browserType: [
    async ({ _browserType }: any, run) => {
      await run(_browserType);
    },
    { scope: 'worker' },
  ],

  createUserDataDir: async ({}, run) => {
    const dirs: string[] = [];
    await run(async () => {
      const dir = await fs.promises.mkdtemp(
        path.join(os.tmpdir(), 'mutex-test-')
      );
      dirs.push(dir);
      return dir;
    });
    await removeFolders(dirs);
  },

  launchPersistent: async ({ createUserDataDir, browserType }, run) => {
    let persistentContext: BrowserContext | undefined;
    await run(async (options) => {
      if (persistentContext)
        throw new Error('can only launch one persistent context');
      const userDataDir = await createUserDataDir();
      persistentContext = await browserType.launchPersistentContext(
        userDataDir,
        {
          ...options,
        }
      );
      const page = persistentContext.pages()[0];
      return { context: persistentContext, page };
    });
    if (persistentContext) await persistentContext.close();
  },
});

test.describe.parallel('mutex', () => {
  let server: any;

  test.beforeEach(async ({ page }) => {
    server = await createTestServer();
    server.get('/', (_request, response) => {
      response.end('hello!');
    });
    await page.goto(server.url);
    await page.addScriptTag(script);
    debugPageLogs(page);
  });

  test('test playwright multi tab support', async ({ context, page }) => {
    const result = await page.evaluate(() => {
      window.localStorage.setItem('test-0', 'hello world');
      return window.localStorage.getItem('test-0');
    });
    const page2 = await context.newPage();
    await page2.goto(server.url);
    const result2 = await page2.evaluate(() => {
      return window.localStorage.getItem('test-0');
    });

    expect([result, result2]).toStrictEqual(['hello world', 'hello world']);
  });

  test('single page write and read', async ({ page }) => {
    const result = await page.evaluate(() => {
      return window.mutex(() => {
        window.localStorage.setItem('test-1', 'hello world');
        return window.localStorage.getItem('test-1');
      });
    });
    expect(result).toBe('hello world');
    const locker = await page.evaluate(() => {
      return window.localStorage.getItem('webstorage-mutex:X');
    });
    expect(locker).not.toBeNull();
  });

  test('multiple tabs read-modify-write should not see stale', async ({
    context,
    page,
  }) => {
    const pageFunc = (tabName: string): Promise<string> => {
      return window.mutex(
        () => {
          let v = window.localStorage.getItem('test-2');
          console.debug(`[Before][${tabName}][${Date.now()}]v=${v}`);
          if (!v) {
            v = '*';
          } else {
            v = v + '*';
          }
          // artificial slowing the tab so the write is later than the start of
          // attempting to acquire the lock on another tab
          window.syncSleep(5_000);
          console.debug(`[After][${tabName}][${Date.now()}]v=${v}`);
          window.localStorage.setItem('test-2', v);
          return v;
        },
        {
          lockPrefix: 'webstorage-mutex',
          repeatInterval: 50,
          repeatTimeout: 15_000,
          delayTime: 50,
        }
      );
    };
    const page2 = await context.newPage();
    await page2.goto(server.url);
    await page2.addScriptTag(script);
    debugPageLogs(page2);
    const results = await Promise.all([
      page.evaluate(pageFunc, 'tab1'),
      page2.evaluate(pageFunc, 'tab2'),
    ]);
    console.log(results);
    results.sort((a, b) => a.length - b.length);
    expect(results).toStrictEqual(['*', '**']);
  });

  test('multiple tabs read-delete should not see stale', async ({
    context,
    page,
  }) => {
    const pageFunc = (tabName: string): Promise<string> => {
      return window.mutex(
        () => {
          const v = window.localStorage.getItem('test-3');
          console.debug(`[Before][${tabName}][${Date.now()}]v=${v}`);
          // artificial slowing the tab so the write is later than the start of
          // attempting to acquire the lock on another tab
          window.syncSleep(5_000);
          console.debug(`[After][${tabName}][${Date.now()}]v=null`);
          window.localStorage.removeItem('test-3');
          return String(v);
        },
        {
          lockPrefix: 'webstorage-mutex',
          repeatInterval: 50,
          repeatTimeout: 15_000,
          delayTime: 50,
        }
      );
    };
    const page2 = await context.newPage();
    await page2.goto(server.url);
    await page2.addScriptTag(script);
    debugPageLogs(page2);
    const initialValue = await page.evaluate(() => {
      window.localStorage.setItem('test-3', '1');
      return window.localStorage.getItem('test-3');
    });
    expect(initialValue).toBe('1');
    const results = await Promise.all([
      page.evaluate(pageFunc, 'tab1'),
      page2.evaluate(pageFunc, 'tab2'),
    ]);
    console.log(results);
    results.sort((a, b) => a.length - b.length);
    expect(results).toStrictEqual(['1', 'null']);
  });

  test('Throws if critical section timeout', async ({ context, page }) => {
    const pageFunc = (tabName: string): Promise<string> => {
      return window
        .mutex(
          () => {
            let v = window.localStorage.getItem('test-2');
            console.debug(`[Before][${tabName}][${Date.now()}]v=${v}`);
            if (!v) {
              v = '*';
            } else {
              v = v + '*';
            }
            // artificial slowing the tab so the write is later than the start of
            // attempting to acquire the lock on another tab
            window.syncSleep(10_000);
            console.debug(`[After][${tabName}][${Date.now()}]v=${v}`);
            window.localStorage.setItem('test-2', v);
            return v;
          },
          {
            lockPrefix: 'webstorage-mutex',
            repeatInterval: 50,
            repeatTimeout: 5_000,
            delayTime: 50,
          }
        )
        .catch((reason) => {
          return reason.message;
        });
    };
    const page2 = await context.newPage();
    await page2.goto(server.url);
    await page2.addScriptTag(script);
    debugPageLogs(page2);
    const results = await Promise.all([
      page.evaluate(pageFunc, 'tab1'),
      page2.evaluate(pageFunc, 'tab2'),
    ]);
    results.sort((a, b) => a.length - b.length);
    expect(results).toStrictEqual(['*', 'mutex timeout']);
  });
});
