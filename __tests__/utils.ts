import { Page } from '@playwright/test';

export function log(message: string, ...rest: unknown[]): void {
  console.log(message, ...rest);
}

export function debugPageLogs(page: Page): void {
  page.on('console', async (msg) => {
    const msgs = [];
    for (let i = 0; i < msg.args().length; ++i) {
      msgs.push(await msg.args()[i].jsonValue());
    }
    log(`[console.${msg.type()}]\t=> ${msg.text()}`);
  });
}
