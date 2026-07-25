import { test, expect } from '@playwright/test';

test('overview table layout in Firefox', async ({ page }) => {
  await page.goto('http://localhost:5173/#overview');
  await page.waitForSelector('.overview-row', { timeout: 10000 });

  const tableWrap = page.locator('#overview').first();
  await tableWrap.screenshot({ path: '/tmp/overview-firefox.png' });

  const header = page.locator('.overview-header').first();
  const firstRow = page.locator('.overview-row').first();

  const headerBox = await header.boundingBox();
  const rowBox = await firstRow.boundingBox();

  console.log('HEADER BBOX:', JSON.stringify(headerBox));
  console.log('ROW BBOX:', JSON.stringify(rowBox));

  if (headerBox && rowBox) {
    const gap = rowBox.y - (headerBox.y + headerBox.height);
    console.log(`Header bottom: ${(headerBox.y + headerBox.height).toFixed(0)}, Row top: ${rowBox.y.toFixed(0)}, Gap: ${gap.toFixed(0)}`);

    if (gap < 5) {
      console.error('BUG: First row overlaps header! Gap is only', gap, 'px');
    } else {
      console.log('PASS: Row is below header with', gap, 'px gap');
    }
  }
});
